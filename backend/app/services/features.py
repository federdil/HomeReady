"""
Service layer — orchestrates Claude calls, validation,
and any external API calls. Keeps routes thin.
"""
import json
from app.core.claude import ask_claude, ask_claude_with_document
from app.services.calculators import RATES_EFFECTIVE_FROM, calculate_purchase_costs
from app.prompts.prompts import (
    BASE_SYSTEM,
    LISTING_DECODER_SYSTEM,
    DOCUMENT_SYSTEM,
    SURVEY_SYSTEM,
    NEGOTIATION_SYSTEM,
    VIEWING_QUESTIONS_SYSTEM,
    VALUE_SUMMARY_SYSTEM,
    cost_advice_prompt,
    value_summary_prompt,
    listing_decoder_prompt,
    document_explainer_prompt,
    survey_interpreter_prompt,
    negotiation_coach_prompt,
    viewing_questions_prompt,
)
from app.models.schemas import (
    CostBreakdownItem,
    CostCalculatorRequest, CostCalculatorResponse,
    ListingDecoderRequest, ListingDecoderResponse,
    DocumentExplainerRequest, DocumentExplainerResponse,
    SurveyInterpreterRequest, SurveyInterpreterResponse,
    OfferStrategyRequest, OfferStrategyResponse,
    ViewingQuestionsRequest, ViewingQuestionsResponse,
)
import structlog

log = structlog.get_logger()


def _parse_json(raw: str, label: str) -> dict:
    """Strip markdown fences and prose preamble, then parse JSON."""
    clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        # Claude sometimes adds prose before/after the JSON object — extract it
        start = clean.find('{')
        end = clean.rfind('}')
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(clean[start:end + 1])
            except json.JSONDecodeError:
                pass
        log.error("json_parse_error", label=label, raw=raw[:400])
        raise ValueError(f"AI returned invalid JSON for {label}")


# ── Cost Calculator ────────────────────────────────────────────────────────
async def calculate_costs(req: CostCalculatorRequest) -> CostCalculatorResponse:
    """Every figure is computed from rate tables. Claude sees the finished
    numbers and writes the advice paragraph — it is never asked to derive,
    sum, or recall a rate."""
    result = calculate_purchase_costs(
        property_price=req.property_price,
        postcode=req.postcode,
        is_first_time_buyer=req.is_first_time_buyer,
        deposit_amount=req.deposit_amount,
        survey_level=req.survey_level,
        bedrooms=req.bedrooms,
    )

    advice = await _cost_advice(result, req.is_first_time_buyer, req.postcode)

    return CostCalculatorResponse(
        property_price=result.property_price,
        deposit=result.deposit,
        loan_amount=result.loan_amount,
        ltv=result.ltv,
        stamp_duty=result.stamp_duty,
        fees_total=result.fees_total,
        total_cost=result.total_cost,
        cash_needed=result.cash_needed,
        breakdown=[
            CostBreakdownItem(
                label=line.label,
                amount=line.amount,
                note=line.basis,
                statutory=line.statutory,
            )
            for line in result.lines
        ],
        advice=advice,
        rates_effective_from=RATES_EFFECTIVE_FROM,
    )


async def _cost_advice(result, is_first_time_buyer: bool, postcode: str) -> str:
    """Advice only. A failure here must not cost the user their numbers."""
    try:
        raw = await ask_claude(
            cost_advice_prompt(
                property_price=result.property_price,
                postcode=postcode,
                is_first_time_buyer=is_first_time_buyer,
                deposit=result.deposit,
                ltv=result.ltv,
                stamp_duty=result.stamp_duty,
                fees_total=result.fees_total,
                cash_needed=result.cash_needed,
                lines=[(l.label, l.amount) for l in result.lines],
            ),
            system=BASE_SYSTEM,
            max_tokens=400,
        )
        return raw.strip()
    except Exception as e:
        log.warning("cost_advice_unavailable", error=str(e))
        return ""


# ── Listing Decoder ────────────────────────────────────────────────────────
async def decode_listing(req: ListingDecoderRequest) -> ListingDecoderResponse:
    prompt = listing_decoder_prompt(req.listing_text, req.property_type or "unknown")
    raw = await ask_claude(prompt, system=LISTING_DECODER_SYSTEM, max_tokens=4096)
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


# ── Offer Strategy ────────────────────────────────────────────────────────
async def get_offer_strategy(req: OfferStrategyRequest) -> OfferStrategyResponse:
    prompt = negotiation_coach_prompt(
        asking_price=req.asking_price,
        property_type=req.property_type,
        weeks_on_market=req.weeks_on_market,
        chain_status=req.chain_status,
        buyer_position=req.buyer_position,
        survey_outcome=req.survey_outcome,
        estimated_repair_cost=req.estimated_repair_cost,
        seller_situation=req.seller_situation,
        comparable_prices=req.comparable_prices,
    )
    raw = await ask_claude(prompt, system=NEGOTIATION_SYSTEM, max_tokens=2048)
    data = _parse_json(raw, "offer_strategy")
    return OfferStrategyResponse(**data)


# ── Viewing Question Generator ────────────────────────────────────────────
async def generate_viewing_questions(req: ViewingQuestionsRequest) -> ViewingQuestionsResponse:
    prompt = viewing_questions_prompt(
        listing_text=req.listing_text,
        property_type=req.property_type or "unknown",
        red_flags=req.red_flags,
        leasehold_detected=req.leasehold_detected or False,
    )
    raw = await ask_claude(prompt, system=VIEWING_QUESTIONS_SYSTEM, max_tokens=2048)
    data = _parse_json(raw, "viewing_questions")
    return ViewingQuestionsResponse(**data)


# ── Journey stage defaults ─────────────────────────────────────────────────
STAGE_DEFAULTS = [
    {"stage": "readiness",  "status": "not_started", "label": "Financial Readiness",   "description": "Understand your budget and true buying costs"},
    {"stage": "evaluation", "status": "not_started", "label": "Property Evaluation",   "description": "Decode listings and assess properties"},
    {"stage": "offer",      "status": "not_started", "label": "Offer & Negotiation",   "description": "Price analysis and negotiation strategy"},
    {"stage": "legal",      "status": "not_started", "label": "Legal & Survey",        "description": "Understand your documents and survey"},
    {"stage": "exchange",   "status": "not_started", "label": "Exchange & Completion", "description": "Checklist and chain visibility"},
    {"stage": "homeowner",  "status": "not_started", "label": "Homeowner Mode",        "description": "Post-completion admin and long-term planning"},
]


# ── Property value summary + feature extraction ───────────────────────────
async def summarise_value(
    listing: dict, enrichment: dict, persona_label: str, persona=None,
) -> tuple[str, dict]:
    """Returns (verdict, extracted_features).

    One call does both jobs: the model reads the description for the feature
    facts the structured flags cannot express (private vs communal, negation),
    and writes the verdict. Scoring stays in Python — the model supplies facts,
    never numbers.

    Optional by design: if it fails the property keeps all of its data and
    scores, and the feature checks simply stay at whatever the structured
    flags said.
    """
    costs_blob = enrichment.get("running_costs") or {}
    costs = costs_blob.get("value") if costs_blob.get("status") == "ok" else None
    fit = enrichment.get("fit") or {}

    wants_outdoor = bool(getattr(persona, "needs_outdoor_space", False))
    wants_parking = bool(getattr(persona, "needs_parking", False))
    # Only asked for when the buyer has stated a preference. Extracting a
    # period nobody cares about spends tokens and invites the model to assert
    # one where the listing is silent.
    wants_period = bool(getattr(persona, "preferred_periods", None))

    try:
        raw = await ask_claude(
            value_summary_prompt(
                address=listing.get("address") or "",
                price=listing.get("price"),
                bedrooms=listing.get("bedrooms"),
                property_type=listing.get("property_type") or "",
                tenure=listing.get("tenure_type") or "",
                lease_years=listing.get("lease_years"),
                price_per_sqft=(costs or {}).get("price_per_sqft"),
                floor_area_sqft=(costs or {}).get("floor_area_sqft"),
                running_costs_total=(costs or {}).get("total_annual"),
                running_cost_lines=[
                    (l["label"], l["annual"]) for l in (costs or {}).get("lines", [])
                ],
                dimensions=[
                    (d["label"], d["score"], d["weight"], d["detail"])
                    for d in fit.get("dimensions", [])
                ],
                fit_score=fit.get("score"),
                coverage=fit.get("coverage", 0),
                persona_label=persona_label,
                listing_text=listing.get("listing_text") or "",
                key_features=listing.get("key_features") or [],
                wants_outdoor_space=wants_outdoor,
                wants_parking=wants_parking,
                wants_period=wants_period,
            ),
            system=VALUE_SUMMARY_SYSTEM,
            max_tokens=700,
        )
    except Exception as e:
        log.warning("value_summary_unavailable", error=str(e))
        return "", {}

    try:
        data = _parse_json(raw, "value_summary")
    except ValueError:
        # A verdict without valid JSON is still worth showing.
        return raw.strip(), {}

    features = data.get("features")
    return str(data.get("summary") or "").strip(), (features if isinstance(features, dict) else {})
