"""
Scoring tests, focused on the rule that matters most: missing data must never
be silently converted into a middling score.
"""
import pytest

from app.core.signals import Signal
from app.services.scoring import (
    combine,
    score_commute,
    score_safety,
    score_value,
)


def _weights(**kw):
    base = {"commute": 0, "safety": 0, "schools": 0, "value": 0, "space": 0}
    base.update(kw)
    return base


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
    assert result.dimensions[2].unavailable_reason == "No schools recorded within 1.5 km."


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
    def __init__(self, total, personal, month="2026-05"):
        self.total = total
        self.personal_safety_count = personal
        self.month = month


def test_more_crime_scores_lower():
    quiet = score_safety(Signal.found(_Crime(200, 20), "police"))[0]
    busy = score_safety(Signal.found(_Crime(1800, 600), "police"))[0]
    assert quiet > busy
    assert 0 <= busy <= 100 and 0 <= quiet <= 100


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
    assert "month" in detail
