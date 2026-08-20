"""
Matching a listing's features against what the buyer said they need.

Replaces substring matching over the description, which could not see negation:
"no garden and no parking available" scored 100/100 as having both.

Three states, never two. "Not stated" is not "no" — an agent leaving a field
blank says nothing about the property, and scoring it as a failure penalises
the buyer for the agent's incomplete listing. That is the same imputation error
this codebase removes everywhere else, so it is removed here too: unstated
requirements drop out of the calculation rather than counting against.

Facts arrive from two places, in order of authority:
  1. Rightmove's structured Material Information flags — the agent's own
     declaration, reliable for *whether a claim was made*.
  2. A model reading the description, folded into the verdict call, which
     resolves what the flags cannot: private versus communal, and negation.

Period and built form are handled the same way but sourced separately, in
app/services/property_style.py — Rightmove publishes a sub-type and a new-homes
flag and nothing else, so the era has to be read out of the prose.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Finding(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    NOT_STATED = "not_stated"


@dataclass
class FeatureCheck:
    key: str
    label: str
    finding: Finding
    detail: str          # shown to the buyer, e.g. "Communal terrace only"

    @property
    def counts(self) -> bool:
        """Only a stated fact can pass or fail. Silence does neither."""
        return self.finding is not Finding.NOT_STATED

    @property
    def met(self) -> bool:
        return self.finding is Finding.PRESENT


def _from_flag(flag: str | None) -> Finding:
    """Rightmove writes the agent's declaration or leaves it blank."""
    if flag is None:
        return Finding.NOT_STATED
    normalised = str(flag).strip().lower()
    if normalised in ("yes", "true"):
        return Finding.PRESENT
    if normalised in ("no", "none", "false"):
        return Finding.ABSENT
    return Finding.NOT_STATED


# Model output uses these words; anything else is treated as unstated rather
# than guessed at.
_MODEL_OUTDOOR = {
    "private": (Finding.PRESENT, "Private outdoor space"),
    "communal": (Finding.PRESENT, "Communal outdoor space only"),
    "none": (Finding.ABSENT, "No outdoor space"),
}
_MODEL_PARKING = {
    "allocated": (Finding.PRESENT, "Allocated parking"),
    "permit": (Finding.PRESENT, "Permit or on-street parking"),
    "none": (Finding.ABSENT, "No parking"),
}


def resolve_outdoor_space(listing: dict, extracted: dict | None) -> FeatureCheck:
    model = (extracted or {}).get("outdoor_space")
    if model in _MODEL_OUTDOOR:
        finding, detail = _MODEL_OUTDOOR[model]
        return FeatureCheck("outdoor_space", "Outdoor space", finding, detail)

    finding = _from_flag(listing.get("garden_flag"))
    detail = {
        Finding.PRESENT: "Outdoor space (agent declared)",
        Finding.ABSENT: "No outdoor space",
        Finding.NOT_STATED: "Outdoor space not stated",
    }[finding]
    return FeatureCheck("outdoor_space", "Outdoor space", finding, detail)


def resolve_parking(listing: dict, extracted: dict | None) -> FeatureCheck:
    model = (extracted or {}).get("parking")
    if model in _MODEL_PARKING:
        finding, detail = _MODEL_PARKING[model]
        return FeatureCheck("parking", "Parking", finding, detail)

    finding = _from_flag(listing.get("parking_flag"))
    detail = {
        Finding.PRESENT: "Parking (agent declared)",
        Finding.ABSENT: "No parking",
        Finding.NOT_STATED: "Parking not stated",
    }[finding]
    return FeatureCheck("parking", "Parking", finding, detail)


def resolve_bedrooms(listing: dict, minimum: int) -> FeatureCheck:
    bedrooms = listing.get("bedrooms")
    if bedrooms is None:
        return FeatureCheck("bedrooms", "Bedrooms", Finding.NOT_STATED, "Bedrooms not stated")
    finding = Finding.PRESENT if bedrooms >= minimum else Finding.ABSENT
    detail = f"{bedrooms} bed" + ("" if finding is Finding.PRESENT else f" (wanted {minimum}+)")
    return FeatureCheck("bedrooms", "Bedrooms", finding, detail)


# Rightmove's tenure values that are not a lease. Each has no term to fall
# short of, so the requirement is met outright.
_NOT_A_LEASE = {
    "FREEHOLD": "Freehold",
    "SHARE_OF_FREEHOLD": "Share of freehold",
    "COMMONHOLD": "Commonhold",
}


def resolve_lease(listing: dict, minimum: int) -> FeatureCheck:
    tenure = (listing.get("tenure_type") or "").strip().upper()

    if not tenure:
        # Previously any non-leasehold value — including a blank one — was
        # reported as "Freehold" and passed. That let a listing which says
        # nothing about tenure satisfy a lease requirement, and on a listing
        # with nothing else stated it produced a clean 100/100 for the space
        # dimension out of a fact nobody had supplied.
        return FeatureCheck("lease", "Lease", Finding.NOT_STATED, "Tenure not stated")

    if tenure in _NOT_A_LEASE:
        return FeatureCheck("lease", "Lease", Finding.PRESENT, _NOT_A_LEASE[tenure])

    if tenure != "LEASEHOLD":
        # An unrecognised tenure ("non-traditional", a new value) is not a
        # leasehold, but it is not a clean freehold either. Say so.
        return FeatureCheck(
            "lease", "Lease", Finding.NOT_STATED,
            f"Tenure recorded as {tenure.replace('_', ' ').lower()}",
        )

    years = listing.get("lease_years")
    if not years:
        # Rightmove sends 0 when the term is missing; that is absence of data.
        return FeatureCheck("lease", "Lease", Finding.NOT_STATED, "Lease length not stated")
    finding = Finding.PRESENT if years >= minimum else Finding.ABSENT
    return FeatureCheck("lease", "Lease", finding, f"{years}-year lease")


def resolve_built_form(listing: dict, wanted: list[str]) -> FeatureCheck:
    """Whether the property is one of the kinds of home the buyer will consider.

    A blank sub-type on Rightmove is rare but real (land, park homes, a lazy
    listing), and it means the same thing it means everywhere else here: we do
    not know, so it does not count either way.
    """
    from app.services.property_style import BUILT_FORM_LABELS, built_form_from_listing

    form = built_form_from_listing(listing)
    if form is None:
        return FeatureCheck(
            "built_form", "Property type", Finding.NOT_STATED,
            "Property type not stated",
        )

    label = BUILT_FORM_LABELS.get(form, form)
    finding = Finding.PRESENT if form in wanted else Finding.ABSENT
    if finding is Finding.PRESENT:
        return FeatureCheck("built_form", "Property type", finding, label)

    wanted_labels = ", ".join(BUILT_FORM_LABELS.get(w, w) for w in wanted).lower()
    return FeatureCheck(
        "built_form", "Property type", finding,
        f"{label} (you wanted {wanted_labels})",
    )


def resolve_period(listing: dict, wanted: list[str], extracted: dict | None) -> FeatureCheck:
    """Whether the property is from a period the buyer is looking for.

    Period is the one attribute here that nobody publishes as structured data,
    so it is read from the listing prose — by the model where the verdict call
    has already run, and otherwise by a conservative phrase scan. Both refuse to
    answer when the listing is silent or contradictory, which is most listings.
    A silent listing is not a Victorian terrace and it is not a new build; it is
    a listing that did not say.
    """
    from app.services.property_style import (
        PERIOD_KEYS, PERIOD_LABELS, period_from_listing,
    )

    model = (extracted or {}).get("period")
    period = model if model in PERIOD_KEYS else period_from_listing(listing)

    if period is None:
        return FeatureCheck(
            "period", "Period", Finding.NOT_STATED,
            "Period or build era not stated",
        )

    label = PERIOD_LABELS.get(period, period)
    if period in wanted:
        return FeatureCheck("period", "Period", Finding.PRESENT, label)

    wanted_labels = ", ".join(PERIOD_LABELS.get(w, w) for w in wanted)
    return FeatureCheck(
        "period", "Period", Finding.ABSENT,
        f"{label} (you wanted {wanted_labels})",
    )


def build_checks(listing: dict, persona, extracted: dict | None = None) -> list[FeatureCheck]:
    """Only the things this buyer actually asked for are checked."""
    checks = [resolve_bedrooms(listing, persona.min_bedrooms or 1)]

    if persona.needs_outdoor_space:
        checks.append(resolve_outdoor_space(listing, extracted))
    if persona.needs_parking:
        checks.append(resolve_parking(listing, extracted))
    if persona.min_lease_years:
        checks.append(resolve_lease(listing, persona.min_lease_years))

    # An empty list is "no preference", which is different from a preference
    # nothing satisfies — so these only become checks once the buyer states one.
    built_forms = list(getattr(persona, "property_types", None) or [])
    if built_forms:
        checks.append(resolve_built_form(listing, built_forms))

    periods = list(getattr(persona, "preferred_periods", None) or [])
    if periods:
        checks.append(resolve_period(listing, periods, extracted))

    return checks
