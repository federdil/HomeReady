"""
Street-level crime, via data.police.uk (free, no key).

Replaces the fabricated `safety_note` the old agent wrote from memory. The API
returns individual crimes inside an area for a given month, which we reduce to a
count, a category mix, and a position within London.

Two decisions worth stating.

**Radius.** The point query data.police.uk offers covers roughly a one-mile
circle. A mile from Bethnal Green reaches the City fringe and Shoreditch's
nightlife, so the figure it returns describes half of east London rather than
the street you would live on. This asks instead for an explicit ~800 m polygon —
a ten-minute walk, which is what "the immediate area" means to someone deciding
where to live — and every threshold in scoring is calibrated against that
radius.

**No crime rate.** Deliberately not attempted: a "crime rate per 1,000
residents". That needs a population denominator for the exact catchment, which
the API does not give. Reporting a count against London's own distribution is
honest; inventing a rate is not.
"""
from __future__ import annotations

import asyncio
import math
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta

import structlog

from app.core.signals import Signal
from app.services.providers.http import client

log = structlog.get_logger()

SOURCE = "data.police.uk"

# A ten-minute walk. Small enough to describe a neighbourhood, large enough that
# the count is not dominated by whether one busy street falls just inside it.
RADIUS_M = 800

# Categories a buyer reads as "is this street safe to walk down at night",
# as distinct from acquisitive crime that affects insurance more than safety.
PERSONAL_SAFETY_CATEGORIES = {
    "violent-crime",
    "robbery",
    "possession-of-weapons",
    "public-order",
}

FRIENDLY_CATEGORY = {
    "anti-social-behaviour": "Anti-social behaviour",
    "violent-crime": "Violence and sexual offences",
    "burglary": "Burglary",
    "robbery": "Robbery",
    "vehicle-crime": "Vehicle crime",
    "theft-from-the-person": "Theft from the person",
    "other-theft": "Other theft",
    "criminal-damage-arson": "Criminal damage and arson",
    "shoplifting": "Shoplifting",
    "drugs": "Drugs",
    "public-order": "Public order",
    "possession-of-weapons": "Weapons possession",
    "bicycle-theft": "Bicycle theft",
    "other-crime": "Other",
}


@dataclass
class CrimeSummary:
    month: str
    total: int
    personal_safety_count: int
    radius_m: int = RADIUS_M
    top_categories: list[tuple[str, int]] = field(default_factory=list)

    @property
    def personal_safety_share(self) -> float:
        return (self.personal_safety_count / self.total) if self.total else 0.0


def _candidate_months(count: int = 4) -> list[str]:
    """The feed lags by a couple of months and the lag varies by force, so walk
    backwards until a month has data rather than assuming the latest."""
    today = date.today().replace(day=1)
    months = []
    for i in range(1, count + 1):
        d = today
        for _ in range(i):
            d = (d - timedelta(days=1)).replace(day=1)
        months.append(d.strftime("%Y-%m"))
    return months


def _circle(lat: float, lng: float, radius_m: int, points: int = 20) -> str:
    """The polygon the API expects: "lat,lng:lat,lng:…".

    Twenty vertices sit within half a percent of a true circle's area, which is
    far inside the noise in the underlying data — the published coordinates are
    themselves snapped to anonymised map points.
    """
    metres_per_degree_lat = 111_320.0
    metres_per_degree_lng = metres_per_degree_lat * math.cos(math.radians(lat))
    vertices = []
    for i in range(points):
        angle = 2 * math.pi * i / points
        d_lat = (radius_m * math.cos(angle)) / metres_per_degree_lat
        d_lng = (radius_m * math.sin(angle)) / metres_per_degree_lng
        vertices.append(f"{lat + d_lat:.5f},{lng + d_lng:.5f}")
    return ":".join(vertices)


async def _fetch_month(lat: float, lng: float, month: str) -> list[dict] | None:
    try:
        resp = await client.get(
            "https://data.police.uk/api/crimes-street/all-crime",
            params={"poly": _circle(lat, lng, RADIUS_M), "date": month},
        )
    except Exception as e:
        log.warning("police_fetch_failed", month=month, error=str(e))
        return None
    if resp.status_code != 200:
        return None
    try:
        return resp.json()
    except Exception:
        return None


async def crime_summary(lat: float, lng: float) -> Signal[CrimeSummary]:
    months = _candidate_months()
    results = await asyncio.gather(
        *[_fetch_month(lat, lng, m) for m in months], return_exceptions=False
    )

    for month, crimes in zip(months, results):
        if not crimes:
            continue

        counts = Counter(c.get("category", "other-crime") for c in crimes)
        personal = sum(counts[c] for c in PERSONAL_SAFETY_CATEGORIES if c in counts)
        top = [
            (FRIENDLY_CATEGORY.get(cat, cat.replace("-", " ").title()), n)
            for cat, n in counts.most_common(5)
        ]

        return Signal.found(
            CrimeSummary(
                month=month,
                total=len(crimes),
                personal_safety_count=personal,
                radius_m=RADIUS_M,
                top_categories=top,
            ),
            source=SOURCE,
            source_url=f"https://www.police.uk/pu/your-area/?q={lat},{lng}",
        )

    return Signal.missing(
        "No police data published for this area in the last few months.",
        source=SOURCE,
    )
