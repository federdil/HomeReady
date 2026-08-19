"""
Annual running costs — what the property costs to own, every year, forever.

First-time buyers consistently underestimate this, and it is the part of
affordability the asking price hides. A flat £40,000 cheaper than another can
easily be the more expensive purchase once a £5,000 service charge is counted.

Service charge, ground rent and council tax band come straight from the
listing, so they are facts, not estimates. The council tax *amount* is an
estimate — the band is set nationally but the pound figure is set by each
billing authority, and there is no free per-authority feed. That distinction is
carried through to the UI rather than blurred.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.signals import Signal

# Statutory band ratios, expressed against Band D (Local Government Finance
# Act 1992). These are fixed nationally and do not vary by authority.
COUNCIL_TAX_BAND_RATIOS: dict[str, float] = {
    "A": 6 / 9,
    "B": 7 / 9,
    "C": 8 / 9,
    "D": 9 / 9,
    "E": 11 / 9,
    "F": 13 / 9,
    "G": 15 / 9,
    "H": 18 / 9,
    "I": 21 / 9,  # Wales only
}

# Band D baseline used to turn a band into a pound figure. Each billing
# authority sets its own, so this is a representative London figure and the
# result is always labelled an estimate. Replace with a per-borough table to
# make this exact — the band itself is already accurate.
BAND_D_BASELINE_GBP = 1_900

# A service charge is normal; the question is whether it is proportionate to
# what you are buying. Expressed as a share of the asking price per year.
BURDEN_COMFORTABLE = 0.004   # 0.4% — unremarkable
BURDEN_PUNITIVE = 0.020      # 2.0% — materially erodes the value of the asset


@dataclass
class CostLine:
    label: str
    annual: float
    is_estimate: bool
    basis: str


@dataclass
class RunningCosts:
    lines: list[CostLine]
    council_tax_band: str | None
    floor_area_sqft: int | None
    asking_price: float | None

    @property
    def total_annual(self) -> float:
        return round(sum(line.annual for line in self.lines), 2)

    @property
    def monthly(self) -> float:
        return round(self.total_annual / 12, 2)

    @property
    def has_any(self) -> bool:
        return bool(self.lines)

    @property
    def price_per_sqft(self) -> float | None:
        if not self.asking_price or not self.floor_area_sqft:
            return None
        return round(self.asking_price / self.floor_area_sqft)

    @property
    def burden(self) -> float | None:
        """Annual cost as a share of the asking price."""
        if not self.asking_price or self.total_annual <= 0:
            return None
        return self.total_annual / self.asking_price

    def as_dict(self) -> dict:
        """Explicit because the totals below are computed, and a field-only
        serialisation would drop them."""
        return {
            "lines": [
                {
                    "label": l.label,
                    "annual": l.annual,
                    "is_estimate": l.is_estimate,
                    "basis": l.basis,
                }
                for l in self.lines
            ],
            "council_tax_band": self.council_tax_band,
            "floor_area_sqft": self.floor_area_sqft,
            "total_annual": self.total_annual,
            "monthly": self.monthly,
            "price_per_sqft": self.price_per_sqft,
        }


def estimate_council_tax(band: str | None) -> tuple[float | None, str]:
    if not band:
        return None, ""
    key = band.strip().upper()[:1]
    ratio = COUNCIL_TAX_BAND_RATIOS.get(key)
    if ratio is None:
        return None, ""
    amount = round(BAND_D_BASELINE_GBP * ratio, -1)
    return amount, (
        f"Band {key} — estimated from a typical London Band D charge. "
        "Your exact bill is set by the borough."
    )


def build_running_costs(listing: dict) -> Signal[RunningCosts]:
    price = listing.get("price")
    lines: list[CostLine] = []

    service_charge = listing.get("annual_service_charge")
    if isinstance(service_charge, (int, float)) and service_charge > 0:
        lines.append(CostLine(
            "Service charge", round(float(service_charge), 2), False,
            "Stated on the listing. Usually reviewed annually and can rise.",
        ))

    ground_rent = listing.get("annual_ground_rent")
    if isinstance(ground_rent, (int, float)) and ground_rent > 0:
        lines.append(CostLine(
            "Ground rent", round(float(ground_rent), 2), False,
            "Stated on the listing. Check the review period in the lease.",
        ))

    band = listing.get("council_tax_band")
    council_tax, basis = estimate_council_tax(band)
    if council_tax:
        lines.append(CostLine("Council tax", council_tax, True, basis))

    if not lines:
        tenure = (listing.get("tenure_type") or "").upper()
        reason = (
            "The listing doesn't state a service charge, ground rent, or council "
            "tax band. Ask the agent — for a leasehold flat these are the costs "
            "most often left out."
            if tenure == "LEASEHOLD" else
            "The listing doesn't state a council tax band. Ask the agent."
        )
        return Signal.missing(reason, source="Rightmove listing")

    return Signal.found(
        RunningCosts(
            lines=lines,
            council_tax_band=band,
            floor_area_sqft=listing.get("floor_area_sqft"),
            asking_price=price,
        ),
        source="Rightmove listing",
    )
