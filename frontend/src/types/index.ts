// ── Journey ────────────────────────────────────────────────────────────────
export type StageStatus = 'not_started' | 'in_progress' | 'complete'

export type StageKey =
  | 'readiness'
  | 'evaluation'
  | 'offer'
  | 'legal'
  | 'exchange'
  | 'homeowner'

export interface JourneyStage {
  stage: StageKey
  status: StageStatus
  label: string
  description: string
}

// ── Cost Calculator ────────────────────────────────────────────────────────
export interface CostBreakdownItem {
  label: string
  amount: number
  note: string
}

export interface CostCalculatorResult {
  property_price: number
  total_cost: number
  stamp_duty: number
  breakdown: CostBreakdownItem[]
  advice: string
}

// ── Listing Decoder ────────────────────────────────────────────────────────
export interface EuphemismFlag {
  phrase: string
  likely_meaning: string
  severity: 'low' | 'medium' | 'high'
}

export interface LeaseholdFlag {
  detected: boolean
  lease_years: number | null
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null
  explanation: string
}

export interface ListingDecoderResult {
  trust_score: number
  summary: string
  euphemisms: EuphemismFlag[]
  missing_info: string[]
  leasehold: LeaseholdFlag
  red_flags: string[]
  green_flags: string[]
  viewing_questions: string[]
}

// ── Document Explainer ─────────────────────────────────────────────────────
export interface DocumentClause {
  clause: string
  plain_english: string
  importance: 'routine' | 'notable' | 'critical'
  action_required: string | null
}

export interface DocumentExplainerResult {
  document_type: string
  summary: string
  clauses: DocumentClause[]
  action_items: string[]
  questions_for_solicitor: string[]
}

// ── Survey Interpreter ─────────────────────────────────────────────────────
export interface SurveyFinding {
  title: string
  category: 'critical' | 'significant' | 'advisory'
  description: string
  typical_cost_range: string | null
  renegotiation_worthy: boolean
  action: string
}

export interface SurveyInterpreterResult {
  overall_assessment: 'proceed' | 'renegotiate' | 'withdraw' | 'investigate'
  summary: string
  critical_count: number
  significant_count: number
  advisory_count: number
  findings: SurveyFinding[]
  renegotiation_points: string[]
  estimated_remediation_cost: string | null
}

// ── Agent: Neighbourhood Intelligence ─────────────────────────────────────
export interface TransportSummary {
  score: number
  summary: string
  nearest_stations: string[]
  central_london_commute: string
}

export interface FloodRiskSummary {
  risk_level: 'low' | 'medium' | 'high' | 'very_high'
  summary: string
  action: string
}

export interface SchoolsSummary {
  score: number
  summary: string
  notable_schools: string[]
}

export interface AreaCharacter {
  vibe: string
  amenities: string[]
  safety_note: string
}

export interface BuyerFit {
  good_for: string[]
  less_good_for: string[]
}

export interface NeighbourhoodResult {
  postcode: string
  area_name: string
  overall_score: number
  headline: string
  transport: TransportSummary
  flood_risk: FloodRiskSummary
  schools: SchoolsSummary
  area_character: AreaCharacter
  buyer_fit: BuyerFit
  key_risks: string[]
  data_sources: string[]
}

// ── Checklist ────────────────────────────────────────────────────────────────
export interface ChecklistItem {
  id: string
  title: string
  description: string
  deadline_days: number | null
  is_complete: boolean
  stage: string
  sort_order: number
  category: 'urgent' | 'important' | 'admin'
}
