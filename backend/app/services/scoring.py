"""
Turning signals into a persona-weighted fit score.

Two rules govern everything here.

1. A dimension with no data leaves the calculation entirely. It is never
   imputed as 50, never as 0. The remaining weights renormalise, and the user
   is told what share of their priorities the score is actually based on.
   Imputing a midpoint would let a property with *absent* data outrank one
   with genuinely *poor* data, which is precisely the failure the old agent
   had — it scored schools 65/100 for a postcode that returned nothing.

2. Every dimension score is derived from a measured value by an explicit,
   inspectable rule. No model is asked to produce a number.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.core.signals import Signal
from app.services.personas import DIMENSION_LABELS, DIMENSIONS


@dataclass
class DimensionScore:
    key: str
    label: str
    score: int | None          # None when unavailable
    weight: int
    detail: str                # what the score is based on, in plain English
    unavailable_reason: str | None = None

    @property
    def available(self) -> bool:
        return self.score is not None


@dataclass
class FitResult:
    score: int | None
    coverage: int              # % of the persona's total weight that had data
    dimensions: list[DimensionScore] = field(default_factory=list)

    @property
    def missing(self) -> list[DimensionScore]:
        """Only dimensions the buyer actually asked about. A dimension they
        weighted at zero is irrelevant to them, so its absence is not a gap
        worth reporting."""
        return [d for d in self.dimensions if not d.available and d.weight > 0]


def _lerp_score(value: float, best: float, worst: float) -> int:
    """Map a measurement onto 0-100, clamped. `best` may be lower than `worst`
    (as with commute minutes, where fewer is better)."""
    if best == worst:
        return 50
    fraction = (value - worst) / (best - worst)
    return int(round(max(0.0, min(1.0, fraction)) * 100))


# ── Per-dimension rules ────────────────────────────────────────────────────

def score_commute(journeys: list[tuple[str, Signal]], max_minutes: int = 45) -> tuple[int | None, str]:
    """Scored on the worst commute, not the average — if one person's journey
    is unacceptable the property is unacceptable, however good the other's is."""
    usable = [(label, sig.value.minutes) for label, sig in journeys if sig.ok and sig.value]
    if not usable:
        return None, ""

    worst_label, worst_minutes = max(usable, key=lambda pair: pair[1])
    # At the persona's stated ceiling the score is 50; half of it scores 100.
    score = _lerp_score(worst_minutes, best=max_minutes * 0.4, worst=max_minutes * 1.6)

    if len(usable) == 1:
        detail = f"{worst_minutes} min to {worst_label}"
    else:
        detail = f"Longest journey {worst_minutes} min ({worst_label})"
    return score, detail


def score_safety(crime: Signal) -> tuple[int | None, str]:
    """Scored on recorded crime volume within roughly a mile, weighted toward
    offences a resident experiences as personal safety.

    Thresholds are calibrated against typical inner-London monthly volumes, so
    a mid-range score means 'ordinary for London', not 'safe in absolute terms'.
    """
    if not crime.ok or not crime.value:
        return None, ""

    summary = crime.value
    total = summary.total
    weighted = total + summary.personal_safety_count  # counts violence twice

    score = _lerp_score(weighted, best=150, worst=2_200)
    detail = f"{total:,} crimes in the month of {_month_name(summary.month)}"
    return score, detail


def _month_name(raw: str) -> str:
    """"2026-06" reads as a year to a human skimming it. Spell it out."""
    try:
        year, month = raw.split("-")
        names = ("January", "February", "March", "April", "May", "June", "July",
                 "August", "September", "October", "November", "December")
        return f"{names[int(month) - 1]} {year}"
    except (ValueError, IndexError):
        return raw


def score_schools(schools: Signal) -> tuple[int | None, str]:
    """Proximity and provision only.

    No Ofsted judgement is available, so this deliberately does not claim to
    measure school *quality*. If a ratings source is added later this becomes
    a quality-weighted score; until then it says what it actually knows.
    """
    if not schools.ok or not schools.value:
        return None, ""

    summary = schools.value
    if summary.total == 0:
        return None, ""

    # Diminishing returns: the fourth nearby primary adds little.
    primary = min(summary.primary_count, 4) / 4
    secondary = min(summary.secondary_count, 2) / 2
    nearest = summary.nearest[0].distance_m if summary.nearest else summary.radius_m
    closeness = _lerp_score(nearest, best=200, worst=summary.radius_m) / 100

    score = int(round((primary * 0.4 + secondary * 0.3 + closeness * 0.3) * 100))
    detail = (
        f"{summary.primary_count} primary, {summary.secondary_count} secondary "
        f"within {summary.radius_m // 100 / 10:g} km"
    )
    return score, detail


def score_value(
    comparables: Signal,
    asking_price: float | None,
    running_costs: Signal | None = None,
) -> tuple[int | None, str]:
    """Asking price against local sales, adjusted for what the place costs to
    hold. A flat priced in line with its neighbours but carrying a £5,000
    service charge is not good value, and pricing alone will not show that."""
    if not comparables.ok or not comparables.value or not asking_price:
        return _value_from_costs_alone(running_costs, asking_price)

    comps = comparables.value
    position = comps.position_of(asking_price)
    if position is None:
        return None, ""

    # The comparison is an asking price today against sales registered over the
    # past few years, so some premium is normal rather than damning: being level
    # with the median scores well, and the band runs wide enough to keep
    # discriminating across genuinely expensive listings.
    #
    # Known limitation: Land Registry does not publish bedroom counts, so the
    # median mixes every property size in the postcode. A large house in an area
    # of flats will look expensive for reasons that have nothing to do with
    # value, which is why the detail text names what the comparison actually is.
    score = _lerp_score(position, best=-25, worst=75)
    median = comps.median_price
    sample = len(comps.sales)

    if position > 0:
        detail = f"{position:.0f}% above the £{median:,} median of {sample} recent sales here"
    elif position < 0:
        detail = f"{abs(position):.0f}% below the £{median:,} median of {sample} recent sales here"
    else:
        detail = f"In line with the £{median:,} median of {sample} recent sales here"

    burden_score, burden_detail = _running_cost_score(running_costs, asking_price)
    if burden_score is not None:
        # Purchase price dominates, but annual costs are paid for as long as
        # you own it, so they carry real weight rather than being a footnote.
        score = int(round(score * 0.7 + burden_score * 0.3))
        detail = f"{detail}. {burden_detail}"

    return score, detail


def _running_cost_score(running_costs: Signal | None, asking_price: float | None):
    if running_costs is None or not running_costs.ok or not running_costs.value:
        return None, ""
    costs = running_costs.value
    burden = costs.burden
    if burden is None:
        return None, ""

    from app.services.running_costs import BURDEN_COMFORTABLE, BURDEN_PUNITIVE

    score = _lerp_score(burden, best=BURDEN_COMFORTABLE, worst=BURDEN_PUNITIVE)
    return score, f"Running costs £{costs.total_annual:,.0f}/yr"


def _value_from_costs_alone(running_costs: Signal | None, asking_price: float | None):
    """No comparable sales, but known running costs still say something about
    value — better than reporting nothing at all."""
    score, detail = _running_cost_score(running_costs, asking_price)
    if score is None:
        return None, ""
    return score, f"{detail} (no comparable sales to price against)"


def score_space(listing: dict | None, persona, extracted: dict | None = None) -> tuple[int | None, str]:
    """How well the property matches the requirements the buyer stated.

    Deterministic: a comparison of facts against stated needs. The facts may
    come from Rightmove's structured flags or from a model reading the
    description, but the judgement is made here, in code.

    A requirement the listing says nothing about is excluded rather than
    failed — see app/services/features_match.py for why.
    """
    if not listing:
        return None, ""

    from app.services.features_match import build_checks

    checks = build_checks(listing, persona, extracted)
    stated = [c for c in checks if c.counts]

    if not stated:
        return None, ""

    met = sum(1 for c in stated if c.met)
    score = int(round((met / len(stated)) * 100))

    detail = " · ".join(c.detail for c in stated)
    unstated = [c.label.lower() for c in checks if not c.counts]
    if unstated:
        detail += f" · {', '.join(unstated)} not stated"
    return score, detail


# ── Aggregation ────────────────────────────────────────────────────────────

def combine(raw_scores: dict[str, tuple[int | None, str]], weights: dict[str, int],
            reasons: dict[str, str] | None = None) -> FitResult:
    reasons = reasons or {}
    dimensions: list[DimensionScore] = []

    weighted_total = 0.0
    available_weight = 0
    total_weight = 0

    for key in DIMENSIONS:
        weight = int(weights.get(key, 0))
        score, detail = raw_scores.get(key, (None, ""))
        total_weight += weight

        if score is not None and weight > 0:
            weighted_total += score * weight
            available_weight += weight

        dimensions.append(
            DimensionScore(
                key=key,
                label=DIMENSION_LABELS[key],
                score=score,
                weight=weight,
                detail=detail,
                unavailable_reason=None if score is not None else (reasons.get(key) or "Not available"),
            )
        )

    # Renormalise over what we actually have. No data means no contribution,
    # not a neutral contribution.
    fit = int(round(weighted_total / available_weight)) if available_weight else None
    coverage = int(round((available_weight / total_weight) * 100)) if total_weight else 0

    return FitResult(score=fit, coverage=coverage, dimensions=dimensions)
