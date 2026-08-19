"""
Nearby schools, from the locally loaded DfE GIAS dataset.

Positions are British National Grid metres, so a radius search is a bounding
box on two indexed integer columns followed by exact Pythagorean distance —
no PostGIS, no trigonometry, no network call.

Ofsted judgements are deliberately absent: the GIAS bulk file does not carry
them, and no working public ratings API has been confirmed. Rather than
guessing a quality score, this reports proximity and phase and says plainly
that ratings are not available. The scoring engine handles that by dropping
the schools dimension and renormalising the persona's remaining weights.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.signals import Signal
from app.models.models import School

SOURCE = "DfE Get Information About Schools"
SOURCE_URL = "https://get-information-schools.service.gov.uk/"

PRIMARY_PHASES = {"Primary", "Middle deemed primary", "Nursery"}
SECONDARY_PHASES = {"Secondary", "Middle deemed secondary", "16 plus", "All-through"}


@dataclass
class NearbySchool:
    urn: int
    name: str
    phase: str | None
    establishment_type: str | None
    distance_m: int
    ofsted_rating: str | None


@dataclass
class SchoolsSummary:
    radius_m: int
    primary_count: int
    secondary_count: int
    nearest: list[NearbySchool]
    ratings_available: bool

    @property
    def total(self) -> int:
        return self.primary_count + self.secondary_count


async def schools_near(
    session: AsyncSession,
    easting: int,
    northing: int,
    radius_m: int = 1_500,
) -> Signal[SchoolsSummary]:
    if not easting or not northing:
        return Signal.missing(
            "No grid reference for this postcode, so nearby schools can't be found.",
            source=SOURCE,
        )

    # Bounding box first — cheap, index-backed, then filter to a true circle.
    stmt = select(School).where(
        School.easting.between(easting - radius_m, easting + radius_m),
        School.northing.between(northing - radius_m, northing + radius_m),
    )
    rows = (await session.execute(stmt)).scalars().all()

    within: list[NearbySchool] = []
    for s in rows:
        dx = s.easting - easting
        dy = s.northing - northing
        distance = (dx * dx + dy * dy) ** 0.5
        if distance <= radius_m:
            within.append(
                NearbySchool(
                    urn=s.urn,
                    name=s.name,
                    phase=s.phase,
                    establishment_type=s.establishment_type,
                    distance_m=int(distance),
                    ofsted_rating=s.ofsted_rating,
                )
            )

    if not within:
        return Signal.missing(
            f"No schools recorded within {radius_m // 100 / 10:g} km.",
            source=SOURCE,
            source_url=SOURCE_URL,
        )

    within.sort(key=lambda s: s.distance_m)

    return Signal.found(
        SchoolsSummary(
            radius_m=radius_m,
            primary_count=sum(1 for s in within if s.phase in PRIMARY_PHASES),
            secondary_count=sum(1 for s in within if s.phase in SECONDARY_PHASES),
            nearest=within[:8],
            ratings_available=any(s.ofsted_rating for s in within),
        ),
        source=SOURCE,
        source_url=SOURCE_URL,
    )
