"""
All feature API routes.
Pattern: thin route → service → Claude → response.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.auth import get_current_user, get_optional_user
from app.models.schemas import (
    CostCalculatorRequest, CostCalculatorResponse,
    ListingDecoderRequest, ListingDecoderResponse,
    DocumentExplainerRequest, DocumentExplainerResponse,
    SurveyInterpreterRequest, SurveyInterpreterResponse,
)
from app.services.features import (
    calculate_costs, decode_listing,
    explain_document, interpret_survey,
)
import pypdf
import io

router = APIRouter(prefix="/api/v1", tags=["features"])


# ── Stage 1: Financial Readiness ───────────────────────────────────────────
@router.post("/readiness/costs", response_model=CostCalculatorResponse)
async def get_cost_breakdown(req: CostCalculatorRequest):
    """Calculate the true total cost of buying a property."""
    try:
        return await calculate_costs(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Stage 2: Property Evaluation ──────────────────────────────────────────
@router.post("/evaluate/listing", response_model=ListingDecoderResponse)
async def decode_property_listing(req: ListingDecoderRequest):
    """Decode estate agent listing language and flag risks."""
    try:
        return await decode_listing(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Stage 4: Legal & Survey ────────────────────────────────────────────────
@router.post("/legal/document", response_model=DocumentExplainerResponse)
async def explain_legal_document(req: DocumentExplainerRequest):
    """Explain a conveyancing document in plain English."""
    try:
        return await explain_document(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/legal/document/upload", response_model=DocumentExplainerResponse)
async def explain_uploaded_document(
    file: UploadFile = File(...),
    document_type: str = "other",
):
    """Upload a PDF and get a plain-English explanation."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    content = await file.read()
    reader = pypdf.PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF.")
    req = DocumentExplainerRequest(document_text=text, document_type=document_type)
    try:
        return await explain_document(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/legal/survey", response_model=SurveyInterpreterResponse)
async def interpret_property_survey(req: SurveyInterpreterRequest):
    """Interpret a homebuyer survey in plain English."""
    try:
        return await interpret_survey(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/legal/survey/upload", response_model=SurveyInterpreterResponse)
async def interpret_uploaded_survey(
    file: UploadFile = File(...),
    survey_level: str = "level_2",
):
    """Upload a survey PDF and get an interpreted breakdown."""
    content = await file.read()
    reader = pypdf.PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from PDF.")
    req = SurveyInterpreterRequest(survey_text=text, survey_level=survey_level)
    try:
        return await interpret_survey(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Journey ────────────────────────────────────────────────────────────────
@router.get("/journey/stages")
async def get_journey_stages(
    db: AsyncSession = Depends(get_db),
    user_id: str | None = Depends(get_optional_user),
):
    """Return journey stages with real progress if user is authenticated."""
    from app.services.features import STAGE_DEFAULTS
    from sqlalchemy import select
    from app.models.models import Journey
    import copy

    stages = copy.deepcopy(STAGE_DEFAULTS)

    if user_id:
        try:
            import uuid as _uuid
            result = await db.execute(select(Journey).where(Journey.user_id == _uuid.UUID(user_id)))
            journey = result.scalar_one_or_none()
            if journey and journey.stage_statuses:
                for stage in stages:
                    if stage["stage"] in journey.stage_statuses:
                        stage["status"] = journey.stage_statuses[stage["stage"]]
        except Exception:
            pass  # never break the sidebar over a persistence error

    return {"stages": stages}


@router.patch("/journey/stage")
async def update_journey_stage(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Mark a stage as in_progress or complete for the authenticated user."""
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
        journey = Journey(
            user_id=uuid.UUID(user_id),
            stage_statuses={stage: status},
        )
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
from app.services.features import run_neighbourhood_agent

@router.post("/evaluate/neighbourhood", response_model=NeighbourhoodResponse)
async def get_neighbourhood_briefing(req: NeighbourhoodRequest):
    """
    Neighbourhood Intelligence Agent.
    Claude autonomously calls transport, flood risk, schools, and
    web search tools then synthesises a structured briefing.
    """
    try:
        return await run_neighbourhood_agent(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
