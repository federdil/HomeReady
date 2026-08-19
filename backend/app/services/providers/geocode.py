"""
Postcode → location, via postcodes.io (free, no key).

This is the root lookup: every other provider needs either the coordinates or
one of the statistical area codes returned here. It also hands back the British
National Grid easting/northing, which lets school proximity be computed in
plain metres instead of haversine over degrees.
"""
from __future__ import annotations

from dataclasses import dataclass

import structlog

from app.core.signals import Signal
from app.services.providers.http import client

log = structlog.get_logger()

SOURCE = "postcodes.io"


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
        return self.region == "London"


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
        Location(
            postcode=r.get("postcode", postcode),
            latitude=r["latitude"],
            longitude=r["longitude"],
            easting=r.get("eastings") or 0,
            northing=r.get("northings") or 0,
            district=r.get("admin_district") or "",
            ward=r.get("admin_ward") or "",
            region=r.get("region") or "",
            lsoa=r.get("lsoa") or "",
            lsoa_code=(r.get("codes") or {}).get("lsoa") or "",
        ),
        source=SOURCE,
        source_url=f"https://api.postcodes.io/postcodes/{cleaned}",
    )


async def geocode_address(query: str) -> Signal[Location]:
    """Free-text → location, for workplace entry.

    Tries postcodes.io first (exact, authoritative), then falls back to
    OpenStreetMap for place names. Named corporate sites — "Amazon UK LHR16" —
    generally do not resolve; the UI offers a draggable pin for those, so this
    returning `unavailable` is an expected path, not an error.
    """
    text = query.strip()
    if not text:
        return Signal.missing("Enter a postcode, address, or place name.")

    postcode_attempt = await lookup_postcode(text)
    if postcode_attempt.ok:
        return postcode_attempt

    try:
        resp = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": text, "format": "json", "limit": 1, "countrycodes": "gb"},
        )
        hits = resp.json() if resp.status_code == 200 else []
    except Exception as e:
        log.warning("nominatim_failed", query=text, error=str(e))
        hits = []

    if not hits:
        return Signal.missing(
            f"Couldn't find “{text}”. Try a postcode, or drop a pin on the map.",
            source="OpenStreetMap",
        )

    hit = hits[0]
    lat, lon = float(hit["lat"]), float(hit["lon"])

    # Reverse to a postcode so downstream providers get grid refs and area
    # codes; if that fails the coordinates alone still drive the map and TfL.
    return Signal.found(
        Location(
            postcode="",
            latitude=lat,
            longitude=lon,
            easting=0,
            northing=0,
            district=hit.get("display_name", "").split(",")[-3:-2][0].strip()
            if hit.get("display_name", "").count(",") >= 3 else "",
            ward="",
            region="",
            lsoa="",
            lsoa_code="",
        ),
        source="OpenStreetMap",
    )
