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


def resolve_lease(listing: dict, minimum: int) -> FeatureCheck:
    if (listing.get("tenure_type") or "").upper() != "LEASEHOLD":
        # A freehold has no lease to fall short of.
        return FeatureCheck("lease", "Lease", Finding.PRESENT, "Freehold")
    years = listing.get("lease_years")
    if not years:
        # Rightmove sends 0 when the term is missing; that is absence of data.
        return FeatureCheck("lease", "Lease", Finding.NOT_STATED, "Lease length not stated")
    finding = Finding.PRESENT if years >= minimum else Finding.ABSENT
    return FeatureCheck("lease", "Lease", finding, f"{years}-year lease")


def build_checks(listing: dict, persona, extracted: dict | None = None) -> list[FeatureCheck]:
    """Only the things this buyer actually asked for are checked."""
    checks = [resolve_bedrooms(listing, persona.min_bedrooms or 1)]

    if persona.needs_outdoor_space:
        checks.append(resolve_outdoor_space(listing, extracted))
    if persona.needs_parking:
        checks.append(resolve_parking(listing, extracted))
    if persona.min_lease_years:
        checks.append(resolve_lease(listing, persona.min_lease_years))

    return checks
