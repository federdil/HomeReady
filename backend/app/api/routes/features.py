"""
All feature API routes.
Pattern: thin route → service → Claude → response.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.auth import get_current_user, get_optional_user
from app.core.claude import ClaudeError
from app.models.schemas import (
    CostCalculatorRequest, CostCalculatorResponse,
    ListingDecoderRequest, ListingDecoderResponse,
    DocumentExplainerRequest, DocumentExplainerResponse,
    SurveyInterpreterRequest, SurveyInterpreterResponse,
    OfferStrategyRequest, OfferStrategyResponse,
    FetchListingRequest, FetchListingResponse,
    SavePropertyRequest, SavedPropertyResponse, UpdatePropertyNotesRequest,
)
from app.services.features import (
    calculate_costs, decode_listing,
    explain_document, interpret_survey,
    get_offer_strategy,
)
from app.services.rightmove import fetch_listing, RightmoveError
import pypdf
import io

router = APIRouter(prefix="/api/v1", tags=["features"])

MAX_PDF_BYTES = 10 * 1024 * 1024  # 10MB


def _extract_pdf_text(content: bytes, label: str = "PDF") -> str:
    """Extract text from PDF bytes. Raises HTTPException on validation failure."""
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail=f"{label} exceeds the 10MB limit.")
    try:
        reader = pypdf.PdfReader(io.BytesIO(content))
        if reader.is_encrypted:
            raise HTTPException(status_code=400, detail=f"{label} is password-protected. Please remove the password and try again.")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail=f"Could not read {label}. Make sure it is a text-based PDF, not a scanned image.")
    if not text.strip():
        raise HTTPException(status_code=400, detail=f"No text found in {label}. Scanned image PDFs are not supported — please use a text-based PDF.")
    return text


def _handle_claude_error(e: Exception) -> None:
    """Convert ClaudeError to HTTPException, re-raise others."""
    if isinstance(e, ClaudeError):
        raise HTTPException(status_code=e.status_code, detail=e.user_message)
    import structlog
    structlog.get_logger().error("unhandled_route_error", error=repr(e))
    raise HTTPException(status_code=500, detail=f"Something went wrong: {type(e).__name__}: {str(e)[:200]}")


# ── Stage 1: Financial Readiness ───────────────────────────────────────────
@router.post("/readiness/costs", response_model=CostCalculatorResponse)
async def get_cost_breakdown(req: CostCalculatorRequest):
    try:
        return await calculate_costs(req)
    except Exception as e:
        _handle_claude_error(e)


# ── Stage 3: Offer Strategy ───────────────────────────────────────────────
@router.post("/offer/strategy", response_model=OfferStrategyResponse)
async def create_offer_strategy(req: OfferStrategyRequest):
    try:
        return await get_offer_strategy(req)
    except Exception as e:
        _handle_claude_error(e)


# ── Rightmove URL fetch ───────────────────────────────────────────────────
@router.post("/evaluate/fetch-listing", response_model=FetchListingResponse)
async def fetch_rightmove_listing(req: FetchListingRequest):
    try:
        return await fetch_listing(req.url)
    except RightmoveError as e:
        raise HTTPException(status_code=422, detail=e.user_message)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not fetch the listing. Please paste the text manually.")


# ── Saved properties (shortlist) ──────────────────────────────────────────
@router.post("/properties", response_model=SavedPropertyResponse, status_code=201)
async def save_property(
    req: SavePropertyRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    try:
        from app.models.models import SavedProperty
        import uuid
        prop = SavedProperty(
            user_id=uuid.UUID(user_id),
            **req.model_dump(),
        )
        db.add(prop)
        await db.commit()
        await db.refresh(prop)
        return prop
    except Exception as e:
        import structlog
        structlog.get_logger().error("save_property_error", error=repr(e))
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


@router.get("/properties", response_model=list[SavedPropertyResponse])
async def list_properties(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    from app.models.models import SavedProperty
    from sqlalchemy import select
    import uuid
    result = await db.execute(
        select(SavedProperty)
        .where(SavedProperty.user_id == uuid.UUID(user_id))
        .order_by(SavedProperty.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/properties/{property_id}/notes", response_model=SavedPropertyResponse)
async def update_property_notes(
    property_id: str,
    req: UpdatePropertyNotesRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    from app.models.models import SavedProperty
    from sqlalchemy import select
    import uuid
    result = await db.execute(
        select(SavedProperty)
        .where(SavedProperty.id == uuid.UUID(property_id))
        .where(SavedProperty.user_id == uuid.UUID(user_id))
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    prop.notes = req.notes
    await db.commit()
    await db.refresh(prop)
    return prop


@router.delete("/properties/{property_id}", status_code=204)
async def delete_property(
    property_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    from app.models.models import SavedProperty
    from sqlalchemy import select
    import uuid
    result = await db.execute(
        select(SavedProperty)
        .where(SavedProperty.id == uuid.UUID(property_id))
        .where(SavedProperty.user_id == uuid.UUID(user_id))
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    await db.delete(prop)
    await db.commit()


# ── Stage 2: Property Evaluation ──────────────────────────────────────────
@router.post("/evaluate/listing", response_model=ListingDecoderResponse)
async def decode_property_listing(req: ListingDecoderRequest):
    try:
        return await decode_listing(req)
    except Exception as e:
        _handle_claude_error(e)


# ── Stage 4: Legal & Survey ────────────────────────────────────────────────
@router.post("/legal/document", response_model=DocumentExplainerResponse)
async def explain_legal_document(req: DocumentExplainerRequest):
    try:
        return await explain_document(req)
    except Exception as e:
        _handle_claude_error(e)


@router.post("/legal/document/upload", response_model=DocumentExplainerResponse)
async def explain_uploaded_document(
    file: UploadFile = File(...),
    document_type: str = "other",
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    content = await file.read()
    text = _extract_pdf_text(content, "document")
    try:
        return await explain_document(DocumentExplainerRequest(document_text=text, document_type=document_type))
    except Exception as e:
        _handle_claude_error(e)


@router.post("/legal/survey", response_model=SurveyInterpreterResponse)
async def interpret_property_survey(req: SurveyInterpreterRequest):
    try:
        return await interpret_survey(req)
    except Exception as e:
        _handle_claude_error(e)


@router.post("/legal/survey/upload", response_model=SurveyInterpreterResponse)
async def interpret_uploaded_survey(
    file: UploadFile = File(...),
    survey_level: str = "level_2",
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    content = await file.read()
    text = _extract_pdf_text(content, "survey")
    try:
        return await interpret_survey(SurveyInterpreterRequest(survey_text=text, survey_level=survey_level))
    except Exception as e:
        _handle_claude_error(e)


# ── Journey ────────────────────────────────────────────────────────────────
@router.get("/journey/stages")
async def get_journey_stages(
    db: AsyncSession = Depends(get_db),
    user_id: str | None = Depends(get_optional_user),
):
    from app.services.features import STAGE_DEFAULTS
    from sqlalchemy import select
    from app.models.models import Journey
    import copy, uuid as _uuid

    stages = copy.deepcopy(STAGE_DEFAULTS)

    if user_id:
        try:
            result = await db.execute(select(Journey).where(Journey.user_id == _uuid.UUID(user_id)))
            journey = result.scalar_one_or_none()
            if journey and journey.stage_statuses:
                for stage in stages:
                    if stage["stage"] in journey.stage_statuses:
                        stage["status"] = journey.stage_statuses[stage["stage"]]
        except Exception:
            pass

    return {"stages": stages}


@router.patch("/journey/stage")
async def update_journey_stage(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models.models import Journey
    import uuid

    stage = body.get("stage")
    status = body.get("status")
    if not stage or status not in ("not_started", "in_progress", "complete"):
        raise HTTPException(status_code=400, detail="Invalid stage or status")

    result = await db.execute(select(Journey).where(Journey.user_id == uuid.UUID(user_id)))
    journey = result.scalar_one_or_none()

    if not journey:
        journey = Journey(user_id=uuid.UUID(user_id), stage_statuses={stage: status})
        db.add(journey)
    else:
        statuses = dict(journey.stage_statuses or {})
        statuses[stage] = status
        journey.stage_statuses = statuses

    await db.commit()
    return {"ok": True, "stage": stage, "status": status}


# ── Health ─────────────────────────────────────────────────────────────────
@router.get("/health")
async def health():
    return {"status": "ok", "service": "HomeReady API"}


# ── Stage 2: Neighbourhood Intelligence Agent ──────────────────────────────
from app.models.schemas import NeighbourhoodRequest, NeighbourhoodResponse
from app.services.features import run_neighbourhood_agent, stream_neighbourhood_agent
from fastapi.responses import StreamingResponse
import json

@router.post("/evaluate/neighbourhood", response_model=NeighbourhoodResponse)
async def get_neighbourhood_briefing(req: NeighbourhoodRequest):
    try:
        return await run_neighbourhood_agent(req)
    except Exception as e:
        _handle_claude_error(e)


@router.post("/evaluate/neighbourhood/stream")
async def stream_neighbourhood_briefing(req: NeighbourhoodRequest):
    """SSE endpoint — streams tool_start / tool_done / complete events."""
    async def generate():
        try:
            async for event in stream_neighbourhood_agent(req):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            err = {"event": "error", "message": str(e)}
            yield f"data: {json.dumps(err)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
