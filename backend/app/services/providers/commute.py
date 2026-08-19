"""
Door-to-door commute, via the TfL Journey Planner (free, no key).

Returns a real journey — duration and the sequence of modes — rather than the
distance to the nearest station, which is what the previous implementation
offered and what a buyer cannot actually use.

London only. Outside the TfL area the planner returns nothing, and this
degrades to `unavailable` with a reason the user can read.
"""
from __future__ import annotations

from dataclasses import dataclass

import structlog

from app.core.signals import Signal
from app.services.providers.http import client

log = structlog.get_logger()

SOURCE = "TfL Journey Planner"

# Modes offered to the planner. Cycling and driving are deliberately excluded:
# TfL's estimates for those are weak, and a wrong number is worse than none.
DEFAULT_MODES = "tube,bus,national-rail,dlr,overground,walking,tram"

MODE_LABELS = {
    "national-rail": "train",
    "overground": "Overground",
    "dlr": "DLR",
    "tube": "tube",
    "bus": "bus",
    "walking": "walk",
    "tram": "tram",
    "elizabeth-line": "Elizabeth line",
}


@dataclass(frozen=True)
class Journey:
    minutes: int
    summary: str          # "bus + tube"
    changes: int
    modes: list[str]

    @property
    def description(self) -> str:
        return f"{self.minutes} min · {self.summary}"


def _summarise(legs: list[dict]) -> tuple[str, list[str], int]:
    modes: list[str] = []
    for leg in legs:
        raw = (leg.get("mode") or {}).get("name", "")
        label = MODE_LABELS.get(raw, raw)
        if label and (not modes or modes[-1] != label):
            modes.append(label)

    # Walking legs top and tail almost every journey; they are not what the
    # buyer means when they ask how they will get to work.
    transit = [m for m in modes if m != "walk"]
    summary = " + ".join(transit) if transit else "walk"
    changes = max(len(transit) - 1, 0)
    return summary, modes, changes


async def journey_time(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    modes: str = DEFAULT_MODES,
) -> Signal[Journey]:
    try:
        resp = await client.get(
            f"https://api.tfl.gov.uk/Journey/JourneyResults/"
            f"{from_lat},{from_lng}/to/{to_lat},{to_lng}",
            params={"mode": modes},
        )
    except Exception as e:
        log.warning("tfl_journey_failed", error=str(e))
        return Signal.missing("Couldn't reach the journey planner.", source=SOURCE)

    if resp.status_code == 404:
        return Signal.missing(
            "No public transport route found — this is usually because one end "
            "of the journey is outside London.",
            source=SOURCE,
        )
    if resp.status_code != 200:
        return Signal.missing("The journey planner returned an error.", source=SOURCE)

    journeys = resp.json().get("journeys") or []
    if not journeys:
        return Signal.missing("No route found between these two points.", source=SOURCE)

    # Planner returns alternatives; the fastest is the honest headline.
    best = min(journeys, key=lambda j: j.get("duration") or 10**6)
    summary, mode_list, changes = _summarise(best.get("legs") or [])

    return Signal.found(
        Journey(
            minutes=int(best.get("duration") or 0),
            summary=summary,
            changes=changes,
            modes=mode_list,
        ),
        source=SOURCE,
    )


async def nearest_stations(lat: float, lng: float, radius: int = 1000) -> Signal[list[dict]]:
    """Supporting context for the property card — never a commute substitute."""
    try:
        resp = await client.get(
            "https://api.tfl.gov.uk/StopPoint",
            params={
                "lat": lat,
                "lon": lng,
                "stopTypes": "NaptanMetroStation,NaptanRailStation",
                "radius": radius,
            },
        )
    except Exception as e:
        log.warning("tfl_stoppoint_failed", error=str(e))
        return Signal.missing("Couldn't reach the TfL stations service.", source="TfL")

    if resp.status_code != 200:
        return Signal.missing("The TfL stations service returned an error.", source="TfL")

    stops = resp.json().get("stopPoints") or []
    if not stops:
        return Signal.missing(
            f"No tube or rail stations within {radius}m.", source="TfL"
        )

    ranked = sorted(stops, key=lambda s: s.get("distance") or 10**9)[:5]
    return Signal.found(
        [
            {
                "name": s.get("commonName", "").replace(" Underground Station", "")
                                               .replace(" Rail Station", ""),
                "distance_m": int(s.get("distance") or 0),
            }
            for s in ranked
        ],
        source="TfL",
    )
