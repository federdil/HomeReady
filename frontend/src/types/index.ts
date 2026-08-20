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

// ── Rightmove fetch ───────────────────────────────────────────────────────
export interface FetchedListing {
  listing_text: string
  address: string | null
  postcode: string | null
  price: number | null
  property_type: string | null
  bedrooms: number | null
  days_on_market: number | null
  reduction_count: number
  photo_count: number
  tenure_type: string | null
  lease_years: number | null
  epc_rating: string | null
  rightmove_url: string
}

// ── Saved property ────────────────────────────────────────────────────────
export interface SavedProperty {
  id: string
  rightmove_url: string | null
  address: string | null
  postcode: string | null
  price: number | null
  property_type: string | null
  bedrooms: number | null
  days_on_market: number | null
  trust_score: number | null
  red_flag_count: number
  green_flag_count: number
  decoded_result: ListingDecoderResult | null
  notes: string | null
  created_at: string
}

// ── Offer Strategy ────────────────────────────────────────────────────────
export interface OfferRange {
  low: number
  high: number
}

export interface OfferStrategyResult {
  recommended_offer: number
  offer_range: OfferRange
  offer_rationale: string
  leverage_points: string[]
  conditions_to_include: string[]
  opening_script: string
  likely_counter: string
  walkaway_price: number
  negotiation_tips: string[]
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

// ── Persona ────────────────────────────────────────────────────────────────
export type DimensionKey =
  | 'commute'
  | 'area'
  | 'safety'
  | 'schools'
  | 'value'
  | 'space'

export interface Workplace {
  label: string
  postcode?: string | null
  latitude: number
  longitude: number
  max_minutes: number
  modes?: string | null
}

/**
 * Somewhere the buyer already wants to live, as opposed to somewhere they have
 * to get to. No journey-time target: the question is proximity, not travel.
 */
export interface PreferredArea {
  label: string
  postcode?: string | null
  latitude: number
  longitude: number
  district?: string | null
}

export interface Persona {
  id?: string
  label: string
  preset_key?: string | null
  price_min?: number | null
  price_max?: number | null
  deposit?: number | null
  min_bedrooms: number
  needs_outdoor_space: boolean
  needs_parking: boolean
  /** Built-form keys from the server's vocabulary: 'flat', 'terraced', … */
  property_types: string[]
  /** Period keys from the server's vocabulary: 'victorian', 'new_build', … */
  preferred_periods: string[]
  min_lease_years?: number | null
  weights: Record<DimensionKey, number>
  workplaces: Workplace[]
  preferred_areas: PreferredArea[]
}

export interface PersonaPreset {
  key: string
  label: string
  description: string
  weights: Record<DimensionKey, number>
  min_bedrooms: number
  needs_outdoor_space: boolean
  needs_parking: boolean
  property_types: string[]
  preferred_periods: string[]
}

export interface DimensionMeta {
  key: DimensionKey
  label: string
  blurb: string
  /** The rule behind the number, in plain English. Paragraphs split on \n\n. */
  method: string
  source: string
}

/**
 * A choice offered in the profile form. Served by the API rather than held
 * here, so a label can never drift away from the key that drives scoring.
 */
export interface OptionMeta {
  key: string
  label: string
  /** What living in one is actually like. Empty for self-explanatory options. */
  blurb: string
}

export interface PlaceSuggestion {
  label: string
  description: string
  postcode: string
  district: string
  latitude: number
  longitude: number
}

// ── Signals & assessment ───────────────────────────────────────────────────
export interface SignalEnvelope<T = unknown> {
  status: 'ok' | 'unavailable'
  value: T | null
  source: string
  source_url?: string | null
  fetched_at?: string | null
  reason?: string | null
}

export interface DimensionScore {
  key: DimensionKey
  label: string
  score: number | null
  weight: number
  detail: string
  unavailable_reason?: string | null
}

export interface CommuteResult extends SignalEnvelope<{
  minutes: number
  summary: string
  changes: number
  modes: string[]
}> {
  label: string
}

export interface RunningCostLine {
  label: string
  annual: number
  is_estimate: boolean
  basis: string
}

export interface RunningCostsValue {
  lines: RunningCostLine[]
  council_tax_band: string | null
  floor_area_sqft: number | null
  total_annual: number
  monthly: number
  price_per_sqft: number | null
}

export interface Enrichment {
  location?: SignalEnvelope<{ postcode: string; latitude: number; longitude: number; district: string }>
  crime?: SignalEnvelope<{ month: string; total: number; personal_safety_count: number; radius_m: number; top_categories: [string, number][] }>
  schools?: SignalEnvelope<{ radius_m: number; primary_count: number; secondary_count: number; ratings_available: boolean; nearest: { name: string; distance_m: number; phase: string | null }[] }>
  comparables?: SignalEnvelope<{ postcode: string; median_price: number; sales: { price: number; date: string; address: string }[] }>
  stations?: SignalEnvelope<{ name: string; distance_m: number }[]>
  running_costs?: SignalEnvelope<RunningCostsValue>
  commutes?: CommuteResult[]
  fit?: { score: number | null; coverage: number; dimensions: DimensionScore[] }
  value_summary?: string
}

export interface AssessedProperty {
  id?: string | null
  rightmove_url?: string | null
  address?: string | null
  postcode?: string | null
  price?: number | null
  property_type?: string | null
  bedrooms?: number | null
  latitude?: number | null
  longitude?: number | null
  fit_score?: number | null
  fit_coverage?: number | null
  enrichment: Enrichment
  decoded_result?: Record<string, unknown> | null
  notes?: string | null
  /** False when Rightmove reports the listing gone — sold, let, or withdrawn. */
  is_active: boolean
}

export interface GeocodeResult {
  found: boolean
  label: string
  postcode: string
  district: string
  latitude: number | null
  longitude: number | null
  reason?: string | null
}
