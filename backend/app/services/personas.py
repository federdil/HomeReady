"""
Persona presets and the dimensions a property is judged on.

The whole point of the rebuild: there is no universal "good area". A postcode
that scores brilliantly for a couple optimising a commute scores poorly for a
family optimising schools and space. Weights come from the buyer, stay visible,
and stay editable — the score is an argument the user can inspect, not a verdict.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Flood risk was removed from the product: no dependable Zone 1/2/3 source was
# found, and the previous implementation reported borough-scale flood alerts as
# if they were property-level risk.
DIMENSIONS = ("commute", "area", "safety", "schools", "value", "space")

DIMENSION_LABELS = {
    "commute": "Commute",
    "area": "Preferred areas",
    "safety": "Safety",
    "schools": "Schools",
    "value": "Value for money",
    "space": "Space & features",
}

DIMENSION_BLURBS = {
    "commute": "Door-to-door journey time to the places you go most.",
    "area": "How close it is to the parts of London you already want to live in.",
    "safety": "Recorded crime in the immediate area.",
    "schools": "Schools within walking distance.",
    "value": "Asking price against what neighbours actually paid, and against your ceiling.",
    "space": "How well the property matches what you said you need.",
}

# The rule behind each number, written for the buyer rather than for a
# maintainer. A score nobody can interrogate is a score nobody should trust, and
# "trust us, it's 38" is exactly the posture this product exists to replace — so
# every band, threshold and known weakness below is the one the code actually
# applies. If a rule in scoring.py changes, this text changes with it.
DIMENSION_METHODS = {
    "commute": (
        "Scored on your longest journey, never the average — if one person's "
        "commute is unacceptable then so is the property, however good the "
        "other's is.\n\n"
        "Journeys are real door-to-door times from TfL for a weekday morning, "
        "including the walk at each end and any changes. Against the ceiling "
        "you set for that workplace: a journey of 40% of it scores 100, the "
        "ceiling itself scores 50, and 160% of it scores 0.\n\n"
        "Add no workplace and this drops out of your score rather than being "
        "guessed at."
    ),
    "area": (
        "Straight-line distance to the nearest area on your shortlist. They are "
        "alternatives, so being in one of them is the whole point and the others "
        "do not drag the score down.\n\n"
        "Inside 1 km scores 100 — roughly a London neighbourhood's own radius — "
        "falling to 0 at 6 km, which is most of the way across a borough and "
        "into two others.\n\n"
        "Distance rather than travel time on purpose. This asks whether it is "
        "the part of London you want; how long it takes to get anywhere is the "
        "commute dimension's job."
    ),
    "safety": (
        "Recorded street-level crime within 800 m — about a ten-minute walk — "
        "for the most recent month the police have published.\n\n"
        # Plain text, not markdown — the client renders these as paragraphs and
        # nothing more, so an asterisk would reach the buyer as an asterisk.
        "A count inside a fixed radius tracks how busy a place is as much as "
        "how risky it is: a high street records more crime than the cul-de-sac "
        "behind it partly because more people walk down it. Nothing free supplies a "
        "population figure to divide that out, so rather than invent a crime "
        "rate the score says something narrower and true — where this area sits "
        "against 191 sampled Greater London postcodes, which carry the same "
        "bias.\n\n"
        "About 44 crimes a month scores 90 and about 1,700 scores 8, on a log "
        "scale, nudged a few points by how much of it is violence rather than "
        "theft. A mid-range score means ordinary for London, not safe in "
        "absolute terms.\n\n"
        "The score never reaches 0 or 100. A single month's count supports "
        "neither \u201cnowhere is worse\u201d nor \u201cno crime happens here\u201d."
    ),
    "schools": (
        "State and independent schools within 1.5 km, from the Department for "
        "Education's register.\n\n"
        "40% of the score is how many primaries are nearby, with four counting "
        "as full marks — the fourth adds little. 30% is secondaries, where two "
        "is full marks. The last 30% is how close the nearest school of any kind "
        "is: 200 m scores full marks, 1.5 km scores none.\n\n"
        "No Ofsted judgement is published in a form we can use, so this measures "
        "provision and proximity and does not claim to measure quality. A "
        "postcode with four poor schools scores the same as one with four good "
        "ones."
    ),
    "value": (
        "The asking price against homes that actually sold in this postcode, "
        "from HM Land Registry.\n\n"
        "Level with the local median scores well: 25% below it scores 100, and "
        "75% above scores 0. The band runs wide deliberately — you are comparing "
        "an asking price today with sales registered over the past few years, so "
        "some premium is normal rather than damning.\n\n"
        "Annual running costs then adjust that by 30%, because a flat priced "
        "like its neighbours while carrying a £5,000 service charge is not the "
        "same purchase.\n\n"
        "Finally your budget caps it. Past your ceiling, value cannot exceed how "
        "affordable it is — 20% over puts it on the floor however well it is "
        "priced, because the best-value house on the street is still one you "
        "cannot complete on.\n\n"
        "Known weakness: Land Registry does not publish bedroom counts, so the "
        "median mixes every property size in the postcode. A large house in an "
        "area of flats looks expensive for reasons that have nothing to do with "
        "value."
    ),
    "space": (
        "What the listing states, checked against what you asked for: bedrooms, "
        "outdoor space, parking, lease length, the kind of home and the kind of "
        "building. The score is the share of your stated requirements it "
        "meets.\n\n"
        "Only things you actually asked for are checked — leave a preference "
        "blank and it is not held against any property.\n\n"
        "A requirement the listing says nothing about is left out rather than "
        "failed. An agent leaving a field blank tells you nothing about the "
        "property, and counting silence as a no would penalise you for their "
        "incomplete listing."
    ),
}

# Named so the buyer can go and check. Every one of these is public and free.
DIMENSION_SOURCES = {
    "commute": "TfL Unified API",
    "area": "postcodes.io",
    "safety": "data.police.uk",
    "schools": "DfE Get Information About Schools",
    "value": "HM Land Registry Price Paid, and the listing",
    "space": "The listing",
}


@dataclass
class PersonaPreset:
    key: str
    label: str
    description: str
    weights: dict[str, int]
    min_bedrooms: int = 1
    needs_outdoor_space: bool = False
    needs_parking: bool = False
    property_types: list[str] = field(default_factory=list)
    preferred_periods: list[str] = field(default_factory=list)


PRESETS: list[PersonaPreset] = [
    PersonaPreset(
        key="young_professionals",
        label="Young professional couple",
        description="Two incomes, two commutes. Time matters more than square footage.",
        weights={"commute": 95, "area": 65, "safety": 55, "schools": 5,
                 "value": 65, "space": 35},
        min_bedrooms=1,
    ),
    PersonaPreset(
        key="growing_family",
        label="Growing family",
        description="Schools and a safe street come first; a longer commute is acceptable.",
        weights={"commute": 40, "area": 70, "safety": 88, "schools": 90,
                 "value": 55, "space": 78},
        min_bedrooms=3,
        needs_outdoor_space=True,
    ),
    PersonaPreset(
        key="first_time_solo",
        label="First-time solo buyer",
        description="Stretching to afford it. Every pound of value counts.",
        weights={"commute": 72, "area": 55, "safety": 60, "schools": 8,
                 "value": 92, "space": 40},
        min_bedrooms=1,
    ),
    PersonaPreset(
        key="space_over_speed",
        label="Space over speed",
        description="Room to breathe and somewhere outside, even if it means travelling further.",
        weights={"commute": 25, "area": 60, "safety": 65, "schools": 20,
                 "value": 62, "space": 90},
        min_bedrooms=3,
        needs_outdoor_space=True,
        needs_parking=True,
    ),
]

PRESETS_BY_KEY = {p.key: p for p in PRESETS}

DEFAULT_WEIGHTS = {
    "commute": 60, "area": 60, "safety": 60, "schools": 40, "value": 60, "space": 50,
}


def normalise_weights(weights: dict | None) -> dict[str, int]:
    """Accept whatever the client sent and return a complete, clamped set.

    Unknown keys are dropped rather than trusted — a stale client sending a
    retired dimension (flood risk, say) must not silently create one.
    """
    incoming = weights or {}
    result: dict[str, int] = {}
    for dimension in DIMENSIONS:
        raw = incoming.get(dimension, DEFAULT_WEIGHTS[dimension])
        try:
            value = int(raw)
        except (TypeError, ValueError):
            value = DEFAULT_WEIGHTS[dimension]
        result[dimension] = max(0, min(100, value))
    return result
