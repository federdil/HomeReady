"""
Feature matching — the three-state rule.

Replaces substring matching over the description, which could not see negation:
"no garden and no parking available" previously scored 100/100 as having both.
"""
import pytest

from app.services.features_match import Finding, build_checks, resolve_outdoor_space, resolve_parking
from app.services.scoring import score_space


class _Persona:
    def __init__(self, outdoor=True, parking=True, bedrooms=1, lease=None):
        self.min_bedrooms = bedrooms
        self.needs_outdoor_space = outdoor
        self.needs_parking = parking
        self.min_lease_years = lease


# ── The bug this replaces ──────────────────────────────────────────────────
@pytest.mark.parametrize("text", [
    "no garden and no parking available",
    "There is no off-street parking at this property",
    "Bright flat close to Garden Court offices",
])
def test_description_text_alone_never_claims_a_feature(text):
    """Substring matching read all three of these as features present."""
    score, detail = score_space(
        {"bedrooms": 2, "listing_text": text, "tenure_type": "FREEHOLD"}, _Persona()
    )
    assert "not stated" in detail
    # The score rests only on bedrooms, which is the one thing actually known.
    assert score == 100


# ── Structured flags ───────────────────────────────────────────────────────
def test_agent_declaration_is_used_when_present():
    check = resolve_outdoor_space({"garden_flag": "Yes"}, None)
    assert check.finding is Finding.PRESENT
    assert check.counts


def test_blank_flag_is_not_stated_not_absent():
    """An agent leaving the field blank says nothing about the property."""
    check = resolve_parking({"parking_flag": None}, None)
    assert check.finding is Finding.NOT_STATED
    assert not check.counts


def test_explicit_no_is_absent():
    check = resolve_parking({"parking_flag": "No"}, None)
    assert check.finding is Finding.ABSENT
    assert check.counts and not check.met


# ── Model extraction overrides the flag ────────────────────────────────────
def test_model_distinguishes_communal_from_private():
    """The structured flag said "Yes" for a flat in a tower block; the
    description reveals it is a shared terrace."""
    private = resolve_outdoor_space({"garden_flag": "Yes"}, {"outdoor_space": "private"})
    communal = resolve_outdoor_space({"garden_flag": "Yes"}, {"outdoor_space": "communal"})
    assert private.finding is Finding.PRESENT and "Private" in private.detail
    assert communal.finding is Finding.PRESENT and "Communal" in communal.detail
    assert private.detail != communal.detail


def test_model_negation_beats_a_blank_flag():
    check = resolve_parking({"parking_flag": None}, {"parking": "none"})
    assert check.finding is Finding.ABSENT
    assert check.counts and not check.met


def test_model_not_stated_falls_back_to_the_flag():
    check = resolve_outdoor_space({"garden_flag": "Yes"}, {"outdoor_space": "not_stated"})
    assert check.finding is Finding.PRESENT


def test_unrecognised_model_output_is_ignored_not_guessed():
    check = resolve_parking({"parking_flag": None}, {"parking": "maybe some"})
    assert check.finding is Finding.NOT_STATED


# ── Only what the buyer asked for is checked ───────────────────────────────
def test_requirements_the_buyer_did_not_ask_for_are_not_checked():
    checks = build_checks({"bedrooms": 2}, _Persona(outdoor=False, parking=False))
    assert [c.key for c in checks] == ["bedrooms"]


def test_unstated_requirement_does_not_count_against_the_property():
    """A property that meets the one stated requirement scores full marks,
    rather than being punished for an incomplete listing."""
    with_flag = score_space({"bedrooms": 2, "garden_flag": "Yes"}, _Persona(parking=False))[0]
    without = score_space({"bedrooms": 2}, _Persona(parking=False))[0]
    assert with_flag == 100
    assert without == 100


def test_a_stated_failure_does_lower_the_score():
    both_met = score_space(
        {"bedrooms": 2, "garden_flag": "Yes", "parking_flag": "Yes"}, _Persona()
    )[0]
    one_failed = score_space(
        {"bedrooms": 2, "garden_flag": "Yes", "parking_flag": "No"}, _Persona()
    )[0]
    assert both_met == 100
    assert one_failed < both_met


def test_no_stated_facts_at_all_yields_no_score():
    """Consistent with every other dimension: unknown is not a number."""
    score, _ = score_space({"listing_text": "A lovely home."}, _Persona())
    assert score is None
