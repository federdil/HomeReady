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
DIMENSIONS = ("commute", "safety", "schools", "value", "space")

DIMENSION_LABELS = {
    "commute": "Commute",
    "safety": "Safety",
    "schools": "Schools",
    "value": "Value for money",
    "space": "Space & features",
}

DIMENSION_BLURBS = {
    "commute": "Door-to-door journey time to the places you go most.",
    "safety": "Recorded crime in the immediate area.",
    "schools": "Schools within walking distance.",
    "value": "Asking price against what neighbours actually paid.",
    "space": "How well the property matches what you said you need.",
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


PRESETS: list[PersonaPreset] = [
    PersonaPreset(
        key="young_professionals",
        label="Young professional couple",
        description="Two incomes, two commutes. Time matters more than square footage.",
        weights={"commute": 95, "safety": 55, "schools": 5, "value": 65, "space": 35},
        min_bedrooms=1,
    ),
    PersonaPreset(
        key="growing_family",
        label="Growing family",
        description="Schools and a safe street come first; a longer commute is acceptable.",
        weights={"commute": 40, "safety": 88, "schools": 90, "value": 55, "space": 78},
        min_bedrooms=3,
        needs_outdoor_space=True,
    ),
    PersonaPreset(
        key="first_time_solo",
        label="First-time solo buyer",
        description="Stretching to afford it. Every pound of value counts.",
        weights={"commute": 72, "safety": 60, "schools": 8, "value": 92, "space": 40},
        min_bedrooms=1,
    ),
    PersonaPreset(
        key="space_over_speed",
        label="Space over speed",
        description="Room to breathe and somewhere outside, even if it means travelling further.",
        weights={"commute": 25, "safety": 65, "schools": 20, "value": 62, "space": 90},
        min_bedrooms=3,
        needs_outdoor_space=True,
        needs_parking=True,
    ),
]

PRESETS_BY_KEY = {p.key: p for p in PRESETS}

DEFAULT_WEIGHTS = {"commute": 60, "safety": 60, "schools": 40, "value": 60, "space": 50}


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
