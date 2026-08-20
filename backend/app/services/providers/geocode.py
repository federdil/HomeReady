"""
Postcode → location, via postcodes.io (free, no key).

This is the root lookup: every other provider needs either the coordinates or
one of the statistical area codes returned here. It also hands back the British
National Grid easting/northing, which lets school proximity be computed in
plain metres instead of haversine over degrees.

It is also where the product's one hard boundary is enforced. HomeReady covers
London, because TfL's journey planner does and nothing free replaces it outside
the capital. A workplace in Manchester or a preferred area in St Albans is not a
lookup that failed — it resolves perfectly well — so it has to be rejected here,
by name, rather than accepted and then quietly scored against data that does not
exist for it.
"""
from __future__ import annotations

from dataclasses import dataclass

import structlog

from app.core.signals import Signal
from app.services.providers.http import client

log = structlog.get_logger()

SOURCE = "postcodes.io"

# postcodes.io reports the ONS region, in which Greater London is exactly this
# one value — all 32 boroughs plus the City. Matching on the region rather than
# on a bounding box keeps Watford and Dartford out while keeping Upminster in.
LONDON_REGION = "London"

# Used only to *bias and bound a text search* before the authoritative region
# check below. It is a rectangle, so it over-reaches into Hertfordshire, Surrey
# and Essex — which is why nothing is accepted on the strength of it alone.
LONDON_VIEWBOX = (-0.5104, 51.7018, 0.3340, 51.2461)  # left, top, right, bottom


@dataclass(frozen=True)
class Location:
    postcode: str
    latitude: float
    longitude: float
    easting: int
    northing: int
    district: str
    ward: str
    region: str
    lsoa: str
    lsoa_code: str

    @property
    def is_london(self) -> bool:
        return self.region == LONDON_REGION


def _location_from_result(r: dict, fallback_postcode: str = "") -> Location:
    return Location(
        postcode=r.get("postcode", fallback_postcode),
        latitude=r["latitude"],
        longitude=r["longitude"],
        easting=r.get("eastings") or 0,
        northing=r.get("northings") or 0,
        district=r.get("admin_district") or "",
        ward=r.get("admin_ward") or "",
        region=r.get("region") or "",
        lsoa=r.get("lsoa") or "",
        lsoa_code=(r.get("codes") or {}).get("lsoa") or "",
    )


async def lookup_postcode(postcode: str) -> Signal[Location]:
    cleaned = postcode.replace(" ", "").upper()
    if not cleaned:
        return Signal.missing("No postcode supplied.", source=SOURCE)

    try:
        resp = await client.get(f"https://api.postcodes.io/postcodes/{cleaned}")
    except Exception as e:
        log.warning("geocode_failed", postcode=cleaned, error=str(e))
        return Signal.missing(
            "Could not reach the postcode lookup service.", source=SOURCE
        )

    if resp.status_code == 404:
        return Signal.missing(
            f"{postcode} is not a recognised UK postcode.", source=SOURCE
        )
    if resp.status_code != 200:
        return Signal.missing(
            "The postcode lookup service returned an error.", source=SOURCE
        )

    r = resp.json().get("result") or {}
    if r.get("latitude") is None or r.get("longitude") is None:
        return Signal.missing(
            f"No coordinates are published for {postcode}.", source=SOURCE
        )

    return Signal.found(
        _location_from_result(r, postcode),
        source=SOURCE,
        source_url=f"https://api.postcodes.io/postcodes/{cleaned}",
    )


async def nearest_postcode(lat: float, lng: float, radius: int = 2_000) -> dict | None:
    """Coordinates → the nearest postcode's full record.

    Turns a map pin or an OpenStreetMap hit into something authoritative: the
    region (which decides whether we cover it), the borough, and the grid
    reference the schools lookup needs.
    """
    try:
        resp = await client.get(
            "https://api.postcodes.io/postcodes",
            params={"lat": lat, "lon": lng, "limit": 1, "radius": radius},
        )
    except Exception as e:
        log.warning("reverse_geocode_failed", lat=lat, lng=lng, error=str(e))
        return None
    if resp.status_code != 200:
        return None
    results = resp.json().get("result") or []
    return results[0] if results else None


async def nearest_postcodes(points: list[tuple[float, float]]) -> list[dict | None]:
    """The bulk form of `nearest_postcode`, so a page of suggestions costs one
    request rather than one per row."""
    if not points:
        return []
    try:
        resp = await client.post(
            "https://api.postcodes.io/postcodes",
            json={
                "geolocations": [
                    {"longitude": lng, "latitude": lat, "limit": 1, "radius": 2_000}
                    for lat, lng in points
                ]
            },
        )
    except Exception as e:
        log.warning("bulk_reverse_geocode_failed", error=str(e))
        return [None] * len(points)
    if resp.status_code != 200:
        return [None] * len(points)

    out: list[dict | None] = []
    for item in resp.json().get("result") or []:
        matches = item.get("result") or []
        out.append(matches[0] if matches else None)
    # postcodes.io preserves request order, but a short response would silently
    # misalign every label with the wrong coordinates, so pad rather than zip.
    out.extend([None] * (len(points) - len(out)))
    return out[: len(points)]


def outside_london_reason(place: str, district: str, region: str) -> str:
    """Said plainly, and saying where it actually is — "not in London" reads as
    a lookup failure when the user knows perfectly well where they typed."""
    where = district or region
    return (
        f"“{place}” is in {where}, outside Greater London. "
        "HomeReady only covers London, because door-to-door journey times come "
        "from TfL and stop at the boundary."
        if where else
        f"“{place}” is outside Greater London, which is all HomeReady covers."
    )


async def geocode_address(query: str, london_only: bool = True) -> Signal[Location]:
    """Free-text → location, for a workplace or a preferred area.

    Tries postcodes.io first (exact, authoritative), then falls back to
    OpenStreetMap for place names, and checks whatever comes back against the
    ONS region. Named corporate sites — "Amazon UK LHR16" — generally do not
    resolve; the UI offers place suggestions as you type, so this returning
    `unavailable` is an expected path, not an error.
    """
    text = query.strip()
    if not text:
        return Signal.missing("Enter a postcode, address, or place name.")

    postcode_attempt = await lookup_postcode(text)
    if postcode_attempt.ok:
        loc = postcode_attempt.value
        if london_only and not loc.is_london:
            return Signal.missing(
                outside_london_reason(text, loc.district, loc.region), source=SOURCE
            )
        return postcode_attempt

    # Searched across the whole UK on purpose, even though only London is
    # accepted. Biasing the search to a London rectangle would quietly resolve
    # "Manchester" to Manchester Square, W1 — a real place, in London, and not
    # remotely what was asked for. Better to find the actual Manchester and say
    # why it cannot be used.
    try:
        resp = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": text,
                "format": "jsonv2",
                "limit": 1,
                "countrycodes": "gb",
            },
        )
        hits = resp.json() if resp.status_code == 200 else []
    except Exception as e:
        log.warning("nominatim_failed", query=text, error=str(e))
        hits = []

    if not hits:
        return Signal.missing(
            f"Couldn’t find “{text}”. Try a postcode, or pick one of the "
            "suggestions as you type.",
            source="OpenStreetMap",
        )

    hit = hits[0]
    lat, lon = float(hit["lat"]), float(hit["lon"])

    # Reverse to a postcode so downstream providers get grid refs and area
    # codes — and so the London check is made against the ONS boundary rather
    # than the rectangle the search was biased with.
    record = await nearest_postcode(lat, lon)
    if record is None:
        if london_only:
            return Signal.missing(
                f"Couldn’t confirm that “{text}” is inside Greater London. "
                "Try a postcode instead.",
                source=SOURCE,
            )
        return Signal.found(
            Location(postcode="", latitude=lat, longitude=lon, easting=0,
                     northing=0, district="", ward="", region="", lsoa="",
                     lsoa_code=""),
            source="OpenStreetMap",
        )

    location = _location_from_result(record)
    if london_only and not location.is_london:
        return Signal.missing(
            outside_london_reason(text, location.district, location.region),
            source=SOURCE,
        )
    return Signal.found(location, source="OpenStreetMap")
