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


# ── Built form and period ──────────────────────────────────────────────────

from app.services.features_match import (  # noqa: E402
    resolve_built_form,
    resolve_period,
)
from app.services.property_style import (  # noqa: E402
    built_form_from_listing,
    period_from_listing,
)


def test_rightmove_subtypes_map_onto_the_choices_a_buyer_makes():
    """Rightmove has dozens of sub-types that are one decision to almost
    everyone — "End of Terrace" and "Terraced" are the same house to look at."""
    assert built_form_from_listing({"property_type": "flat"}) == "flat"
    assert built_form_from_listing({"property_type": "apartment"}) == "flat"
    assert built_form_from_listing({"property_type": "penthouse"}) == "flat"
    assert built_form_from_listing({"property_type": "end of terrace house"}) == "terraced"
    assert built_form_from_listing({"property_type": "town house"}) == "terraced"
    assert built_form_from_listing({"property_type": "maisonette"}) == "maisonette"


def test_semi_detached_is_not_read_as_detached():
    """"Semi-Detached" contains "detached", so order of matching decides
    whether half the houses in London are mislabelled."""
    assert built_form_from_listing({"property_type": "semi-detached house"}) == "semi_detached"
    assert built_form_from_listing({"property_type": "detached house"}) == "detached"
    assert built_form_from_listing({"property_type": "detached bungalow"}) == "bungalow"


def test_a_blank_subtype_is_unstated_not_a_mismatch():
    check = resolve_built_form({"property_type": ""}, ["flat"])
    assert not check.counts
    assert built_form_from_listing({"property_type": "land"}) is None


def test_a_wanted_property_type_passes_and_an_unwanted_one_fails():
    passes = resolve_built_form({"property_type": "terraced house"}, ["terraced", "semi_detached"])
    assert passes.counts and passes.met
    fails = resolve_built_form({"property_type": "flat"}, ["terraced"])
    assert fails.counts and not fails.met
    assert "you wanted" in fails.detail


def test_a_named_period_in_the_key_features_is_read():
    assert period_from_listing({"key_features": ["Victorian conversion"]}) == "victorian"
    assert period_from_listing({"key_features": ["1930s semi"]}) == "interwar"


def test_the_new_homes_channel_settles_the_period_on_its_own():
    """Rightmove's own classification, and the only period fact anyone
    declares — it beats whatever the prose says about railings."""
    listing = {"channel": "NEW_HOME", "listing_text": "Victorian style railings"}
    assert period_from_listing(listing) == "new_build"


def test_a_nearby_landmark_is_not_the_building():
    assert period_from_listing({
        "listing_text": "Moments from Victoria Park and the Victorian schoolhouse.",
    }) is None


def test_a_lease_period_is_not_an_architectural_period():
    assert period_from_listing({
        "listing_text": "Full of character, with a long period remaining on the lease.",
    }) is None


def test_two_competing_eras_read_as_unstated_rather_than_guessed():
    """"A Georgian townhouse, converted in the 1990s" is a genuine ambiguity.
    Picking one would be the imputation this codebase refuses everywhere else,
    so it is left to the model pass, which can see which claim is the fabric."""
    assert period_from_listing({
        "key_features": ["Georgian townhouse"],
        "listing_text": "Fully converted in the 1990s",
    }) is None


def test_the_model_answer_outranks_the_phrase_scan():
    """The model reads the whole description; the scan only matches words."""
    listing = {"key_features": ["Victorian building"]}
    check = resolve_period(listing, ["new_build"], {"period": "new_build"})
    assert check.counts and check.met


def test_a_silent_listing_leaves_the_period_out_of_the_score():
    check = resolve_period({"listing_text": "A lovely two bedroom home."},
                           ["victorian"], None)
    assert not check.counts
    assert "not stated" in check.detail.lower()


def test_period_and_type_only_become_checks_once_the_buyer_states_one():
    from app.services.features_match import build_checks

    class _P:
        min_bedrooms = 1
        needs_outdoor_space = False
        needs_parking = False
        min_lease_years = None
        property_types = []
        preferred_periods = []

    listing = {"bedrooms": 2, "property_type": "flat",
               "key_features": ["Victorian conversion"]}
    silent = _P()
    assert [c.key for c in build_checks(listing, silent)] == ["bedrooms"]

    stated = _P()
    stated.property_types = ["flat"]
    stated.preferred_periods = ["victorian"]
    keys = [c.key for c in build_checks(listing, stated)]
    assert keys == ["bedrooms", "built_form", "period"]


def test_a_listing_with_no_tenure_does_not_pass_a_lease_requirement():
    """A blank tenure used to be reported as "Freehold" and counted as met.
    On a listing that stated nothing else, that alone produced a clean 100/100
    for the space dimension out of a fact nobody supplied."""
    from app.services.features_match import resolve_lease

    check = resolve_lease({"tenure_type": ""}, 85)
    assert not check.counts
    assert "not stated" in check.detail.lower()
    assert resolve_lease({}, 85).counts is False


def test_share_of_freehold_is_not_relabelled_as_freehold():
    from app.services.features_match import resolve_lease

    check = resolve_lease({"tenure_type": "SHARE_OF_FREEHOLD"}, 85)
    assert check.counts and check.met
    assert check.detail == "Share of freehold"
    assert resolve_lease({"tenure_type": "FREEHOLD"}, 85).detail == "Freehold"


def test_an_unrecognised_tenure_is_unstated_rather_than_assumed_freehold():
    from app.services.features_match import resolve_lease

    assert not resolve_lease({"tenure_type": "NON_TRADITIONAL"}, 85).counts
