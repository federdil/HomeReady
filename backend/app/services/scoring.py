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

import math
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


def score_area(
    location: Signal,
    preferred_areas: list[dict] | None,
) -> tuple[int | None, str]:
    """How close the property is to somewhere the buyer already wants to live.

    Most people arrive at a search with a shortlist of areas — "London Bridge,
    Bermondsey, maybe Peckham" — long before they think about weights. That is
    a real preference and it was previously invisible to the score, so a
    perfectly-commutable flat in an area they had ruled out ranked alongside one
    in the middle of their shortlist.

    Scored on straight-line distance to the *nearest* preferred area, not the
    average: shortlisted areas are alternatives, and being in one of them is the
    whole point. No preferred areas means no score — an unstated preference is
    not a preference met.

    Straight-line rather than travel time on purpose. This is asking "is this
    the part of London I want", which is a question about place; how long it
    takes to get anywhere is already the commute dimension's job.
    """
    if not preferred_areas:
        return None, ""
    if not location.ok or not location.value:
        return None, ""

    loc = location.value
    measured = [
        (a.get("label") or "your preferred area",
         _haversine_m(loc.latitude, loc.longitude,
                      float(a["latitude"]), float(a["longitude"])))
        for a in preferred_areas
        if a.get("latitude") is not None and a.get("longitude") is not None
    ]
    if not measured:
        return None, ""

    label, distance = min(measured, key=lambda pair: pair[1])

    # Inside 1 km is "in the area" — that is roughly a London neighbourhood's
    # own radius. 6 km is most of the way across a borough and to the far side
    # of two others, which is no longer the place they asked for.
    score = _lerp_score(distance, best=1_000, worst=6_000)

    if distance < 1_000:
        detail = f"In {label}"
    else:
        detail = f"{distance / 1000:.1f} km from {label}"
    if len(measured) > 1:
        detail += f" (nearest of {len(measured)})"
    return score, detail


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres. Over London's ~50 km span the error
    against a projected calculation is a few metres, well inside what the
    scoring band cares about."""
    radius = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_phi = p2 - p1
    d_lambda = math.radians(lng2 - lng1)
    a = (math.sin(d_phi / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(d_lambda / 2) ** 2)
    return 2 * radius * math.asin(math.sqrt(a))


# ── Safety calibration ─────────────────────────────────────────────────────
# Recorded crimes in one month within 800 m, sampled across 191 randomly drawn
# Greater London postcodes (May 2026, all 33 boroughs represented). Held here
# rather than computed live: it is a property of London, it moves slowly, and
# the alternative is 191 API calls before we can score anything.
#
# Refresh it by re-running the sampling described in docs/development.md and
# pasting the new percentiles; the shape has been stable, but the absolute
# level is not guaranteed to be.
LONDON_CRIME_PERCENTILES: tuple[tuple[int, int], ...] = (
    (0, 0), (28, 5), (44, 10), (68, 20), (83, 25), (97, 30), (133, 40),
    (191, 50), (236, 60), (311, 70), (331, 75), (401, 80), (534, 90),
    (697, 95), (1_716, 99), (2_466, 100),
)
LONDON_CRIME_REFERENCE = "191 Greater London postcodes, May 2026"

# The ramp is anchored on two points of that distribution — the quiet tenth
# percentile scores 90, the ninety-ninth scores 8 — and interpolated on a log
# scale, because crime counts span an order of magnitude and a linear ramp
# spends most of its range on differences nobody can feel.
#
# The previous version ran a linear ramp to zero at 2,200 crimes per *mile*.
# Every dense inner-London postcode sat on or past that ceiling and scored a
# flat 0, so Bethnal Green scored the same as the worst place in the country —
# not a claim the data supports, and not one a buyer should be shown.
_SAFETY_QUIET, _SAFETY_QUIET_SCORE = 44, 90.0
_SAFETY_BUSY, _SAFETY_BUSY_SCORE = 1_716, 8.0

# Neither end is an absolute claim. 100 would say "no crime happens here" and 0
# would say "nowhere is worse"; the underlying count supports neither, so the
# ramp stops short of both.
_SAFETY_FLOOR, _SAFETY_CEILING = 5, 98

# The share of recorded crime that is violence, robbery, weapons or public
# order. Across the same sample this sits at 0.34 with an interquartile range of
# 0.29-0.40, so it carries real signal about the *mix* — but a narrow one, which
# is why it adjusts the volume score by a few points rather than driving it. The
# old code counted those offences twice, which on a distribution this tight came
# to little more than multiplying every count by a constant.
_LONDON_PERSONAL_SHARE = 0.337
_SHARE_ADJUSTMENT_CAP = 8


def london_crime_percentile(total: int) -> int:
    """Where a count sits within London, as a percentile. Linear interpolation
    between the sampled breakpoints."""
    points = LONDON_CRIME_PERCENTILES
    if total <= points[0][0]:
        return 0
    for (low_count, low_pct), (high_count, high_pct) in zip(points, points[1:]):
        if total <= high_count:
            span = high_count - low_count
            if span <= 0:
                return high_pct
            return int(round(low_pct + (total - low_count) / span * (high_pct - low_pct)))
    return 100


def score_safety(crime: Signal) -> tuple[int | None, str]:
    """Scored on where this area's recorded crime sits within London's own
    distribution, not against an absolute idea of safety.

    A count inside a fixed radius tracks how busy a place is as well as how
    risky it is — a high street has more recorded crime than the cul-de-sac
    behind it partly because more people are on it. Nothing free supplies a
    population denominator to divide that out, so rather than invent a rate the
    score says something narrower and true: how this area compares with the
    rest of London, which carries the same measurement bias.

    A mid-range score therefore means "ordinary for London", not "safe in
    absolute terms", and the detail text says so in as many words.
    """
    if not crime.ok or not crime.value:
        return None, ""

    summary = crime.value
    total = summary.total
    if total <= 0:
        # No crime at all within 800 m of a London postcode is a gap in
        # reporting, not a finding about the street.
        return None, ""

    span = math.log10(_SAFETY_BUSY) - math.log10(_SAFETY_QUIET)
    slope = (_SAFETY_BUSY_SCORE - _SAFETY_QUIET_SCORE) / span
    raw = _SAFETY_QUIET_SCORE + slope * (math.log10(total) - math.log10(_SAFETY_QUIET))

    adjustment = (_LONDON_PERSONAL_SHARE - summary.personal_safety_share) / 0.10 * 5
    adjustment = max(-_SHARE_ADJUSTMENT_CAP, min(_SHARE_ADJUSTMENT_CAP, adjustment))

    score = int(round(max(_SAFETY_FLOOR, min(_SAFETY_CEILING, raw + adjustment))))

    radius = getattr(summary, "radius_m", 800)
    comparison = _london_comparison(london_crime_percentile(total))
    detail = (
        f"{total:,} crimes within {radius} m in {_month_name(summary.month)} "
        f"— {comparison}"
    )
    return score, detail


def _london_comparison(percentile: int) -> str:
    """The percentile in words, rounded to the nearest five — the reference
    sample is 191 postcodes and does not support finer than that."""
    rounded = int(round(percentile / 5.0) * 5)
    if rounded <= 10:
        return "among the quietest areas in London"
    if rounded >= 90:
        return "among the busiest in London for recorded crime"
    if rounded < 50:
        return f"quieter than about {100 - rounded}% of London"
    return f"busier than about {rounded}% of London"


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


# ── Budget ceiling ─────────────────────────────────────────────────────────
# How far over the stated maximum a property can go before its value score is
# on the floor. Twenty per cent over a London budget is not a stretch to be
# negotiated — at a £600,000 ceiling it is £120,000 of deposit and stamp duty
# that does not exist.
_BUDGET_WRITE_OFF = 0.20


def budget_fit(asking_price: float | None, price_max: int | None) -> tuple[int | None, str]:
    """How the asking price sits against the buyer's stated ceiling.

    Returns None when either figure is missing — a buyer who has not given a
    maximum has not stated a constraint to fall short of, and that is silence,
    not a pass.

    Being *under* budget earns nothing. A cheap property is not thereby good
    value; that is what the comparables are for. This measures one thing only:
    whether they can buy it.
    """
    if not asking_price or not price_max or price_max <= 0:
        return None, ""

    over = (asking_price - price_max) / price_max
    if over <= 0:
        return 100, f"Within your £{price_max:,} ceiling"

    score = _lerp_score(over, best=0.0, worst=_BUDGET_WRITE_OFF)
    excess = asking_price - price_max
    return score, (
        f"£{excess:,.0f} over your £{price_max:,} ceiling ({over * 100:.0f}%)"
    )


def score_value(
    comparables: Signal,
    asking_price: float | None,
    running_costs: Signal | None = None,
    price_max: int | None = None,
) -> tuple[int | None, str]:
    """Asking price against local sales, adjusted for what the place costs to
    hold, and capped by whether the buyer can actually afford it.

    A flat priced in line with its neighbours but carrying a £5,000 service
    charge is not good value, and pricing alone will not show that. Nor is a
    keenly-priced house £80,000 over the budget: it may be the best buy on the
    street and still be one this buyer cannot make.
    """
    if not comparables.ok or not comparables.value or not asking_price:
        return _value_from_costs_alone(running_costs, asking_price, price_max)

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

    return _apply_budget_ceiling(score, detail, asking_price, price_max)


def _apply_budget_ceiling(score, detail, asking_price, price_max):
    """The budget caps the value score rather than averaging into it.

    Averaging would let a bargain 20% over budget still score respectably,
    which reads as "worth a look" for something the buyer cannot complete on.
    A cap says the honest thing: however well it is priced, its value to *you*
    cannot exceed how affordable it is.

    The overrun is named in the detail whenever there is one, even where the
    score was already lower for other reasons. Silently dropping it would leave
    a buyer reading "30% above the local median" with no idea that it is also
    £50,000 past what they said they could spend.
    """
    budget_score, budget_detail = budget_fit(asking_price, price_max)
    if budget_score is None or budget_score >= 100:
        return score, detail
    combined_detail = f"{detail}. {budget_detail}"
    return min(score, budget_score), combined_detail


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


def _value_from_costs_alone(
    running_costs: Signal | None,
    asking_price: float | None,
    price_max: int | None = None,
):
    """No comparable sales, but the running costs and the buyer's own ceiling
    still say something about value — better than reporting nothing at all."""
    score, detail = _running_cost_score(running_costs, asking_price)
    if score is None:
        budget_score, budget_detail = budget_fit(asking_price, price_max)
        # Only an *overrun* stands on its own here. Being inside the budget is
        # not evidence of value — it is the absence of one specific problem —
        # and reporting it as 100/100 would let a property nobody has priced
        # outrank one measured against real sales.
        if budget_score is None or budget_score >= 100:
            return None, ""
        return budget_score, f"{budget_detail} (no comparable sales to price against)"
    return _apply_budget_ceiling(
        score, f"{detail} (no comparable sales to price against)",
        asking_price, price_max,
    )


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
