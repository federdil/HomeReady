"""
All feature API routes.
Pattern: thin route → service → Claude → response.
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
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
async def get_journey_stages():
    """Return the default journey stage structure."""
    from app.services.features import STAGE_DEFAULTS
    return {"stages": STAGE_DEFAULTS}


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
