"""
Property enrichment — one concurrent fan-out, then deterministic scoring.

Replaces the previous agentic loop, which made roughly five sequential Claude
round trips to decide which tools to call, then executed those tools one after
another. Every tool took the same single argument and was called every time, so
the loop was choosing nothing while costing minutes.

Here the providers are called together with asyncio.gather, and a provider that
fails degrades to an `unavailable` signal instead of failing the request.
"""
from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass, field, is_dataclass
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.signals import Signal
from app.models.models import Persona
from app.services.providers import comparables, commute, crime, geocode, schools
from app.services.running_costs import build_running_costs
from app.services.scoring import (
    FitResult,
    combine,
    score_area,
    score_commute,
    score_safety,
    score_schools,
    score_space,
    score_value,
)

log = structlog.get_logger()


@dataclass
class WorkplaceCommute:
    label: str
    signal: Signal


@dataclass
class Enrichment:
    location: Signal
    crime: Signal
    schools: Signal
    comparables: Signal
    stations: Signal
    running_costs: Signal
    commutes: list[WorkplaceCommute] = field(default_factory=list)
    fit: FitResult | None = None
    value_summary: str = ""


def _serialise(value: Any) -> Any:
    if isinstance(value, Signal):
        return {
            "status": value.status.value,
            "value": _serialise(value.value),
            "source": value.source,
            "source_url": value.source_url,
            "fetched_at": value.fetched_at.isoformat() if value.fetched_at else None,
            "reason": value.reason,
        }
    # Types with derived values the client needs (totals, £/sqft) expose an
    # explicit as_dict — asdict() only walks declared fields, so computed
    # properties would silently vanish from the API.
    if hasattr(value, "as_dict") and callable(value.as_dict):
        return {k: _serialise(v) for k, v in value.as_dict().items()}
    if is_dataclass(value) and not isinstance(value, type):
        return {k: _serialise(v) for k, v in asdict(value).items()}
    if isinstance(value, dict):
        return {k: _serialise(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialise(v) for v in value]
    return value


async def _safe(coro, label: str) -> Signal:
    """A provider blowing up must cost that one dimension, not the request."""
    try:
        return await coro
    except Exception as e:
        log.error("provider_failed", provider=label, error=str(e))
        return Signal.missing(f"{label} lookup failed unexpectedly.")


async def enrich_property(
    session: AsyncSession,
    listing: dict,
    persona: Persona | None,
) -> Enrichment:
    postcode = (listing.get("postcode") or "").strip()

    location_signal = await geocode.lookup_postcode(postcode)
    if not location_signal.ok:
        # Without coordinates nothing downstream can run; say so once rather
        # than emitting five identical failures.
        reason = location_signal.reason or "Location unknown."
        return Enrichment(
            location=location_signal,
            crime=Signal.missing(reason),
            schools=Signal.missing(reason),
            comparables=await _safe(comparables.sold_prices(postcode), "Land Registry"),
            stations=Signal.missing(reason),
            running_costs=build_running_costs(listing),
            commutes=[],
            fit=None,
        )

    loc = location_signal.value
    workplaces = (persona.workplaces or []) if persona else []

    commute_tasks = [
        _safe(
            commute.journey_time(
                loc.latitude, loc.longitude,
                float(w["latitude"]), float(w["longitude"]),
                modes=w.get("modes") or commute.DEFAULT_MODES,
            ),
            f"Commute to {w.get('label', 'workplace')}",
        )
        for w in workplaces
        if w.get("latitude") is not None and w.get("longitude") is not None
    ]

    # Everything below is independent — one round trip, not five.
    crime_task = _safe(crime.crime_summary(loc.latitude, loc.longitude), "Crime")
    schools_task = _safe(schools.schools_near(session, loc.easting, loc.northing), "Schools")
    comparables_task = _safe(comparables.sold_prices(loc.postcode), "Land Registry")
    stations_task = _safe(commute.nearest_stations(loc.latitude, loc.longitude), "Stations")

    results = await asyncio.gather(
        crime_task, schools_task, comparables_task, stations_task, *commute_tasks
    )
    crime_signal, schools_signal, comps_signal, stations_signal = results[:4]
    commute_signals = results[4:]

    commutes = [
        WorkplaceCommute(label=w.get("label") or "Work", signal=sig)
        for w, sig in zip(
            [w for w in workplaces if w.get("latitude") is not None], commute_signals
        )
    ]

    # Derived from the listing itself — no network call, so it is computed
    # rather than fetched.
    costs_signal = build_running_costs(listing)

    fit = _score(
        listing, persona, commutes, crime_signal, schools_signal,
        comps_signal, costs_signal, location_signal,
    )

    return Enrichment(
        location=location_signal,
        crime=crime_signal,
        schools=schools_signal,
        comparables=comps_signal,
        stations=stations_signal,
        running_costs=costs_signal,
        commutes=commutes,
        fit=fit,
    )


def _score(listing, persona, commutes, crime_signal, schools_signal, comps_signal,
           costs_signal=None, location_signal=None) -> FitResult | None:
    if persona is None:
        return None

    from app.services.personas import normalise_weights

    max_minutes = 45
    for w in persona.workplaces or []:
        if w.get("max_minutes"):
            max_minutes = int(w["max_minutes"])
            break

    preferred_areas = list(persona.preferred_areas or [])

    raw = {
        "commute": score_commute([(c.label, c.signal) for c in commutes], max_minutes),
        "area": score_area(location_signal, preferred_areas) if location_signal
                else (None, ""),
        "safety": score_safety(crime_signal),
        "schools": score_schools(schools_signal),
        "value": score_value(
            comps_signal, listing.get("price"), costs_signal, persona.price_max,
        ),
        "space": score_space(listing, persona),
    }

    reasons = {
        "commute": (
            "Add where you work to see journey times."
            if not commutes
            else next((c.signal.reason for c in commutes if c.signal.reason), "No route found.")
        ),
        "area": (
            "Add the parts of London you want to live in and we'll score how "
            "close each property is."
            if not preferred_areas
            else "This property's location couldn't be resolved."
        ),
        "safety": crime_signal.reason or "",
        "schools": schools_signal.reason or "",
        "value": comps_signal.reason or "No sold prices to compare against.",
        "space": "Not enough detail in the listing to check your requirements.",
    }

    return combine(raw, normalise_weights(persona.weights), reasons)


def serialise_enrichment(enrichment: Enrichment) -> dict:
    """Flatten to JSON for storage and for the client, preserving provenance
    and every 'unavailable' reason so the UI can render them verbatim."""
    payload = {
        "location": _serialise(enrichment.location),
        "crime": _serialise(enrichment.crime),
        "schools": _serialise(enrichment.schools),
        "comparables": _serialise(enrichment.comparables),
        "stations": _serialise(enrichment.stations),
        "running_costs": _serialise(enrichment.running_costs),
        "value_summary": enrichment.value_summary,
        "commutes": [
            {"label": c.label, **_serialise(c.signal)} for c in enrichment.commutes
        ],
    }
    if enrichment.fit:
        payload["fit"] = {
            "score": enrichment.fit.score,
            "coverage": enrichment.fit.coverage,
            "dimensions": [_serialise(d) for d in enrichment.fit.dimensions],
        }
    return payload
