"""
Place suggestions for the workplace and preferred-area inputs.

Typing a free-text location and being told afterwards that it could not be found
is the wrong shape of interaction for a field that has to resolve to
coordinates: the user has no way of knowing what vocabulary the geocoder speaks,
so they guess, fail, and guess again. Offering the matches as they type replaces
guessing with choosing, and guarantees that whatever ends up on the persona is a
real place we have already resolved and already confirmed is in London.

Two sources, because neither covers the field alone:

  * postcodes.io autocomplete, for a part-typed postcode. Authoritative, and the
    only thing that will complete "SE1 9".
  * OpenStreetMap, bounded to a London rectangle, for everything people
    actually type — "London Bridge", "Canary Wharf", "Bethnal Green". The
    rectangle only biases the search; the London decision is made afterwards
    against the ONS region, so Watford inside the rectangle is still rejected.

Nominatim asks for at most one request a second from a given client. The cache
below is what keeps a per-keystroke field inside that, together with the
debounce in the UI — without it, eight users typing at once would have us
hammering a service that is donated.
"""
from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass

import structlog

from app.services.providers import geocode
from app.services.providers.http import client

log = structlog.get_logger()

MAX_SUGGESTIONS = 7
_MIN_QUERY = 2

# A part-typed UK postcode: an outward code, optionally with the start of the
# inward code. Anything that matches goes to postcodes.io as well as OSM.
_POSTCODE_ISH = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]?\s*\d?[A-Z]{0,2}$", re.IGNORECASE)

# OSM place classes worth offering. A "bridge" or a "station" is exactly what
# someone means by "London Bridge"; a bus stop or a postbox is not.
_USEFUL_TYPES = {
    "suburb", "neighbourhood", "quarter", "city", "town", "village", "hamlet",
    "borough", "city_district", "district", "station", "train_station",
    "bus_station", "commercial", "industrial", "retail", "bridge", "square",
    "residential", "university", "college", "hospital", "office", "attraction",
}

_CACHE_TTL_SECONDS = 600
_cache: dict[str, tuple[float, list["Place"]]] = {}
# Serialises calls to Nominatim across concurrent requests. Their usage policy
# asks for one request a second and this is a donated service, so we queue
# rather than fan out.
_nominatim_lock = asyncio.Lock()
_last_nominatim_call = 0.0


@dataclass(frozen=True)
class Place:
    label: str            # what goes on the chip: "London Bridge"
    description: str      # where it is: "Southwark · SE1 9SP"
    postcode: str
    latitude: float
    longitude: float
    district: str


def _cache_get(key: str) -> list[Place] | None:
    hit = _cache.get(key)
    if hit is None:
        return None
    stored_at, places = hit
    if time.monotonic() - stored_at > _CACHE_TTL_SECONDS:
        _cache.pop(key, None)
        return None
    return places


def _cache_put(key: str, places: list[Place]) -> None:
    # Small and bounded: this is a typeahead, not a store of record.
    if len(_cache) > 500:
        _cache.clear()
    _cache[key] = (time.monotonic(), places)


async def _nominatim(query: str) -> list[dict]:
    global _last_nominatim_call
    left, top, right, bottom = geocode.LONDON_VIEWBOX
    async with _nominatim_lock:
        wait = 1.0 - (time.monotonic() - _last_nominatim_call)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query,
                    "format": "jsonv2",
                    "countrycodes": "gb",
                    "limit": 10,
                    "viewbox": f"{left},{top},{right},{bottom}",
                    "bounded": 1,
                },
            )
        except Exception as e:
            log.warning("nominatim_suggest_failed", query=query, error=str(e))
            return []
        finally:
            _last_nominatim_call = time.monotonic()

    if resp.status_code != 200:
        return []
    try:
        return resp.json() or []
    except Exception:
        return []


async def _postcode_matches(query: str) -> list[str]:
    """Part-typed postcode → real postcodes.

    postcodes.io matches on the space-stripped form, so a typed space carries no
    weight with it. Usually that costs nothing — "E2 9" can only mean E2 9xx —
    but where the stripped form is itself a valid outward code the two readings
    collide: "SE1 9" and "SE19" are one query, and it answers SE19 1xx (Crystal
    Palace) rather than SE1 9xx (Bankside).

    Someone who typed the space told us where they think the outward code ends,
    so prefer the rows that really are formatted that way. When the collision
    means there are none — as with SE1 9 — the raw list stands: every row names
    its borough, so a user who meant Bankside can see Crystal Palace and keep
    typing.
    """
    cleaned = query.replace(" ", "").upper()
    try:
        resp = await client.get(
            f"https://api.postcodes.io/postcodes/{cleaned}/autocomplete",
            params={"limit": 50},
        )
    except Exception as e:
        log.warning("postcode_autocomplete_failed", query=query, error=str(e))
        return []
    if resp.status_code != 200:
        return []

    matches = resp.json().get("result") or []
    if " " in query.strip():
        typed = " ".join(query.split()).upper()
        as_typed = [pc for pc in matches if pc.upper().startswith(typed)]
        if as_typed:
            matches = as_typed

    # Two per outward code, so a query straddling two districts shows both
    # rather than five variations of one.
    per_outward: dict[str, int] = {}
    picked: list[str] = []
    for postcode in matches:
        outward = postcode.split(" ")[0]
        if per_outward.get(outward, 0) >= 2:
            continue
        per_outward[outward] = per_outward.get(outward, 0) + 1
        picked.append(postcode)
        if len(picked) >= 5:
            break
    return picked


def _short_label(hit: dict) -> str:
    """Nominatim's display_name is the full postal hierarchy down to the
    country. The first component is the name of the thing itself."""
    name = (hit.get("name") or "").strip()
    if name:
        return name
    return (hit.get("display_name") or "").split(",")[0].strip()


async def _places_from_postcodes(query: str) -> list[Place]:
    postcodes = await _postcode_matches(query)
    if not postcodes:
        return []

    signals = await asyncio.gather(
        *[geocode.lookup_postcode(pc) for pc in postcodes]
    )
    places = []
    for signal in signals:
        if not signal.ok or not signal.value.is_london:
            continue
        loc = signal.value
        places.append(Place(
            label=loc.postcode,
            description=" · ".join(p for p in (loc.ward, loc.district) if p),
            postcode=loc.postcode,
            latitude=loc.latitude,
            longitude=loc.longitude,
            district=loc.district,
        ))
    return places


async def _places_from_osm(query: str) -> list[Place]:
    hits = [
        h for h in await _nominatim(query)
        if h.get("type") in _USEFUL_TYPES or h.get("category") == "place"
    ][:MAX_SUGGESTIONS]
    if not hits:
        return []

    points = [(float(h["lat"]), float(h["lon"])) for h in hits]
    records = await geocode.nearest_postcodes(points)

    places: list[Place] = []
    for hit, record in zip(hits, records):
        # No nearby postcode, or one outside London: the rectangle over-reaches
        # into the Home Counties and this is where that gets corrected.
        if not record or (record.get("region") or "") != geocode.LONDON_REGION:
            continue
        district = record.get("admin_district") or ""
        postcode = record.get("postcode") or ""
        places.append(Place(
            label=_short_label(hit),
            description=" · ".join(p for p in (district, postcode) if p),
            postcode=postcode,
            latitude=float(hit["lat"]),
            longitude=float(hit["lon"]),
            district=district,
        ))
    return places


async def suggest(query: str) -> list[Place]:
    """London places matching what has been typed so far.

    An empty list is a normal answer, not a failure — it is what "Amazon UK
    LHR16" and "Manchester" both look like, and the UI says so in each case.
    """
    text = " ".join(query.split())
    if len(text) < _MIN_QUERY:
        return []

    key = text.lower()
    cached = _cache_get(key)
    if cached is not None:
        return cached

    tasks = [_places_from_osm(text)]
    if _POSTCODE_ISH.match(text):
        tasks.insert(0, _places_from_postcodes(text))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    places: list[Place] = []
    seen: set[str] = set()
    for result in results:
        if isinstance(result, BaseException):
            log.warning("place_suggest_source_failed", error=str(result))
            continue
        for place in result:
            # Nominatim returns the same place once per OSM object: "London
            # Bridge" comes back as the bridge, the road over it, and three
            # separate station entrances. Keyed on name *and* borough, because
            # that pair is exactly what the row shows — two rows a user cannot
            # tell apart are noise, and two they can are a real choice.
            fingerprint = f"{place.label.strip().lower()}|{place.district.lower()}"
            if not fingerprint or fingerprint in seen:
                continue
            seen.add(fingerprint)
            places.append(place)

    places = places[:MAX_SUGGESTIONS]
    _cache_put(key, places)
    return places
