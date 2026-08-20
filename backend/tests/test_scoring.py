"""
Scoring tests, focused on the rule that matters most: missing data must never
be silently converted into a middling score.
"""
import pytest

from app.core.signals import Signal
from app.services.scoring import (
    budget_fit,
    combine,
    london_crime_percentile,
    score_area,
    score_commute,
    score_safety,
    score_value,
)


def _weights(**kw):
    base = {"commute": 0, "area": 0, "safety": 0, "schools": 0, "value": 0, "space": 0}
    base.update(kw)
    return base


def _dimension(result, key):
    return next(d for d in result.dimensions if d.key == key)


def test_missing_dimension_is_excluded_not_imputed():
    result = combine(
        {"commute": (80, "25 min"), "schools": (None, "")},
        _weights(commute=50, schools=50),
    )
    # Only commute had data, so the score is commute's — not the average of
    # 80 and an invented 50.
    assert result.score == 80
    assert result.coverage == 50
    assert [d.key for d in result.missing] == ["schools"]


def test_absent_data_does_not_outrank_poor_data():
    """The failure this whole design exists to prevent."""
    known_poor = combine(
        {"commute": (80, ""), "safety": (10, "")},
        _weights(commute=50, safety=50),
    )
    unknown = combine(
        {"commute": (80, ""), "safety": (None, "")},
        _weights(commute=50, safety=50),
    )
    assert known_poor.score == 45
    assert unknown.score == 80
    # The higher score is explicitly qualified by lower coverage, so the UI can
    # show that it rests on half the picture.
    assert unknown.coverage == 50
    assert known_poor.coverage == 100


def test_all_dimensions_missing_yields_no_score():
    result = combine({k: (None, "") for k in _weights()}, _weights(commute=50, safety=50))
    assert result.score is None
    assert result.coverage == 0


def test_zero_weight_dimension_does_not_affect_score():
    with_zero = combine(
        {"commute": (80, ""), "schools": (0, "")},
        _weights(commute=70, schools=0),
    )
    assert with_zero.score == 80


def test_weights_change_the_ranking():
    """Same property, two personas, genuinely different verdicts."""
    scores = {"commute": (95, ""), "schools": (20, "")}
    commuter = combine(scores, _weights(commute=95, schools=5))
    family = combine(scores, _weights(commute=40, schools=90))
    assert commuter.score > family.score
    assert commuter.score >= 90
    assert family.score <= 50


def test_unavailable_reason_is_carried_through():
    result = combine(
        {"schools": (None, "")},
        _weights(schools=50),
        reasons={"schools": "No schools recorded within 1.5 km."},
    )
    assert _dimension(result, "schools").unavailable_reason == (
        "No schools recorded within 1.5 km."
    )


# ── Individual dimension rules ─────────────────────────────────────────────

class _J:
    def __init__(self, minutes):
        self.minutes = minutes


def test_commute_uses_the_worst_journey_not_the_average():
    journeys = [
        ("Office A", Signal.found(_J(20), "TfL")),
        ("Office B", Signal.found(_J(70), "TfL")),
    ]
    score, detail = score_commute(journeys, max_minutes=45)
    solo_fast = score_commute([journeys[0]], max_minutes=45)[0]
    assert score < solo_fast
    assert "70 min" in detail and "Office B" in detail


def test_commute_unavailable_when_no_journey_resolves():
    score, _ = score_commute([("Office", Signal.missing("Outside London"))])
    assert score is None


def test_shorter_commute_scores_higher():
    fast = score_commute([("O", Signal.found(_J(15), "TfL"))], 45)[0]
    slow = score_commute([("O", Signal.found(_J(80), "TfL"))], 45)[0]
    assert fast > slow


class _Crime:
    """Mirrors app.services.providers.crime.CrimeSummary, including the derived
    share the score reads."""

    def __init__(self, total, personal, month="2026-05", radius_m=800):
        self.total = total
        self.personal_safety_count = personal
        self.month = month
        self.radius_m = radius_m

    @property
    def personal_safety_share(self):
        return (self.personal_safety_count / self.total) if self.total else 0.0


def test_more_crime_scores_lower():
    quiet = score_safety(Signal.found(_Crime(60, 20), "police"))[0]
    busy = score_safety(Signal.found(_Crime(900, 300), "police"))[0]
    assert quiet > busy
    assert 0 <= busy <= 100 and 0 <= quiet <= 100


def test_ordinary_inner_london_is_not_scored_as_the_worst_place_in_britain():
    """The bug this calibration exists to fix.

    E2 9FJ — Bethnal Green — returned 0/100. Under the old one-mile linear ramp
    every dense inner-London postcode sat past the ceiling and flatlined, which
    told a buyer that an ordinary, popular area was as bad as anywhere can be.
    """
    bethnal_green = score_safety(Signal.found(_Crime(436, 151), "police"))[0]
    assert bethnal_green > 25
    # Still clearly below the quiet suburbs — the fix is calibration, not
    # flattery.
    assert bethnal_green < score_safety(Signal.found(_Crime(90, 30), "police"))[0]


def test_safety_never_reaches_either_extreme():
    """0 would claim nowhere is worse and 100 would claim no crime happens
    here. Neither is supportable from a monthly count."""
    busiest = score_safety(Signal.found(_Crime(4_000, 1_400), "police"))[0]
    quietest = score_safety(Signal.found(_Crime(1, 0), "police"))[0]
    assert busiest > 0
    assert quietest < 100


def test_safety_still_discriminates_across_busy_areas():
    """The old ramp clamped everything above its ceiling to the same 0, so the
    West End and Bethnal Green were indistinguishable."""
    busy = score_safety(Signal.found(_Crime(700, 240), "police"))[0]
    busier = score_safety(Signal.found(_Crime(1_400, 480), "police"))[0]
    assert busy > busier


def test_safety_detail_places_the_area_within_london():
    """A bare count means nothing to someone who has never counted crimes in a
    square mile. The comparison is the part they can act on."""
    _, detail = score_safety(Signal.found(_Crime(436, 151), "police"))
    assert "436" in detail and "800 m" in detail
    assert "London" in detail


def test_safety_reflects_the_mix_not_only_the_volume():
    """Same volume, different composition: mostly violence should score below
    mostly shoplifting."""
    violent = score_safety(Signal.found(_Crime(400, 240), "police"))[0]
    acquisitive = score_safety(Signal.found(_Crime(400, 80), "police"))[0]
    assert acquisitive > violent


def test_no_recorded_crime_is_treated_as_missing_not_as_perfect():
    """Zero crimes within 800 m of a London postcode is a hole in the feed. A
    property nobody has data for must not outrank one we know is quiet."""
    assert score_safety(Signal.found(_Crime(0, 0), "police"))[0] is None


def test_london_percentile_is_monotonic_and_bounded():
    counts = [0, 44, 191, 436, 697, 1_716, 5_000]
    percentiles = [london_crime_percentile(c) for c in counts]
    assert percentiles == sorted(percentiles)
    assert percentiles[0] == 0 and percentiles[-1] == 100


class _Comps:
    def __init__(self, median, sample=6):
        self._median = median
        self.sales = [object()] * sample

    @property
    def median_price(self):
        return self._median

    def position_of(self, price):
        return round(((price - self._median) / self._median) * 100, 1)


def test_value_rewards_being_under_the_local_median():
    comps = Signal.found(_Comps(400_000), "LR")
    cheap, cheap_detail = score_value(comps, 340_000)
    dear, dear_detail = score_value(comps, 460_000)
    assert cheap > dear
    assert "below" in cheap_detail and "above" in dear_detail


def test_value_unavailable_without_an_asking_price():
    assert score_value(Signal.found(_Comps(400_000), "LR"), None)[0] is None


@pytest.mark.parametrize("score_fn_input", [Signal.missing("no data")])
def test_value_unavailable_without_comparables(score_fn_input):
    assert score_value(score_fn_input, 350_000)[0] is None


def test_value_band_discriminates_across_realistic_london_premiums():
    """A single clamped band made every London listing score zero, which told
    the buyer nothing. Distinct premiums must produce distinct scores."""
    comps = Signal.found(_Comps(500_000), "LR")
    at_median = score_value(comps, 500_000)[0]
    modest = score_value(comps, 650_000)[0]     # +30%
    steep = score_value(comps, 850_000)[0]      # +70%
    assert at_median > modest > steep
    assert at_median >= 70          # level with the median is a good buy
    assert 0 < steep < 30           # expensive, but still ranked, not clamped


def test_value_detail_names_what_it_compared_against():
    comps = Signal.found(_Comps(500_000), "LR")
    _, detail = score_value(comps, 600_000)
    assert "recent sales" in detail


# ── Running costs in the value score ───────────────────────────────────────

class _Costs:
    def __init__(self, total, price):
        self.total_annual = total
        self._price = price

    @property
    def burden(self):
        return self.total_annual / self._price if self._price else None


def test_high_service_charge_lowers_value_for_the_same_price():
    """Two flats at the same price against the same comparables are not equal
    value if one carries a £6,000 service charge."""
    comps = Signal.found(_Comps(500_000), "LR")
    cheap_to_hold = score_value(comps, 550_000, Signal.found(_Costs(2_000, 550_000), "listing"))[0]
    dear_to_hold = score_value(comps, 550_000, Signal.found(_Costs(9_000, 550_000), "listing"))[0]
    assert cheap_to_hold > dear_to_hold


def test_running_costs_appear_in_the_value_detail():
    comps = Signal.found(_Comps(500_000), "LR")
    _, detail = score_value(comps, 550_000, Signal.found(_Costs(4_200, 550_000), "listing"))
    assert "4,200" in detail and "yr" in detail


def test_value_still_scores_without_running_costs():
    comps = Signal.found(_Comps(500_000), "LR")
    assert score_value(comps, 550_000, None)[0] is not None
    assert score_value(comps, 550_000, Signal.missing("not stated"))[0] is not None


def test_running_costs_alone_can_score_value_without_comparables():
    """A new-build postcode often has no registered sales. Known costs still
    say something, and saying it beats reporting nothing."""
    score, detail = score_value(
        Signal.missing("no sales"), 550_000, Signal.found(_Costs(2_200, 550_000), "listing")
    )
    assert score is not None
    assert "no comparable sales" in detail


def test_unknown_lease_length_is_not_scored_as_a_zero_year_lease():
    """Rightmove sends 0 when the agent omits the term. Scoring that as a
    zero-year lease implies the flat is unmortgageable — a very different
    claim from "we don't know"."""
    from app.services.scoring import score_space

    class _P:
        min_bedrooms = 1
        needs_outdoor_space = False
        needs_parking = False
        min_lease_years = 85

    listing = {"bedrooms": 1, "tenure_type": "LEASEHOLD", "lease_years": 0,
               "listing_text": ""}
    score, detail = score_space(listing, _P())
    # Reported as unknown, never as a zero-year lease, and excluded from the
    # score rather than counted as a failure.
    assert "0-year" not in detail
    assert "not stated" in detail
    assert score == 100          # the one thing we can check, it meets

    known_short = dict(listing, lease_years=60)
    short_score, short_detail = score_space(known_short, _P())
    assert "60-year lease" in short_detail
    assert short_score < score   # a genuinely short lease still counts against


def test_crime_period_is_unambiguous():
    """"1,916 crimes recorded in 2026-06" reads as a year, not a month."""
    _, detail = score_safety(Signal.found(_Crime(1916, 400, "2026-06"), "police"))
    assert "June 2026" in detail


# ── The buyer's budget ceiling ─────────────────────────────────────────────

def test_over_budget_is_reported_with_the_shortfall_in_pounds():
    score, detail = budget_fit(650_000, 600_000)
    assert score is not None and score < 100
    assert "£50,000" in detail and "600,000" in detail


def test_within_budget_neither_rewards_nor_penalises():
    """Being under budget is not itself good value — that is what the
    comparables measure. This asks only whether they can buy it."""
    assert budget_fit(400_000, 600_000)[0] == 100
    assert budget_fit(599_000, 600_000)[0] == 100


def test_no_stated_ceiling_is_silence_not_a_pass():
    assert budget_fit(650_000, None)[0] is None
    assert budget_fit(None, 600_000)[0] is None


def test_over_budget_pulls_the_value_score_down_hard():
    """The reported case: a £600,000 ceiling and a £650,000 property. Keenly
    priced against its neighbours is no comfort if you cannot complete."""
    comps = Signal.found(_Comps(700_000), "LR")   # a bargain locally
    affordable = score_value(comps, 650_000, None, price_max=700_000)[0]
    over = score_value(comps, 650_000, None, price_max=600_000)[0]
    assert affordable > 80          # under budget and under the median
    assert over < affordable - 20   # the same property, out of reach


def test_far_over_budget_bottoms_out_the_value_score():
    comps = Signal.found(_Comps(700_000), "LR")
    assert score_value(comps, 780_000, None, price_max=600_000)[0] < 10


def test_budget_names_itself_in_the_value_detail():
    comps = Signal.found(_Comps(500_000), "LR")
    _, detail = score_value(comps, 650_000, None, price_max=600_000)
    assert "ceiling" in detail and "£50,000" in detail


def test_budget_alone_can_score_value_with_nothing_else_known():
    """No comparable sales and no running costs, but a price and a ceiling is
    still a fact about value worth reporting."""
    score, detail = score_value(
        Signal.missing("no sales"), 750_000, None, price_max=600_000
    )
    assert score is not None and score < 30
    assert "no comparable sales" in detail


def test_value_is_unchanged_when_the_property_is_within_budget():
    comps = Signal.found(_Comps(500_000), "LR")
    without = score_value(comps, 480_000, None)[0]
    within = score_value(comps, 480_000, None, price_max=600_000)[0]
    assert without == within


# ── Preferred areas ────────────────────────────────────────────────────────

class _Loc:
    def __init__(self, lat, lng):
        self.latitude = lat
        self.longitude = lng


LONDON_BRIDGE = {"label": "London Bridge", "latitude": 51.5049, "longitude": -0.0877}
BETHNAL_GREEN = {"label": "Bethnal Green", "latitude": 51.5273, "longitude": -0.0550}


def test_closer_to_a_preferred_area_scores_higher():
    near = score_area(Signal.found(_Loc(51.5030, -0.0850), "pc"), [LONDON_BRIDGE])[0]
    far = score_area(Signal.found(_Loc(51.4400, -0.1900), "pc"), [LONDON_BRIDGE])[0]
    assert near > far


def test_inside_a_preferred_area_says_so_rather_than_quoting_a_distance():
    score, detail = score_area(
        Signal.found(_Loc(51.5052, -0.0880), "pc"), [LONDON_BRIDGE]
    )
    assert score == 100
    assert detail == "In London Bridge"


def test_area_is_scored_on_the_nearest_shortlisted_area_not_the_average():
    """Shortlisted areas are alternatives. Being in one of them is the point,
    and the others should not drag it down."""
    in_bethnal_green = _Loc(51.5273, -0.0550)
    both = score_area(
        Signal.found(in_bethnal_green, "pc"), [LONDON_BRIDGE, BETHNAL_GREEN]
    )[0]
    alone = score_area(Signal.found(in_bethnal_green, "pc"), [BETHNAL_GREEN])[0]
    assert both == alone == 100


def test_no_preferred_areas_leaves_the_dimension_unscored():
    """An unstated preference is not a preference met — it drops out and the
    remaining weights renormalise, like every other absent dimension."""
    assert score_area(Signal.found(_Loc(51.5, -0.1), "pc"), [])[0] is None
    assert score_area(Signal.found(_Loc(51.5, -0.1), "pc"), None)[0] is None


def test_area_unscored_when_the_property_has_no_location():
    assert score_area(Signal.missing("bad postcode"), [LONDON_BRIDGE])[0] is None


def test_area_detail_names_the_area_it_measured_against():
    _, detail = score_area(
        Signal.found(_Loc(51.4600, -0.1100), "pc"), [LONDON_BRIDGE, BETHNAL_GREEN]
    )
    assert "London Bridge" in detail
    assert "km" in detail
    assert "nearest of 2" in detail


def test_being_within_budget_alone_is_not_evidence_of_value():
    """No comparables, no running costs, and a price inside the ceiling leaves
    us knowing nothing about value. Scoring that 100 would let an unpriced
    property outrank one measured against real local sales — the exact failure
    the no-imputation rule exists to prevent."""
    score, _ = score_value(
        Signal.missing("no sales"), 450_000, None, price_max=600_000
    )
    assert score is None


# ── The explanations shown to the buyer ────────────────────────────────────

def test_every_dimension_can_explain_itself():
    """The score is meant to be an argument the buyer can inspect, so a
    dimension without a stated rule and a named source is not shippable."""
    from app.services.personas import (
        DIMENSION_METHODS, DIMENSION_SOURCES, DIMENSIONS,
    )

    for key in DIMENSIONS:
        assert DIMENSION_METHODS.get(key), f"{key} has no method text"
        assert DIMENSION_SOURCES.get(key), f"{key} names no source"
        # Long enough to actually say how the rule works, not a restatement of
        # the one-line blurb.
        assert len(DIMENSION_METHODS[key]) > 200


def _numbers_in(text: str) -> list[float]:
    import re
    return [float(m.replace(",", "")) for m in re.findall(r"\d[\d,]*", text)]


def _quotes_roughly(text: str, value: float, tolerance: float = 0.05) -> bool:
    """The prose rounds — "about 1,700" for a 1,716 anchor — so an exact string
    match would force unreadable text. A 5% window still catches a real
    recalibration, which moves these by far more than that."""
    return any(abs(n - value) <= value * tolerance for n in _numbers_in(text))


def test_the_stated_safety_thresholds_match_the_ones_in_force():
    """The explanation quotes specific numbers. If the calibration moves and
    the text does not, we are showing the buyer a rule we no longer apply."""
    from app.services.personas import DIMENSION_METHODS
    from app.services.scoring import (
        _SAFETY_BUSY, _SAFETY_BUSY_SCORE, _SAFETY_QUIET, _SAFETY_QUIET_SCORE,
    )
    from app.services.providers.crime import RADIUS_M

    text = DIMENSION_METHODS["safety"]
    assert f"{RADIUS_M} m" in text
    for anchor in (_SAFETY_QUIET, _SAFETY_QUIET_SCORE, _SAFETY_BUSY, _SAFETY_BUSY_SCORE):
        assert _quotes_roughly(text, anchor), f"{anchor} is not in the explanation"
    # It must not promise a floor of zero, which is the thing that was wrong.
    assert "never reaches 0 or 100" in text


def test_the_stated_budget_rule_matches_the_one_in_force():
    from app.services.personas import DIMENSION_METHODS
    from app.services.scoring import _BUDGET_WRITE_OFF

    assert f"{int(_BUDGET_WRITE_OFF * 100)}% over" in DIMENSION_METHODS["value"]


def test_every_building_kind_is_described_not_just_dated():
    """A buyer does not want "1837–1901", they want bay windows and a
    fireplace. Each option has to say what living there is actually like."""
    from app.services.property_style import PERIOD_KEYS, PERIODS

    assert len(PERIODS) == len(PERIOD_KEYS)
    for key, label, blurb in PERIODS:
        # A label that is only a date range is the thing being replaced.
        assert not label.replace("–", "").replace("-", "").strip().isdigit()
        assert len(blurb) > 40, f"{key} has no description worth reading"


def test_the_explanations_are_plain_text_not_markdown():
    """The client renders these as paragraphs and nothing more, so an asterisk
    or an underscore reaches the buyer verbatim — as one did."""
    from app.services.personas import DIMENSION_METHODS

    for key, text in DIMENSION_METHODS.items():
        assert "*" not in text, f"{key} contains markdown emphasis"
        assert "`" not in text, f"{key} contains a code span"
        assert "_" not in text, f"{key} contains markdown emphasis"
