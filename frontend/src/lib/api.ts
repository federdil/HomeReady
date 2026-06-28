import axios from 'axios'
import type {
  CostCalculatorResult,
  ListingDecoderResult,
  DocumentExplainerResult,
  SurveyInterpreterResult,
  OfferStrategyResult,
  FetchedListing,
  SavedProperty,
  JourneyStage,
  ChecklistItem,
} from '@/types'
import { supabase } from './supabase'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
})

// Attach Supabase JWT to every request when signed in
api.interceptors.request.use(async config => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

// Extract user-friendly error message from API responses
api.interceptors.response.use(
  r => r,
  err => {
    const detail = err?.response?.data?.detail
    if (detail && typeof detail === 'string') {
      err.userMessage = detail
    }
    return Promise.reject(err)
  }
)

// ── Journey ────────────────────────────────────────────────────────────────
export const getJourneyStages = (): Promise<{ stages: JourneyStage[] }> =>
  api.get('/api/v1/journey/stages').then(r => r.data)

export const markStageProgress = (stage: string, status: 'in_progress' | 'complete') =>
  api.patch('/api/v1/journey/stage', { stage, status }).then(r => r.data)

// ── Stage 1: Cost Calculator ───────────────────────────────────────────────
export interface CostCalcInput {
  property_price: number
  postcode: string
  is_first_time_buyer: boolean
  deposit_amount: number
}
export const calculateCosts = (data: CostCalcInput): Promise<CostCalculatorResult> =>
  api.post('/api/v1/readiness/costs', data).then(r => r.data)

// ── Stage 2: Listing Decoder ───────────────────────────────────────────────
export interface ListingInput {
  listing_text: string
  property_type?: string
}
export const decodeListing = (data: ListingInput): Promise<ListingDecoderResult> =>
  api.post('/api/v1/evaluate/listing', data).then(r => r.data)

// ── Rightmove URL fetch ────────────────────────────────────────────────────
export const fetchRightmoveListing = (url: string): Promise<FetchedListing> =>
  api.post('/api/v1/evaluate/fetch-listing', { url }).then(r => r.data)

// ── Saved properties (shortlist) ───────────────────────────────────────────
export const getSavedProperties = (): Promise<SavedProperty[]> =>
  api.get('/api/v1/properties').then(r => r.data)

export const saveProperty = (data: Omit<SavedProperty, 'id' | 'created_at'>): Promise<SavedProperty> =>
  api.post('/api/v1/properties', data).then(r => r.data)

export const updatePropertyNotes = (id: string, notes: string): Promise<SavedProperty> =>
  api.patch(`/api/v1/properties/${id}/notes`, { notes }).then(r => r.data)

export const deleteProperty = (id: string): Promise<void> =>
  api.delete(`/api/v1/properties/${id}`).then(r => r.data)

// ── Stage 3: Offer Strategy ────────────────────────────────────────────────
export interface OfferStrategyInput {
  asking_price: number
  property_type: string
  weeks_on_market?: number
  chain_status: string
  buyer_position: string
  survey_outcome?: string
  estimated_repair_cost?: number
  seller_situation?: string
  comparable_prices?: string
}
export const getOfferStrategy = (data: OfferStrategyInput): Promise<OfferStrategyResult> =>
  api.post('/api/v1/offer/strategy', data).then(r => r.data)

// ── Stage 4: Document Explainer ────────────────────────────────────────────
export interface DocInput {
  document_text: string
  document_type: string
}
export const explainDocument = (data: DocInput): Promise<DocumentExplainerResult> =>
  api.post('/api/v1/legal/document', data).then(r => r.data)

export const uploadDocument = (file: File, documentType: string): Promise<DocumentExplainerResult> => {
  const form = new FormData()
  form.append('file', file)
  form.append('document_type', documentType)
  return api.post('/api/v1/legal/document/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

// ── Stage 4: Survey Interpreter ────────────────────────────────────────────
export const uploadSurvey = (file: File, surveyLevel: string): Promise<SurveyInterpreterResult> => {
  const form = new FormData()
  form.append('file', file)
  form.append('survey_level', surveyLevel)
  return api.post('/api/v1/legal/survey/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export default api

// ── Stage 2: Neighbourhood Agent ───────────────────────────────────────────
import type { NeighbourhoodResult } from '@/types'

export interface NeighbourhoodInput {
  postcode: string
  buyer_priorities?: string[]
}

export const getNeighbourhoodBriefing = (
  data: NeighbourhoodInput
): Promise<NeighbourhoodResult> =>
  api.post('/api/v1/evaluate/neighbourhood', data).then(r => r.data)

// ── Checklist ───────────────────────────────────────────────────────────────
export interface ChecklistResponse {
  items: ChecklistItem[]
  total: number
  complete: number
}

export const getChecklist = (): Promise<ChecklistResponse> =>
  api.get('/api/v1/checklist').then(r => r.data)

export const toggleChecklistItem = (id: string, is_complete: boolean): Promise<ChecklistItem> =>
  api.patch(`/api/v1/checklist/${id}`, { is_complete }).then(r => r.data)
