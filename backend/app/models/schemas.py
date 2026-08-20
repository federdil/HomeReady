"""
Pydantic schemas — what goes in and out of the API.
Separated from SQLAlchemy models deliberately.
"""
from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.models.models import JourneyStage, StageStatus


# ── Journey ───────────────────────────────────────────────────────────────
class JourneyStageDetail(BaseModel):
    stage: JourneyStage
    status: StageStatus
    label: str
    description: str


class JourneyResponse(BaseModel):
    id: UUID
    current_stage: JourneyStage
    stages: list[JourneyStageDetail]
    metadata: dict


# ── Feature: Cost Calculator ──────────────────────────────────────────────
class CostCalculatorRequest(BaseModel):
    property_price: float = Field(..., gt=0, description="Property price in GBP")
    postcode: str = Field(..., min_length=3, description="UK postcode")
    is_first_time_buyer: bool = True
    deposit_amount: float = Field(..., gt=0)
    survey_level: str = "level_2"
    bedrooms: Optional[int] = None

class CostBreakdownItem(BaseModel):
    label: str
    amount: float
    note: str = ""
    # Statutory costs are computed from published rate scales and are exact.
    # Everything else is a labelled estimate.
    statutory: bool = False

class CostCalculatorResponse(BaseModel):
    property_price: float
    deposit: float
    loan_amount: float
    ltv: float
    stamp_duty: float
    fees_total: float
    total_cost: float
    cash_needed: float
    breakdown: list[CostBreakdownItem]
    advice: str
    rates_effective_from: str


# ── Feature: Listing Decoder ──────────────────────────────────────────────
class ListingDecoderRequest(BaseModel):
    listing_text: str = Field(..., min_length=50, description="Raw listing text or URL content")
    property_type: Optional[str] = None  # "flat", "house", "maisonette"

class EuphemismFlag(BaseModel):
    phrase: str
    likely_meaning: str
    severity: str  # "low" | "medium" | "high"

class LeaseholdFlag(BaseModel):
    detected: bool
    lease_years: Optional[int] = None
    risk_level: Optional[str] = None  # "low" | "medium" | "high" | "critical"
    explanation: str = ""

class ListingDecoderResponse(BaseModel):
    trust_score: int = Field(..., ge=0, le=100)
    summary: str
    euphemisms: list[EuphemismFlag]
    missing_info: list[str]
    leasehold: LeaseholdFlag
    red_flags: list[str]
    green_flags: list[str]


# ── Feature: Document Explainer ───────────────────────────────────────────
class DocumentExplainerRequest(BaseModel):
    document_text: str = Field(..., min_length=100)
    document_type: str  # "draft_contract" | "title_register" | "search_results" | "other"

class DocumentClause(BaseModel):
    clause: str
    plain_english: str
    importance: str  # "routine" | "notable" | "critical"
    action_required: Optional[str] = None

class DocumentExplainerResponse(BaseModel):
    document_type: str
    summary: str
    clauses: list[DocumentClause]
    action_items: list[str]
    questions_for_solicitor: list[str]


# ── Feature: Survey Interpreter ───────────────────────────────────────────
class SurveyInterpreterRequest(BaseModel):
    survey_text: str = Field(..., min_length=100)
    survey_level: str = Field(..., pattern="^(level_2|level_3)$")

class SurveyFinding(BaseModel):
    title: str
    category: str  # "critical" | "significant" | "advisory"
    description: str
    typical_cost_range: Optional[str] = None
    renegotiation_worthy: bool
    action: str

class SurveyInterpreterResponse(BaseModel):
    overall_assessment: str  # "proceed" | "renegotiate" | "withdraw" | "investigate"
    summary: str
    critical_count: int
    significant_count: int
    advisory_count: int
    findings: list[SurveyFinding]
    renegotiation_points: list[str]
    estimated_remediation_cost: Optional[str] = None


# ── Feature: Offer Strategy ───────────────────────────────────────────────
class OfferStrategyRequest(BaseModel):
    asking_price: float = Field(..., gt=0)
    property_type: str = "house"
    weeks_on_market: Optional[int] = None
    chain_status: str = "unknown"
    buyer_position: str = "mortgage_agreed"
    survey_outcome: Optional[str] = None
    estimated_repair_cost: Optional[float] = None
    seller_situation: Optional[str] = None
    comparable_prices: Optional[str] = None

class OfferRange(BaseModel):
    low: int
    high: int

class OfferStrategyResponse(BaseModel):
    recommended_offer: int
    offer_range: OfferRange
    offer_rationale: str
    leverage_points: list[str]
    conditions_to_include: list[str]
    opening_script: str
    likely_counter: str
    walkaway_price: int
    negotiation_tips: list[str]


# ── Journey stage update ──────────────────────────────────────────────────
class StageUpdateRequest(BaseModel):
    stage: JourneyStage
    status: StageStatus
    metadata: Optional[dict] = None


# ── Rightmove URL fetch ───────────────────────────────────────────────────
class FetchListingRequest(BaseModel):
    url: str

class FetchListingResponse(BaseModel):
    listing_text: str
    address: Optional[str] = None
    postcode: Optional[str] = None
    price: Optional[int] = None
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    days_on_market: Optional[int] = None
    reduction_count: int = 0
    photo_count: int = 0
    tenure_type: Optional[str] = None
    lease_years: Optional[int] = None
    epc_rating: Optional[str] = None
    rightmove_url: str
    # False when Rightmove returns 410 — the listing has been sold, let, or
    # withdrawn. The data is still complete; only its availability changed.
    is_active: bool = True


# ── Saved properties (shortlist) ──────────────────────────────────────────
class SavePropertyRequest(BaseModel):
    rightmove_url: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    price: Optional[int] = None
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    days_on_market: Optional[int] = None
    trust_score: Optional[int] = None
    red_flag_count: int = 0
    green_flag_count: int = 0
    decoded_result: Optional[dict] = None
    notes: Optional[str] = None

class SavedPropertyResponse(BaseModel):
    id: UUID
    rightmove_url: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    price: Optional[int] = None
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    days_on_market: Optional[int] = None
    trust_score: Optional[int] = None
    red_flag_count: int = 0
    green_flag_count: int = 0
    decoded_result: Optional[dict] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class UpdatePropertyNotesRequest(BaseModel):
    notes: str


# ── Viewing Question Generator ────────────────────────────────────────────
class ViewingQuestionsRequest(BaseModel):
    listing_text: str
    property_type: Optional[str] = None
    red_flags: Optional[list[str]] = None
    leasehold_detected: Optional[bool] = None

class ViewingQuestionCategory(BaseModel):
    name: str
    questions: list[str]

class ViewingQuestionsResponse(BaseModel):
    priority_questions: list[str]
    categories: list[ViewingQuestionCategory]


# ── Checklist ─────────────────────────────────────────────────────────────
class ChecklistItemResponse(BaseModel):
    id: UUID
    title: str
    description: str
    deadline_days: Optional[int]
    is_complete: bool
    stage: str
    sort_order: int
    category: str  # "urgent" | "important" | "admin"

class ChecklistResponse(BaseModel):
    items: list[ChecklistItemResponse]
    total: int
    complete: int

class ChecklistToggleRequest(BaseModel):
    is_complete: bool


# ── Persona ───────────────────────────────────────────────────────────────
class WorkplaceIn(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    postcode: Optional[str] = None
    latitude: float
    longitude: float
    max_minutes: int = Field(45, ge=5, le=180)
    modes: Optional[str] = None


class PreferredAreaIn(BaseModel):
    """Somewhere the buyer already wants to live, as opposed to somewhere they
    have to get to. No journey-time target — the question is proximity, not
    travel."""
    label: str = Field(..., min_length=1, max_length=80)
    postcode: Optional[str] = None
    latitude: float
    longitude: float
    district: Optional[str] = None


class PersonaRequest(BaseModel):
    label: str = "My search"
    preset_key: Optional[str] = None
    price_min: Optional[int] = Field(None, ge=0)
    price_max: Optional[int] = Field(None, ge=0)
    deposit: Optional[int] = Field(None, ge=0)
    min_bedrooms: int = Field(1, ge=0, le=10)
    needs_outdoor_space: bool = False
    needs_parking: bool = False
    property_types: list[str] = []
    preferred_periods: list[str] = []
    min_lease_years: Optional[int] = Field(None, ge=0, le=999)
    weights: dict[str, int] = {}
    workplaces: list[WorkplaceIn] = []
    preferred_areas: list[PreferredAreaIn] = []


class PersonaResponse(PersonaRequest):
    id: str


class PersonaPresetResponse(BaseModel):
    key: str
    label: str
    description: str
    weights: dict[str, int]
    min_bedrooms: int
    needs_outdoor_space: bool
    needs_parking: bool
    property_types: list[str] = []
    preferred_periods: list[str] = []


class DimensionMeta(BaseModel):
    key: str
    label: str
    blurb: str
    # The rule behind the number, in plain English — what the client shows when
    # the buyer asks how a dimension is scored.
    method: str = ""
    source: str = ""


class OptionMeta(BaseModel):
    """A choice offered in the profile form. Held on the server so the labels
    and the keys that drive scoring cannot drift apart."""
    key: str
    label: str
    blurb: str = ""


class GeocodeRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)


class GeocodeResponse(BaseModel):
    found: bool
    label: str = ""
    postcode: str = ""
    district: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    reason: Optional[str] = None


class PlaceSuggestion(BaseModel):
    label: str
    description: str
    postcode: str = ""
    district: str = ""
    latitude: float
    longitude: float


class PlaceSuggestResponse(BaseModel):
    suggestions: list[PlaceSuggestion] = []


# ── Property assessment ───────────────────────────────────────────────────
class AssessPropertyRequest(BaseModel):
    url: Optional[str] = None
    listing_text: Optional[str] = None
    postcode: Optional[str] = None
    price: Optional[float] = None
    save: bool = True


class AssessedPropertyResponse(BaseModel):
    id: Optional[str] = None
    rightmove_url: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    price: Optional[float] = None
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    fit_score: Optional[int] = None
    fit_coverage: Optional[int] = None
    enrichment: dict = {}
    decoded_result: Optional[dict] = None
    notes: Optional[str] = None
    is_active: bool = True
