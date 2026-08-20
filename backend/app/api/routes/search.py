"""
Persona and property-assessment routes — the new core of the product.

Flow: the buyer describes themselves once (persona), then drops property links.
Each link is scraped, enriched from public data sources concurrently, and
scored against that persona's weights.
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.models import Persona, SavedProperty
from app.models.schemas import (
    AssessedPropertyResponse,
    AssessPropertyRequest,
    DimensionMeta,
    GeocodeRequest,
    GeocodeResponse,
    OptionMeta,
    PersonaPresetResponse,
    PersonaRequest,
    PersonaResponse,
    PlaceSuggestion,
    PlaceSuggestResponse,
)
from app.services.enrichment import enrich_property, serialise_enrichment
from app.services.features import summarise_value
from app.services.personas import (
    DIMENSION_BLURBS,
    DIMENSION_LABELS,
    DIMENSION_METHODS,
    DIMENSION_SOURCES,
    DIMENSIONS,
    PRESETS,
    normalise_weights,
)
from app.services.property_style import (
    BUILT_FORM_KEYS,
    BUILT_FORMS,
    PERIOD_KEYS,
    PERIODS,
)
from app.services.providers import geocode, places
from app.services.scoring import combine, score_space
from app.services.rightmove import RightmoveError, fetch_listing

log = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["search"])


# ── Persona ───────────────────────────────────────────────────────────────
@router.get("/persona/presets", response_model=dict)
async def list_presets():
    """Starting points, so nobody faces an empty form."""
    return {
        "presets": [
            PersonaPresetResponse(
                key=p.key,
                label=p.label,
                description=p.description,
                weights=p.weights,
                min_bedrooms=p.min_bedrooms,
                needs_outdoor_space=p.needs_outdoor_space,
                needs_parking=p.needs_parking,
                property_types=p.property_types,
                preferred_periods=p.preferred_periods,
            ).model_dump()
            for p in PRESETS
        ],
        "dimensions": [
            DimensionMeta(
                key=k,
                label=DIMENSION_LABELS[k],
                blurb=DIMENSION_BLURBS[k],
                method=DIMENSION_METHODS[k],
                source=DIMENSION_SOURCES[k],
            ).model_dump()
            for k in DIMENSIONS
        ],
        # Served rather than hard-coded in the client: these keys are what the
        # space dimension matches on, so a label editing itself into a mismatch
        # would silently stop a stated preference from ever being met.
        "built_forms": [
            OptionMeta(key=k, label=label).model_dump() for k, label in BUILT_FORMS
        ],
        "periods": [
            OptionMeta(key=k, label=label, blurb=blurb).model_dump()
            for k, label, blurb in PERIODS
        ],
    }


async def _current_persona(db: AsyncSession, user_id: str) -> Persona | None:
    result = await db.execute(
        select(Persona)
        .where(Persona.user_id == user_id)
        .order_by(Persona.updated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _persona_out(p: Persona) -> PersonaResponse:
    return PersonaResponse(
        id=str(p.id),
        label=p.label,
        preset_key=p.preset_key,
        price_min=p.price_min,
        price_max=p.price_max,
        deposit=p.deposit,
        min_bedrooms=p.min_bedrooms,
        needs_outdoor_space=p.needs_outdoor_space,
        needs_parking=p.needs_parking,
        property_types=p.property_types or [],
        preferred_periods=p.preferred_periods or [],
        min_lease_years=p.min_lease_years,
        weights=normalise_weights(p.weights),
        workplaces=p.workplaces or [],
        preferred_areas=p.preferred_areas or [],
    )


@router.get("/persona")
async def get_persona(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    persona = await _current_persona(db, user_id)
    return _persona_out(persona).model_dump() if persona else None


@router.put("/persona", response_model=PersonaResponse)
async def save_persona(
    req: PersonaRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    persona = await _current_persona(db, user_id)
    if persona is None:
        persona = Persona(user_id=user_id)
        db.add(persona)

    persona.label = req.label
    persona.preset_key = req.preset_key
    persona.price_min = req.price_min
    persona.price_max = req.price_max
    persona.deposit = req.deposit
    persona.min_bedrooms = req.min_bedrooms
    persona.needs_outdoor_space = req.needs_outdoor_space
    persona.needs_parking = req.needs_parking
    persona.property_types = _known_only(req.property_types, BUILT_FORM_KEYS)
    persona.preferred_periods = _known_only(req.preferred_periods, PERIOD_KEYS)
    persona.min_lease_years = req.min_lease_years
    persona.weights = normalise_weights(req.weights)
    persona.workplaces = [w.model_dump() for w in req.workplaces]
    persona.preferred_areas = [a.model_dump() for a in req.preferred_areas]

    await db.flush()
    return _persona_out(persona)


def _known_only(values: list[str], allowed: tuple[str, ...]) -> list[str]:
    """Drop anything not in the current vocabulary, the same way
    `normalise_weights` drops retired dimensions. A stale client sending a key
    scoring no longer understands must not create a preference that can never
    be met — that would fail the space dimension on every property, for ever.
    Order is preserved and duplicates collapse."""
    seen: set[str] = set()
    return [
        v for v in values
        if v in allowed and not (v in seen or seen.add(v))
    ]


# ── Place lookup ──────────────────────────────────────────────────────────
@router.post("/places/suggest", response_model=PlaceSuggestResponse)
async def suggest_places(req: GeocodeRequest):
    """London places matching what has been typed so far.

    Exists so a workplace or a preferred area is *chosen* rather than guessed
    at: everything offered here has already been resolved to coordinates and
    already confirmed to be inside Greater London, which is the check that
    matters — a persona pointing at Manchester scores every property against a
    journey TfL cannot plan.

    An empty list is a normal answer. "Amazon UK LHR16" is not in open map data
    under that name, and neither is any other internal site code.
    """
    return PlaceSuggestResponse(
        suggestions=[
            PlaceSuggestion(
                label=p.label,
                description=p.description,
                postcode=p.postcode,
                district=p.district,
                latitude=p.latitude,
                longitude=p.longitude,
            )
            for p in await places.suggest(req.query)
        ]
    )


@router.post("/geocode", response_model=GeocodeResponse)
async def geocode_place(req: GeocodeRequest):
    """Resolve a typed workplace or preferred area to coordinates.

    Kept alongside the suggestions for anyone who types a full postcode and
    presses enter without waiting. Anywhere outside Greater London comes back
    `found: false` with a reason that names where it actually is, rather than
    being accepted and then scored against data that stops at the M25.
    """
    signal = await geocode.geocode_address(req.query)
    if not signal.ok:
        return GeocodeResponse(found=False, reason=signal.reason)

    loc = signal.value
    return GeocodeResponse(
        found=True,
        label=loc.district or loc.postcode or req.query,
        postcode=loc.postcode,
        district=loc.district,
        latitude=loc.latitude,
        longitude=loc.longitude,
    )


# ── Property assessment ───────────────────────────────────────────────────
def _property_out(p: SavedProperty) -> AssessedPropertyResponse:
    return AssessedPropertyResponse(
        id=str(p.id),
        rightmove_url=p.rightmove_url,
        address=p.address,
        postcode=p.postcode,
        price=p.price,
        property_type=p.property_type,
        bedrooms=p.bedrooms,
        latitude=p.latitude,
        longitude=p.longitude,
        fit_score=p.fit_score,
        fit_coverage=p.fit_coverage,
        enrichment=p.enrichment or {},
        decoded_result=p.decoded_result,
        notes=p.notes,
        is_active=p.is_active,
    )


@router.post("/properties/assess", response_model=AssessedPropertyResponse)
async def assess_property(
    req: AssessPropertyRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    if not req.url and not req.postcode:
        raise HTTPException(400, "Provide a property link or a postcode.")

    listing: dict = {}
    if req.url:
        try:
            listing = await fetch_listing(req.url)
        except RightmoveError as e:
            raise HTTPException(400, str(e))
        except Exception as e:
            log.error("listing_fetch_failed", url=req.url, error=str(e))
            raise HTTPException(502, "Couldn't read that listing. Check the link and try again.")
    else:
        listing = {
            "postcode": req.postcode,
            "price": req.price,
            "listing_text": req.listing_text or "",
        }

    if not listing.get("postcode"):
        # Overseas listings are a real Rightmove category and have no UK
        # postcode, so nothing downstream can run for them. Say which case it is
        # rather than reporting a generic failure.
        address = listing.get("address") or ""
        raise HTTPException(
            422,
            f"“{address}” has no UK postcode, so it can't be placed on the map "
            "or scored. HomeReady currently covers London only."
            if address else
            "That listing has no UK postcode, so it can't be placed on the map.",
        )

    persona = await _current_persona(db, user_id)
    enrichment = await enrich_property(db, listing, persona)
    payload = serialise_enrichment(enrichment)

    location = enrichment.location.value if enrichment.location.ok else None

    existing = None
    if listing.get("rightmove_url"):
        existing = (
            await db.execute(
                select(SavedProperty).where(
                    SavedProperty.user_id == user_id,
                    SavedProperty.rightmove_url == listing["rightmove_url"],
                )
            )
        ).scalar_one_or_none()

    record = existing or SavedProperty(user_id=user_id)
    record.rightmove_url = listing.get("rightmove_url")
    record.address = listing.get("address")
    record.postcode = listing.get("postcode")
    record.price = int(listing["price"]) if listing.get("price") else None
    record.property_type = listing.get("property_type")
    record.bedrooms = listing.get("bedrooms")
    record.latitude = location.latitude if location else None
    record.longitude = location.longitude if location else None
    record.enrichment = payload
    record.persona_id = persona.id if persona else None
    record.fit_score = enrichment.fit.score if enrichment.fit else None
    record.fit_coverage = enrichment.fit.coverage if enrichment.fit else None
    record.is_active = bool(listing.get("is_active", True))

    if req.save:
        if existing is None:
            db.add(record)
        await db.flush()

    return _property_out(record)


@router.get("/properties/assessed", response_model=list[AssessedPropertyResponse])
async def list_assessed(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedProperty)
        .where(SavedProperty.user_id == user_id)
        .order_by(SavedProperty.created_at.desc())
    )
    return [_property_out(p) for p in result.scalars().all()]


@router.post("/properties/rescore", response_model=list[AssessedPropertyResponse])
async def rescore_all(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Re-run every saved property against the current persona.

    The client recomputes weighted totals locally while sliders move, so this
    exists for persistence and for when workplaces change — which does require
    fetching new journey times.
    """
    persona = await _current_persona(db, user_id)
    if persona is None:
        raise HTTPException(400, "Set up your persona first.")

    result = await db.execute(
        select(SavedProperty).where(SavedProperty.user_id == user_id)
    )
    properties = list(result.scalars().all())

    for record in properties:
        # Re-fetch rather than rebuilding from stored columns: running costs,
        # floor area and tenure live on the listing and are not all persisted,
        # and re-fetching also picks up a price change or a listing that has
        # since been withdrawn.
        listing: dict = {}
        if record.rightmove_url:
            try:
                listing = await fetch_listing(record.rightmove_url)
            except Exception as e:
                log.warning("rescore_refetch_failed", url=record.rightmove_url, error=str(e))

        if not listing.get("postcode"):
            listing = {
                "postcode": record.postcode,
                "price": record.price,
                "bedrooms": record.bedrooms,
                "tenure_type": "",
                "listing_text": ((record.decoded_result or {}).get("summary") or ""),
            }

        enrichment = await enrich_property(db, listing, persona)
        payload = serialise_enrichment(enrichment)
        # The stored verdict was written against the old weights, so it no
        # longer describes this score. Drop it and let it be rewritten.
        record.enrichment = payload
        record.persona_id = persona.id
        record.fit_score = enrichment.fit.score if enrichment.fit else None
        record.fit_coverage = enrichment.fit.coverage if enrichment.fit else None
        if listing.get("price"):
            record.price = int(listing["price"])
        if "is_active" in listing:
            record.is_active = bool(listing["is_active"])

    await db.flush()
    return [_property_out(p) for p in properties]


@router.post("/properties/{property_id}/summary", response_model=AssessedPropertyResponse)
async def generate_summary(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Write the plain-English verdict for one property.

    Deliberately off the assess path: enrichment returns in about two seconds
    and the pin should appear then, not after a model call four times longer.
    Written when the buyer opens the property, and persisted so it is only
    generated once.
    """
    record = (
        await db.execute(
            select(SavedProperty).where(
                SavedProperty.id == property_id,
                SavedProperty.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if record is None:
        raise HTTPException(404, "Property not found.")

    payload = record.enrichment or {}
    if payload.get("value_summary"):
        return _property_out(record)

    persona = await _current_persona(db, user_id)

    # Re-fetch so the model reads the real description and key features; the
    # database only holds the derived columns.
    listing: dict = {}
    if record.rightmove_url:
        try:
            listing = await fetch_listing(record.rightmove_url)
        except Exception as e:
            log.warning("summary_refetch_failed", url=record.rightmove_url, error=str(e))
    if not listing:
        listing = {
            "address": record.address,
            "price": record.price,
            "bedrooms": record.bedrooms,
            "property_type": record.property_type,
        }

    summary, extracted = await summarise_value(
        listing, payload,
        persona.label if persona else "a first-time buyer",
        persona=persona,
    )

    updated = {**payload}
    if summary:
        updated["value_summary"] = summary

    # The model may have resolved a feature the structured flags left blank —
    # "communal terrace only", or an explicit "no parking". Re-score the space
    # dimension in Python from those facts and refresh the fit.
    if extracted and persona:
        updated = _rescore_space(updated, listing, persona, extracted)
        record.fit_score = (updated.get("fit") or {}).get("score")
        record.fit_coverage = (updated.get("fit") or {}).get("coverage")

    if updated != payload:
        # A JSON column needs a new object to register as modified.
        record.enrichment = updated
        await db.flush()

    return _property_out(record)


def _rescore_space(payload: dict, listing: dict, persona, extracted: dict) -> dict:
    """Recompute the space dimension with the model-extracted facts, then
    recombine. Scoring stays deterministic — only the input facts improved."""
    fit = payload.get("fit") or {}
    dimensions = fit.get("dimensions") or []
    if not dimensions:
        return payload

    score, detail = score_space(listing, persona, extracted)

    raw = {
        d["key"]: (d["score"], d["detail"])
        for d in dimensions
    }
    raw["space"] = (score, detail)
    reasons = {
        d["key"]: d.get("unavailable_reason") or ""
        for d in dimensions
    }
    reasons["space"] = "The listing doesn't say enough to check your requirements."

    result = combine(raw, normalise_weights(persona.weights), reasons)
    return {
        **payload,
        "fit": {
            "score": result.score,
            "coverage": result.coverage,
            "dimensions": [
                {
                    "key": d.key, "label": d.label, "score": d.score,
                    "weight": d.weight, "detail": d.detail,
                    "unavailable_reason": d.unavailable_reason,
                }
                for d in result.dimensions
            ],
        },
        "extracted_features": extracted,
    }
