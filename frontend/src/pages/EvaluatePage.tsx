import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { decodeListing, fetchRightmoveListing, saveProperty } from '@/lib/api'
import { useMarkStage } from '@/lib/useMarkStage'
import type { ListingDecoderResult, FetchedListing } from '@/types'
import { cn } from '@/lib/utils'
import { SolidCard, GlassCard, PageHeader, PrimaryButton, FormField, RiskBadge } from '@/components/ui'
import {
  AlertTriangle, CheckCircle, HelpCircle, Eye, Home, Info,
  Loader2, Link, FileText, Bookmark, BookmarkCheck, MapPin, TrendingDown,
  ArrowRight, ExternalLink,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

// ── Shared helpers ────────────────────────────────────────────────────────

function formatGBP(n: number) {
  return '£' + n.toLocaleString('en-GB')
}

function severityToRiskLevel(s: string): 'low' | 'amber' | 'red' {
  if (s === 'low') return 'low'
  if (s === 'high') return 'red'
  return 'amber'
}

function TrustRing({ score }: { score: number }) {
  const color = score >= 70 ? '#22A05A' : score >= 45 ? '#D97706' : '#DC2626'
  const label = score >= 70 ? 'Reasonably transparent' : score >= 45 ? 'Some concerns' : 'Significant red flags'
  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <svg viewBox="0 0 120 120" className="w-24 h-24">
        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(200,190,220,0.3)" strokeWidth="10" />
        <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${score * 3.14} 314`} strokeLinecap="round"
          transform="rotate(-90 60 60)" />
        <text x="60" y="56" textAnchor="middle" fontSize="24" fontWeight="700" fill="#1E1030">{score}</text>
        <text x="60" y="73" textAnchor="middle" fontSize="11" fill="#6B5A8A">/100</text>
      </svg>
      <p className="text-xs font-medium text-center" style={{ color }}>{label}</p>
    </div>
  )
}

// ── Metadata pill strip ───────────────────────────────────────────────────

function MetaPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-plum-soft bg-white/60 px-2.5 py-1 rounded-full border border-white/60">
      {icon}{label}
    </span>
  )
}

function ListingMetadata({ fetched }: { fetched: FetchedListing }) {
  const pills = []
  if (fetched.price) pills.push({ icon: <span className="font-medium text-plum">£</span>, label: formatGBP(fetched.price) })
  if (fetched.bedrooms) pills.push({ icon: <Home className="w-3 h-3" />, label: `${fetched.bedrooms} bed` })
  if (fetched.days_on_market != null) pills.push({
    icon: <span>📅</span>,
    label: fetched.days_on_market > 0 ? `${fetched.days_on_market} days on market` : 'Just listed',
  })
  if (fetched.reduction_count > 0) pills.push({
    icon: <TrendingDown className="w-3 h-3 text-amber" />,
    label: `${fetched.reduction_count} price reduction${fetched.reduction_count > 1 ? 's' : ''}`,
  })
  if (fetched.tenure_type) pills.push({ icon: <FileText className="w-3 h-3" />, label: fetched.tenure_type })
  if (fetched.lease_years) pills.push({
    icon: <span className={fetched.lease_years < 80 ? '🔴' : '🟢'} />,
    label: `${fetched.lease_years}yr lease`,
  })
  if (fetched.epc_rating) pills.push({ icon: <span>⚡</span>, label: `EPC ${fetched.epc_rating}` })
  if (fetched.photo_count > 0 && fetched.photo_count < 5) pills.push({
    icon: <AlertTriangle className="w-3 h-3 text-amber" />,
    label: `Only ${fetched.photo_count} photos`,
  })
  if (!pills.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {pills.map((p, i) => <MetaPill key={i} icon={p.icon} label={p.label} />)}
    </div>
  )
}

// ── Context CTAs ──────────────────────────────────────────────────────────

function ContextCTAs({ result, fetched }: { result: ListingDecoderResult; fetched: FetchedListing | null }) {
  const navigate = useNavigate()
  const postcode = fetched?.postcode || ''
  const price = fetched?.price
  const propertyType = fetched?.property_type || ''
  const redFlagContext = result.red_flags.slice(0, 2).join('; ')

  return (
    <div className="grid sm:grid-cols-2 gap-3 mt-2">
      <button
        onClick={() => navigate(`/evaluate/neighbourhood${postcode ? `?postcode=${encodeURIComponent(postcode)}` : ''}`)}
        className="flex items-center gap-3 p-4 rounded-xl bg-white/60 border border-white/60 hover:bg-white/80 transition-colors text-left group"
      >
        <div className="w-9 h-9 rounded-xl bg-purple-faint flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-plum">Check the neighbourhood</p>
          <p className="text-xs text-plum-soft mt-0.5 truncate">
            {postcode ? `Auto-filled: ${postcode}` : 'Transport, schools & flood risk'}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-plum-soft/40 group-hover:text-purple transition-colors shrink-0" />
      </button>

      <button
        onClick={() => {
          const params = new URLSearchParams()
          if (price) params.set('price', String(price))
          if (propertyType) params.set('type', propertyType)
          if (redFlagContext) params.set('context', redFlagContext)
          navigate(`/offer?${params.toString()}`)
        }}
        className="flex items-center gap-3 p-4 rounded-xl bg-white/60 border border-white/60 hover:bg-white/80 transition-colors text-left group"
      >
        <div className="w-9 h-9 rounded-xl bg-purple-faint flex items-center justify-center shrink-0">
          <TrendingDown className="w-4 h-4 text-purple" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-plum">Build offer strategy</p>
          <p className="text-xs text-plum-soft mt-0.5 truncate">
            {price ? `Pre-filled: ${formatGBP(price)}` : 'Leverage points & opening script'}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-plum-soft/40 group-hover:text-purple transition-colors shrink-0" />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function EvaluatePage() {
  const [result, setResult]     = useState<ListingDecoderResult | null>(null)
  const [fetched, setFetched]   = useState<FetchedListing | null>(null)
  const [inputMode, setInputMode] = useState<'url' | 'paste'>('url')
  const [url, setUrl]           = useState('')
  const [pasteText, setPasteText] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [saved, setSaved]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const markStage = useMarkStage()
  const qc = useQueryClient()

  // Step 1: fetch listing from Rightmove URL
  const fetchMutation = useMutation({
    mutationFn: fetchRightmoveListing,
    onSuccess: (data) => {
      setFetched(data)
      if (data.property_type) setPropertyType(data.property_type)
      // Auto-decode immediately
      decodeMutation.mutate({ listing_text: data.listing_text, property_type: data.property_type || propertyType })
    },
  })

  // Step 2: decode the listing text
  const decodeMutation = useMutation({
    mutationFn: decodeListing,
    onSuccess: (data) => {
      setResult(data)
      setSaved(false)
      setSaveError(null)
      markStage('evaluation', 'in_progress')
    },
  })

  // Save to shortlist
  const saveMutation = useMutation({
    mutationFn: () => saveProperty({
      rightmove_url: fetched?.rightmove_url ?? null,
      address: fetched?.address ?? null,
      postcode: fetched?.postcode ?? null,
      price: fetched?.price ?? null,
      property_type: (fetched?.property_type || propertyType) || null,
      bedrooms: fetched?.bedrooms ?? null,
      days_on_market: fetched?.days_on_market ?? null,
      trust_score: result?.trust_score ?? null,
      red_flag_count: result?.red_flags.length ?? 0,
      green_flag_count: result?.green_flags.length ?? 0,
      decoded_result: result as any,
      notes: null,
    }),
    onSuccess: () => {
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['saved-properties'] })
    },
    onError: (e: any) => setSaveError(e?.userMessage ?? 'Could not save. Please try again.'),
  })

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setResult(null)
    setFetched(null)
    setSaved(false)
    fetchMutation.mutate(url.trim())
  }

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pasteText.trim()) return
    setResult(null)
    setFetched(null)
    setSaved(false)
    decodeMutation.mutate({ listing_text: pasteText, property_type: propertyType })
  }

  const isPending = fetchMutation.isPending || decodeMutation.isPending
  const fetchError = fetchMutation.error as any
  const decodeError = decodeMutation.error as any

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 2 — Property Evaluation"
        title="Listing Decoder"
        description="Paste a Rightmove link — HomeReady fetches the listing, decodes the estate agent language, surfaces hidden risks, and tells you what to ask at the viewing."
      />

      {/* Sub-nav */}
      <div className="flex gap-2 text-xs font-medium">
        <NavLink to="/evaluate" end
          className={({ isActive }) => cn('px-4 py-1.5 rounded-full transition-colors',
            isActive ? 'btn-primary py-1.5 px-4' : 'btn-ghost py-1.5 px-4'
          )}
        >
          Listing Decoder
        </NavLink>
        <NavLink to="/evaluate/neighbourhood"
          className={({ isActive }) => cn('px-4 py-1.5 rounded-full transition-colors',
            isActive ? 'btn-primary py-1.5 px-4' : 'btn-ghost py-1.5 px-4'
          )}
        >
          Neighbourhood Briefing
        </NavLink>
        <NavLink to="/shortlist"
          className={({ isActive }) => cn('px-4 py-1.5 rounded-full transition-colors flex items-center gap-1.5',
            isActive ? 'btn-primary py-1.5 px-4' : 'btn-ghost py-1.5 px-4'
          )}
        >
          <Bookmark className="w-3 h-3" />
          My Shortlist
        </NavLink>
      </div>

      {/* Input card */}
      <SolidCard className="space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-2 text-xs font-medium">
          <button type="button" onClick={() => setInputMode('url')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors',
              inputMode === 'url' ? 'bg-purple text-white' : 'bg-white/50 text-plum-soft hover:text-plum border border-white/60'
            )}
          >
            <Link className="w-3 h-3" /> Rightmove URL
          </button>
          <button type="button" onClick={() => setInputMode('paste')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors',
              inputMode === 'paste' ? 'bg-purple text-white' : 'bg-white/50 text-plum-soft hover:text-plum border border-white/60'
            )}
          >
            <FileText className="w-3 h-3" /> Paste text
          </button>
        </div>

        {inputMode === 'url' ? (
          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <FormField
              label="Rightmove property URL"
              hint="e.g. https://www.rightmove.co.uk/properties/123456789"
            >
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="Paste the Rightmove link here"
                  className="glass-input flex-1"
                  type="url"
                />
                <PrimaryButton type="submit" loading={isPending} disabled={!url.trim()}>
                  {isPending ? (fetchMutation.isPending ? 'Fetching…' : 'Decoding…') : 'Decode'}
                </PrimaryButton>
              </div>
            </FormField>

            {/* Status indicators */}
            {fetchMutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-plum-soft">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple" />
                Fetching listing from Rightmove…
              </div>
            )}
            {decodeMutation.isPending && fetched && (
              <div className="flex items-center gap-2 text-xs text-plum-soft">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple" />
                Decoding with AI — reading between the lines…
              </div>
            )}

            {fetchError && (
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {fetchError?.userMessage ?? fetchError?.message ?? 'Could not fetch listing.'}
                {' '}
                <button type="button" onClick={() => setInputMode('paste')}
                  className="underline hover:no-underline">Paste text instead</button>
              </p>
            )}
            {decodeError && (
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {decodeError?.userMessage ?? 'Decode failed. Please try again.'}
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={handlePasteSubmit} className="space-y-4">
            <FormField label="Paste the listing text">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={8}
                placeholder="Paste the full listing description here — the longer the better."
                className="glass-input resize-none"
              />
            </FormField>
            <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
              <FormField label="Property type (optional)">
                <select value={propertyType} onChange={e => setPropertyType(e.target.value)} className="glass-input">
                  <option value="">Select…</option>
                  <option value="flat">Flat / Apartment</option>
                  <option value="house">House</option>
                  <option value="maisonette">Maisonette</option>
                  <option value="studio">Studio</option>
                </select>
              </FormField>
              <PrimaryButton type="submit" loading={decodeMutation.isPending} className="w-full sm:w-auto sm:self-end">
                {decodeMutation.isPending ? 'Decoding…' : 'Decode listing'}
              </PrimaryButton>
            </div>
            {decodeError && (
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {decodeError?.userMessage ?? 'Something went wrong. Please try again.'}
              </p>
            )}
          </form>
        )}
      </SolidCard>

      {/* Results */}
      {result && (
        <div className="space-y-4 animate-results">

          {/* Hero: trust score + summary + metadata */}
          <SolidCard>
            <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              <TrustRing score={result.trust_score} />
              <div className="flex-1 min-w-0">
                {fetched?.address && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <MapPin className="w-3.5 h-3.5 text-plum-soft shrink-0" />
                    <p className="text-xs text-plum-soft truncate">{fetched.address}</p>
                    {fetched.rightmove_url && (
                      <a href={fetched.rightmove_url} target="_blank" rel="noopener noreferrer"
                        className="text-purple hover:underline ml-auto shrink-0">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
                <h2 className="font-display text-lg md:text-xl text-plum mb-1">The honest picture</h2>
                <p className="text-sm text-plum-soft leading-relaxed">{result.summary}</p>
                {fetched && <ListingMetadata fetched={fetched} />}
              </div>
            </div>

            {/* Save to shortlist */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/40">
              <span className="text-xs text-plum-soft">Want to come back to this property?</span>
              {saved ? (
                <span className="flex items-center gap-1.5 text-xs text-sage font-medium">
                  <BookmarkCheck className="w-4 h-4" /> Saved to shortlist
                </span>
              ) : (
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-1.5 text-xs text-purple hover:text-purple/80 font-medium transition-colors disabled:opacity-50"
                >
                  {saveMutation.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                    : <><Bookmark className="w-3.5 h-3.5" /> Save to shortlist</>
                  }
                </button>
              )}
            </div>
            {saveError && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
          </SolidCard>

          {/* Red + green flags */}
          <div className="grid md:grid-cols-2 gap-4">
            {result.red_flags.length > 0 && (
              <SolidCard>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h3 className="font-display text-base text-plum">Red flags</h3>
                </div>
                <ul className="space-y-2">
                  {result.red_flags.map((f, i) => (
                    <li key={i} className="flex gap-2 text-sm text-plum-soft">
                      <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </SolidCard>
            )}
            {result.green_flags.length > 0 && (
              <SolidCard>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-sage" />
                  <h3 className="font-display text-base text-plum">Green flags</h3>
                </div>
                <ul className="space-y-2">
                  {result.green_flags.map((f, i) => (
                    <li key={i} className="flex gap-2 text-sm text-plum-soft">
                      <CheckCircle className="w-4 h-4 text-sage mt-0.5 shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </SolidCard>
            )}
          </div>

          {/* Euphemisms */}
          {result.euphemisms.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-purple" />
                <h3 className="font-display text-base text-plum">Decoded language</h3>
              </div>
              <div className="space-y-3">
                {result.euphemisms.map((e, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <RiskBadge level={severityToRiskLevel(e.severity)} label={e.phrase} />
                    <p className="text-sm text-plum-soft mt-0.5">→ {e.likely_meaning}</p>
                  </div>
                ))}
              </div>
            </SolidCard>
          )}

          {/* Leasehold */}
          {result.leasehold.detected && (
            <SolidCard className={result.leasehold.risk_level === 'critical' ? 'border-red-200' : ''}>
              <div className="flex items-center gap-2 mb-3">
                <Home className="w-4 h-4 text-purple" />
                <h3 className="font-display text-base text-plum">Leasehold risk</h3>
                {result.leasehold.risk_level && (
                  <RiskBadge
                    level={result.leasehold.risk_level === 'critical' ? 'critical' : result.leasehold.risk_level === 'high' ? 'red' : result.leasehold.risk_level === 'medium' ? 'amber' : 'low'}
                    label={result.leasehold.risk_level}
                  />
                )}
              </div>
              <p className="text-sm text-plum-soft leading-relaxed">{result.leasehold.explanation}</p>
              {result.leasehold.lease_years && (
                <p className="mt-2 text-xs font-medium">
                  Lease length detected:{' '}
                  <span className={cn('font-bold', (result.leasehold.lease_years ?? 999) < 80 ? 'text-red-600' : 'text-sage')}>
                    {result.leasehold.lease_years} years
                  </span>
                </p>
              )}
            </SolidCard>
          )}

          {/* Missing info */}
          {result.missing_info.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-purple" />
                <h3 className="font-display text-base text-plum">Missing information</h3>
              </div>
              <ul className="space-y-1.5">
                {result.missing_info.map((m, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum-soft">
                    <HelpCircle className="w-4 h-4 text-amber shrink-0 mt-0.5" />{m}
                  </li>
                ))}
              </ul>
            </SolidCard>
          )}

          {/* Viewing questions */}
          {result.viewing_questions.length > 0 && (
            <GlassCard>
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="w-4 h-4 text-purple" />
                <h3 className="font-display text-base text-plum">Questions to ask at the viewing</h3>
              </div>
              <ol className="space-y-2">
                {result.viewing_questions.map((q, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum">
                    <span className="font-medium text-purple shrink-0">{i + 1}.</span>{q}
                  </li>
                ))}
              </ol>
            </GlassCard>
          )}

          {/* Context CTAs */}
          <div>
            <p className="text-xs text-plum-soft font-medium uppercase tracking-wide mb-3">Continue your research</p>
            <ContextCTAs result={result} fetched={fetched} />
          </div>

        </div>
      )}
    </div>
  )
}
