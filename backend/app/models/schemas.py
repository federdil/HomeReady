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

class CostBreakdownItem(BaseModel):
    label: str
    amount: float
    note: str = ""

class CostCalculatorResponse(BaseModel):
    property_price: float
    total_cost: float
    breakdown: list[CostBreakdownItem]
    stamp_duty: float
    advice: str


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
    viewing_questions: list[str]


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


# ── Journey stage update ──────────────────────────────────────────────────
class StageUpdateRequest(BaseModel):
    stage: JourneyStage
    status: StageStatus
    metadata: Optional[dict] = None


# ── Agent: Neighbourhood Intelligence ─────────────────────────────────────
class NeighbourhoodRequest(BaseModel):
    postcode: str = Field(..., min_length=3, description="UK postcode, e.g. 'E1 6RF'")
    buyer_priorities: Optional[list[str]] = Field(
        default=None,
        description="Optional list of buyer priorities, e.g. ['commute', 'schools']"
    )

class TransportSummary(BaseModel):
    score: int
    summary: str
    nearest_stations: list[str]
    central_london_commute: str

class FloodRiskSummary(BaseModel):
    risk_level: str  # "low" | "medium" | "high" | "very_high"
    summary: str
    action: str

class SchoolsSummary(BaseModel):
    score: int
    summary: str
    notable_schools: list[str]

class AreaCharacter(BaseModel):
    vibe: str
    amenities: list[str]
    safety_note: str

class BuyerFit(BaseModel):
    good_for: list[str]
    less_good_for: list[str]

class NeighbourhoodResponse(BaseModel):
    postcode: str
    area_name: str
    overall_score: int
    headline: str
    transport: TransportSummary
    flood_risk: FloodRiskSummary
    schools: SchoolsSummary
    area_character: AreaCharacter
    buyer_fit: BuyerFit
    key_risks: list[str]
    data_sources: list[str]


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
