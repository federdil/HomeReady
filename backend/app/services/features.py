"""
Service layer — orchestrates Claude calls, validation,
and any external API calls. Keeps routes thin.
"""
import json
from app.core.claude import ask_claude, ask_claude_with_document
from app.prompts.prompts import (
    BASE_SYSTEM,
    LISTING_DECODER_SYSTEM,
    DOCUMENT_SYSTEM,
    SURVEY_SYSTEM,
    cost_calculator_prompt,
    listing_decoder_prompt,
    document_explainer_prompt,
    survey_interpreter_prompt,
    negotiation_coach_prompt,
)
from app.models.schemas import (
    CostCalculatorRequest, CostCalculatorResponse,
    ListingDecoderRequest, ListingDecoderResponse,
    DocumentExplainerRequest, DocumentExplainerResponse,
    SurveyInterpreterRequest, SurveyInterpreterResponse,
)
import structlog

log = structlog.get_logger()


def _parse_json(raw: str, label: str) -> dict:
    """Strip any accidental markdown fences and parse JSON."""
    clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError as e:
        log.error("json_parse_error", label=label, error=str(e), raw=raw[:200])
        raise ValueError(f"AI returned invalid JSON for {label}") from e


# ── Cost Calculator ────────────────────────────────────────────────────────
async def calculate_costs(req: CostCalculatorRequest) -> CostCalculatorResponse:
    prompt = cost_calculator_prompt(
        req.property_price, req.postcode,
        req.is_first_time_buyer, req.deposit_amount
    )
    raw = await ask_claude(prompt, system=BASE_SYSTEM, max_tokens=1024)
    data = _parse_json(raw, "cost_calculator")
    return CostCalculatorResponse(**data)


# ── Listing Decoder ────────────────────────────────────────────────────────
async def decode_listing(req: ListingDecoderRequest) -> ListingDecoderResponse:
    prompt = listing_decoder_prompt(req.listing_text, req.property_type or "unknown")
    raw = await ask_claude(prompt, system=LISTING_DECODER_SYSTEM, max_tokens=2048)
    data = _parse_json(raw, "listing_decoder")
    return ListingDecoderResponse(**data)


# ── Document Explainer ─────────────────────────────────────────────────────
async def explain_document(req: DocumentExplainerRequest) -> DocumentExplainerResponse:
    prompt = document_explainer_prompt(req.document_text, req.document_type)
    raw = await ask_claude_with_document(
        prompt=prompt,
        document_text=req.document_text,
        system=DOCUMENT_SYSTEM,
        max_tokens=4000,
    )
    data = _parse_json(raw, "document_explainer")
    return DocumentExplainerResponse(**data)


# ── Survey Interpreter ─────────────────────────────────────────────────────
async def interpret_survey(req: SurveyInterpreterRequest) -> SurveyInterpreterResponse:
    prompt = survey_interpreter_prompt(req.survey_text, req.survey_level)
    raw = await ask_claude_with_document(
        prompt=prompt,
        document_text=req.survey_text,
        system=SURVEY_SYSTEM,
        max_tokens=3000,
    )
    data = _parse_json(raw, "survey_interpreter")
    return SurveyInterpreterResponse(**data)


# ── Journey stage defaults ─────────────────────────────────────────────────
STAGE_DEFAULTS = [
    {"stage": "readiness",  "status": "not_started", "label": "Financial Readiness",   "description": "Understand your budget and true buying costs"},
    {"stage": "evaluation", "status": "not_started", "label": "Property Evaluation",   "description": "Decode listings and assess properties"},
    {"stage": "offer",      "status": "not_started", "label": "Offer & Negotiation",   "description": "Price analysis and negotiation strategy"},
    {"stage": "legal",      "status": "not_started", "label": "Legal & Survey",        "description": "Understand your documents and survey"},
    {"stage": "exchange",   "status": "not_started", "label": "Exchange & Completion", "description": "Checklist and chain visibility"},
    {"stage": "homeowner",  "status": "not_started", "label": "Homeowner Mode",        "description": "Post-completion admin and long-term planning"},
]


# ── Agent: Neighbourhood Intelligence ─────────────────────────────────────
from app.core.claude import ask_claude_with_tools
from app.prompts.neighbourhood_prompt import (
    NEIGHBOURHOOD_AGENT_SYSTEM,
    neighbourhood_briefing_prompt,
)
from app.services.neighbourhood_tools import (
    NEIGHBOURHOOD_TOOL_DEFINITIONS,
    NEIGHBOURHOOD_TOOL_HANDLERS,
)
from app.models.schemas import NeighbourhoodRequest, NeighbourhoodResponse


async def run_neighbourhood_agent(req: NeighbourhoodRequest) -> NeighbourhoodResponse:
    """
    Runs the Neighbourhood Intelligence Agent.
    Claude autonomously decides which tools to call based on the postcode
    and buyer priorities, then synthesises a structured briefing.
    """
    prompt = neighbourhood_briefing_prompt(req.postcode, req.buyer_priorities)

    raw = await ask_claude_with_tools(
        prompt=prompt,
        tools=NEIGHBOURHOOD_TOOL_DEFINITIONS,
        tool_handlers=NEIGHBOURHOOD_TOOL_HANDLERS,
        system=NEIGHBOURHOOD_AGENT_SYSTEM,
        max_tokens=3000,
        max_iterations=8,
    )

    data = _parse_json(raw, "neighbourhood_agent")
    return NeighbourhoodResponse(**data)
