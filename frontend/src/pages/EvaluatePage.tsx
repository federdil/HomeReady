import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { decodeListing, fetchRightmoveListing, saveProperty, generateViewingQuestions } from '@/lib/api'
import type { ViewingQuestionsResult } from '@/lib/api'
import { useMarkStage } from '@/lib/useMarkStage'
import type { ListingDecoderResult, FetchedListing } from '@/types'
import { cn } from '@/lib/utils'
import { SolidCard, PageHeader, PrimaryButton, FormField, RiskBadge, Callout } from '@/components/ui'
import {
  AlertTriangle, CheckCircle, HelpCircle, Eye, Home, Info,
  Loader2, Link, FileText, Bookmark, BookmarkCheck, MapPin, TrendingDown,
  ArrowRight, ExternalLink, ShieldAlert, ClipboardCopy,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGBP(n: number) {
  return '£' + n.toLocaleString('en-GB')
}

function severityToRiskLevel(s: string): 'low' | 'amber' | 'red' {
  if (s === 'low') return 'low'
  if (s === 'high') return 'red'
  return 'amber'
}

// ── Trust Ring — hero variant ─────────────────────────────────────────────────

function TrustRing({ score }: { score: number }) {
  const isGood   = score >= 70
  const isMedium = score >= 45 && score < 70
  const color  = isGood ? '#16A34A' : isMedium ? '#D97706' : '#DC2626'
  const bgColor = isGood ? '#F0FDF4' : isMedium ? '#FFFBEB' : '#FEF2F2'
  const label  = isGood ? 'Reasonably transparent' : isMedium ? 'Some concerns' : 'Significant red flags'
  const badgeClass = isGood ? 'badge-success' : isMedium ? 'badge-warning' : 'badge-danger'

  const r = 52
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ

  return (
    <div className="flex flex-col items-center gap-3 shrink-0">
      <div className="relative" style={{ width: 128, height: 128 }}>
        {/* Background circle */}
        <div className="absolute inset-0 rounded-full" style={{ background: bgColor }} />
        <svg viewBox="0 0 128 128" className="absolute inset-0 w-full h-full">
          <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="10" />
          <circle
            cx="64" cy="64" r={r}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform="rotate(-90 64 64)"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
          />
          <text x="64" y="60" textAnchor="middle" fontSize="28" fontWeight="700" fill="#111827" fontFamily="'DM Serif Display', serif">{score}</text>
          <text x="64" y="77" textAnchor="middle" fontSize="12" fill="#6B7280" fontFamily="Inter, sans-serif">/100</text>
        </svg>
      </div>
      <span className={cn('badge', badgeClass)}>{label}</span>
    </div>
  )
}

// ── Metadata pills ────────────────────────────────────────────────────────────

function MetaPill({ icon, label, variant }: { icon: React.ReactNode; label: string; variant?: 'warning' | 'danger' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium',
      variant === 'danger'  ? 'bg-danger-bg border-danger/20 text-danger' :
      variant === 'warning' ? 'bg-warning-bg border-warning/20 text-warning' :
      'bg-surface-2 border-border text-ink-muted'
    )}>
      {icon}{label}
    </span>
  )
}

function ListingMetadata({ fetched }: { fetched: FetchedListing }) {
  const pills: { icon: React.ReactNode; label: string; variant?: 'warning' | 'danger' }[] = []
  if (fetched.price)           pills.push({ icon: <span className="font-bold text-ink">£</span>, label: formatGBP(fetched.price) })
  if (fetched.bedrooms)        pills.push({ icon: <Home className="w-3 h-3" />, label: `${fetched.bedrooms} bed` })
  if (fetched.days_on_market != null) pills.push({
    icon: <span className="text-[10px]">📅</span>,
    label: fetched.days_on_market > 0 ? `${fetched.days_on_market} days on market` : 'Just listed',
  })
  if (fetched.reduction_count > 0) pills.push({
    icon: <TrendingDown className="w-3 h-3" />,
    label: `${fetched.reduction_count} price reduction${fetched.reduction_count > 1 ? 's' : ''}`,
    variant: 'warning',
  })
  if (fetched.tenure_type)     pills.push({ icon: <FileText className="w-3 h-3" />, label: fetched.tenure_type })
  if (fetched.lease_years)     pills.push({
    icon: <span className="text-[10px]">{(fetched.lease_years ?? 999) < 80 ? '🔴' : '🟢'}</span>,
    label: `${fetched.lease_years}yr lease`,
    variant: (fetched.lease_years ?? 999) < 80 ? 'danger' : undefined,
  })
  if (fetched.epc_rating)      pills.push({ icon: <span className="text-[10px]">⚡</span>, label: `EPC ${fetched.epc_rating}` })
  if (fetched.photo_count > 0 && fetched.photo_count < 5) pills.push({
    icon: <AlertTriangle className="w-3 h-3" />,
    label: `Only ${fetched.photo_count} photos`,
    variant: 'warning',
  })
  if (!pills.length) return null
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {pills.map((p, i) => <MetaPill key={i} icon={p.icon} label={p.label} variant={p.variant} />)}
    </div>
  )
}

// ── Context CTAs ──────────────────────────────────────────────────────────────

function ContextCTAs({ result, fetched }: { result: ListingDecoderResult; fetched: FetchedListing | null }) {
  const navigate = useNavigate()
  const postcode = fetched?.postcode || ''
  const price = fetched?.price
  const propertyType = fetched?.property_type || ''
  const redFlagContext = result.red_flags.slice(0, 2).join('; ')

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <button
        onClick={() => navigate(`/evaluate/neighbourhood${postcode ? `?postcode=${encodeURIComponent(postcode)}` : ''}`)}
        className="flex items-center gap-4 p-4 rounded-xl bg-surface-2 border border-border hover:border-brand/30 hover:bg-brand-light/30 transition-all text-left group"
      >
        <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition-colors">
          <MapPin className="w-4 h-4 text-brand group-hover:text-white transition-colors" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">Check the neighbourhood</p>
          <p className="text-xs text-ink-muted mt-0.5 truncate">
            {postcode ? `Auto-filled: ${postcode}` : 'Transport, schools & flood risk'}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-ink-faint group-hover:text-brand transition-colors shrink-0" />
      </button>

      <button
        onClick={() => {
          const params = new URLSearchParams()
          if (price) params.set('price', String(price))
          if (propertyType) params.set('type', propertyType)
          if (redFlagContext) params.set('context', redFlagContext)
          navigate(`/offer?${params.toString()}`)
        }}
        className="flex items-center gap-4 p-4 rounded-xl bg-surface-2 border border-border hover:border-brand/30 hover:bg-brand-light/30 transition-all text-left group"
      >
        <div className="w-10 h-10 rounded-xl bg-brand-light flex items-center justify-center shrink-0 group-hover:bg-brand transition-colors">
          <TrendingDown className="w-4 h-4 text-brand group-hover:text-white transition-colors" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">Build offer strategy</p>
          <p className="text-xs text-ink-muted mt-0.5 truncate">
            {price ? `Pre-filled: ${formatGBP(price)}` : 'Leverage points & opening script'}
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-ink-faint group-hover:text-brand transition-colors shrink-0" />
      </button>
    </div>
  )
}

// ── Sub-nav ───────────────────────────────────────────────────────────────────

type EvaluateTab = 'decoder' | 'viewing'

function SubNav({ tab, setTab, hasResult }: { tab: EvaluateTab; setTab: (t: EvaluateTab) => void; hasResult: boolean }) {
  const tabClass = (active: boolean) => cn(
    'px-4 py-2 rounded-xl transition-colors text-sm font-semibold',
    active ? 'bg-brand text-white shadow-sm' : 'bg-surface-2 border border-border text-ink-muted hover:text-ink hover:bg-surface-3'
  )
  return (
    <div className="flex gap-2 text-sm font-semibold flex-wrap">
      <button className={tabClass(tab === 'decoder')} onClick={() => setTab('decoder')}>
        Listing Decoder
      </button>
      <button
        className={cn(tabClass(tab === 'viewing'), 'flex items-center gap-2')}
        onClick={() => setTab('viewing')}
      >
        <HelpCircle className="w-3.5 h-3.5" />
        Viewing Prep
        {!hasResult && <span className="text-[10px] font-medium opacity-60">decode first</span>}
      </button>
      <NavLink to="/evaluate/neighbourhood"
        className={({ isActive }) => cn(
          'px-4 py-2 rounded-xl transition-colors',
          isActive ? 'bg-brand text-white shadow-sm' : 'bg-surface-2 border border-border text-ink-muted hover:text-ink hover:bg-surface-3'
        )}
      >
        Neighbourhood
      </NavLink>
      <NavLink to="/shortlist"
        className={({ isActive }) => cn(
          'px-4 py-2 rounded-xl transition-colors flex items-center gap-2',
          isActive ? 'bg-brand text-white shadow-sm' : 'bg-surface-2 border border-border text-ink-muted hover:text-ink hover:bg-surface-3'
        )}
      >
        <Bookmark className="w-3.5 h-3.5" />
        My Shortlist
      </NavLink>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Viewing Prep Panel ────────────────────────────────────────────────────────

function ViewingPrepPanel({
  result,
  viewingQs,
  isPending,
  error,
  onGenerate,
}: {
  result: ListingDecoderResult | null
  viewingQs: ViewingQuestionsResult | null
  isPending: boolean
  error: any
  onGenerate: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copyAll = () => {
    if (!viewingQs) return
    const lines = [
      '🏠 VIEWING PREP — PRIORITY QUESTIONS',
      ...viewingQs.priority_questions.map((q, i) => `${i + 1}. ${q}`),
      '',
      ...viewingQs.categories.map(cat =>
        [`\n${cat.name.toUpperCase()}`, ...cat.questions.map((q, i) => `${i + 1}. ${q}`)].join('\n')
      ),
    ].join('\n')
    navigator.clipboard.writeText(lines)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!result) {
    return (
      <div className="card p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto mb-4">
          <HelpCircle className="w-6 h-6 text-ink-faint" />
        </div>
        <p className="font-display text-xl text-ink mb-2">Decode a listing first</p>
        <p className="text-sm text-ink-muted">Switch to Listing Decoder, paste a Rightmove link, then come back here for your personalised viewing questions.</p>
      </div>
    )
  }

  if (!viewingQs && !isPending) {
    return (
      <div className="card p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-brand-light flex items-center justify-center mx-auto">
          <HelpCircle className="w-6 h-6 text-brand" />
        </div>
        <div>
          <p className="font-display text-xl text-ink">Viewing Prep</p>
          <p className="text-sm text-ink-muted mt-1 max-w-sm mx-auto">
            Generate a full set of categorised questions to take to the viewing — tailored to this specific property and its red flags.
          </p>
        </div>
        <PrimaryButton onClick={onGenerate}>Generate viewing questions</PrimaryButton>
        {error && <Callout variant="danger">{error?.userMessage ?? 'Something went wrong. Please try again.'}</Callout>}
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="card p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-brand-light flex items-center justify-center mx-auto">
          <Loader2 className="w-6 h-6 text-brand animate-spin" />
        </div>
        <div>
          <p className="font-display text-xl text-ink">Preparing your questions…</p>
          <p className="text-sm text-ink-muted mt-1">Analysing the listing and red flags</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-results">
      {/* Priority questions hero */}
      <div className="card p-5" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9F8 100%)', borderColor: 'rgba(91,61,174,0.15)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-display text-base text-ink">Priority questions</h2>
              <p className="text-xs text-ink-muted">Ask these first — bad answers mean walk away</p>
            </div>
          </div>
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-hover px-3 py-1.5 rounded-lg hover:bg-white/60 transition-colors"
          >
            {copied ? <><CheckCircle className="w-3.5 h-3.5" /> Copied</> : <><ClipboardCopy className="w-3.5 h-3.5" /> Copy all</>}
          </button>
        </div>
        <ol className="space-y-3">
          {viewingQs!.priority_questions.map((q, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink">
              <span className="w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <span className="leading-relaxed font-medium">{q}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Category cards */}
      {viewingQs!.categories.map((cat) => (
        <SolidCard key={cat.name}>
          <h3 className="font-display text-base text-ink mb-3">{cat.name}</h3>
          <ol className="space-y-2.5">
            {cat.questions.map((q, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink-muted">
                <span className="w-5 h-5 rounded-full bg-surface-2 border border-border text-ink-faint text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <span className="leading-relaxed">{q}</span>
              </li>
            ))}
          </ol>
        </SolidCard>
      ))}

      <button
        onClick={onGenerate}
        className="text-xs text-ink-faint hover:text-ink-muted underline underline-offset-2 transition-colors"
      >
        Regenerate questions
      </button>
    </div>
  )
}


export default function EvaluatePage() {
  const [tab, setTab]             = useState<EvaluateTab>('decoder')
  const [result, setResult]       = useState<ListingDecoderResult | null>(null)
  const [fetched, setFetched]     = useState<FetchedListing | null>(null)
  const [inputMode, setInputMode] = useState<'url' | 'paste'>('url')
  const [url, setUrl]             = useState('')
  const [pasteText, setPasteText] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [saved, setSaved]         = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [viewingQs, setViewingQs] = useState<ViewingQuestionsResult | null>(null)
  const [listingText, setListingText] = useState('')
  const markStage = useMarkStage()
  const qc = useQueryClient()

  const fetchMutation = useMutation({
    mutationFn: fetchRightmoveListing,
    onSuccess: (data) => {
      setFetched(data)
      setListingText(data.listing_text)
      if (data.property_type) setPropertyType(data.property_type)
      decodeMutation.mutate({ listing_text: data.listing_text, property_type: data.property_type || propertyType })
    },
  })

  const decodeMutation = useMutation({
    mutationFn: decodeListing,
    onSuccess: (data) => {
      setResult(data)
      setViewingQs(null)
      setSaved(false)
      setSaveError(null)
      markStage('evaluation', 'in_progress')
    },
  })

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

  const viewingMutation = useMutation({
    mutationFn: () => generateViewingQuestions({
      listing_text: listingText || pasteText,
      property_type: fetched?.property_type || propertyType || null,
      red_flags: result?.red_flags ?? [],
      leasehold_detected: result?.leasehold?.detected ?? false,
    }),
    onSuccess: (data) => setViewingQs(data),
  })

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setResult(null); setFetched(null); setSaved(false)
    fetchMutation.mutate(url.trim())
  }

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pasteText.trim()) return
    setResult(null); setFetched(null); setSaved(false); setListingText(pasteText)
    decodeMutation.mutate({ listing_text: pasteText, property_type: propertyType })
  }

  const isPending  = fetchMutation.isPending || decodeMutation.isPending
  const fetchError = fetchMutation.error as any
  const decodeError = decodeMutation.error as any

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 2 — Property Evaluation"
        title="Listing Decoder"
        description="Paste a Rightmove link — HomeReady fetches the listing, decodes the estate agent language, surfaces hidden risks, and tells you what to ask at the viewing."
      />

      {/* Sub-navigation */}
      <SubNav tab={tab} setTab={setTab} hasResult={!!result} />

      {/* Input card */}
      <SolidCard>
        {/* Mode toggle */}
        <div className="flex gap-2 mb-5">
          {(['url', 'paste'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setInputMode(m)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
                inputMode === m
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-surface-2 border border-border text-ink-muted hover:text-ink'
              )}
            >
              {m === 'url' ? <><Link className="w-3.5 h-3.5" /> Rightmove URL</> : <><FileText className="w-3.5 h-3.5" /> Paste text</>}
            </button>
          ))}
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

            {fetchMutation.isPending && (
              <div className="flex items-center gap-2.5 text-sm text-ink-muted bg-surface-2 rounded-xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-brand shrink-0" />
                <span>Fetching listing from Rightmove…</span>
              </div>
            )}
            {decodeMutation.isPending && fetched && (
              <div className="flex items-center gap-2.5 text-sm text-ink-muted bg-surface-2 rounded-xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-brand shrink-0" />
                <span>Decoding with AI — reading between the lines…</span>
              </div>
            )}
            {fetchError && (
              <Callout variant="danger">
                {fetchError?.userMessage ?? fetchError?.message ?? 'Could not fetch listing.'}{' '}
                <button type="button" onClick={() => setInputMode('paste')} className="underline font-semibold">
                  Paste text instead
                </button>
              </Callout>
            )}
            {decodeError && (
              <Callout variant="danger">
                {decodeError?.userMessage ?? 'Decode failed. Please try again.'}
              </Callout>
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
              <Callout variant="danger">
                {decodeError?.userMessage ?? 'Something went wrong. Please try again.'}
              </Callout>
            )}
          </form>
        )}
      </SolidCard>

      {/* Viewing Prep tab */}
      {tab === 'viewing' && (
        <ViewingPrepPanel
          result={result}
          viewingQs={viewingQs}
          isPending={viewingMutation.isPending}
          error={viewingMutation.error as any}
          onGenerate={() => viewingMutation.mutate()}
        />
      )}

      {/* Results */}
      {tab === 'decoder' && result && (
        <div className="space-y-5 animate-results">

          {/* Hero: Trust score */}
          <SolidCard>
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Score ring — hero */}
              <TrustRing score={result.trust_score} />

              {/* Summary */}
              <div className="flex-1 min-w-0">
                {fetched?.address && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <MapPin className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                    <p className="text-sm text-ink-muted truncate">{fetched.address}</p>
                    {fetched.rightmove_url && (
                      <a
                        href={fetched.rightmove_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:text-brand-hover ml-auto shrink-0 p-1 rounded hover:bg-brand-light transition-colors"
                        title="View on Rightmove"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}
                <h2 className="font-display text-xl text-ink mb-2">The honest picture</h2>
                <p className="text-base text-ink-muted leading-relaxed">{result.summary}</p>
                {fetched && <ListingMetadata fetched={fetched} />}
              </div>
            </div>

            {/* Save to shortlist */}
            <div className="flex items-center justify-between mt-5 pt-5 border-t border-border">
              <span className="text-sm text-ink-muted">Want to revisit this property?</span>
              {saved ? (
                <span className="flex items-center gap-2 text-sm text-success font-semibold">
                  <BookmarkCheck className="w-4 h-4" /> Saved to shortlist
                </span>
              ) : (
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-2 text-sm text-brand hover:text-brand-hover font-semibold transition-colors disabled:opacity-50 px-3 py-1.5 rounded-lg hover:bg-brand-light"
                >
                  {saveMutation.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
                    : <><Bookmark className="w-3.5 h-3.5" /> Save to shortlist</>
                  }
                </button>
              )}
            </div>
            {saveError && <p className="text-xs text-danger mt-2">{saveError}</p>}
          </SolidCard>

          {/* Red + green flags */}
          {(result.red_flags.length > 0 || result.green_flags.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              {result.red_flags.length > 0 && (
                <div className="flag-col-red">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldAlert className="w-4 h-4 text-danger" />
                    <h3 className="font-display text-base text-ink">Red flags</h3>
                    <span className="ml-auto badge badge-danger">{result.red_flags.length}</span>
                  </div>
                  <div className="space-y-0">
                    {result.red_flags.map((f, i) => (
                      <div key={i} className="flag-item">
                        <AlertTriangle className="w-3.5 h-3.5 text-danger mt-0.5 shrink-0" />
                        <span className="text-ink-muted">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.green_flags.length > 0 && (
                <div className="flag-col-green">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <h3 className="font-display text-base text-ink">Green flags</h3>
                    <span className="ml-auto badge badge-success">{result.green_flags.length}</span>
                  </div>
                  <div className="space-y-0">
                    {result.green_flags.map((f, i) => (
                      <div key={i} className="flag-item">
                        <CheckCircle className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                        <span className="text-ink-muted">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Decoded language */}
          {result.euphemisms.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                  <Eye className="w-4 h-4 text-brand" />
                </div>
                <div>
                  <h3 className="font-display text-base text-ink">Decoded language</h3>
                  <p className="text-xs text-ink-muted">What the estate agent really means</p>
                </div>
              </div>
              <div className="space-y-3">
                {result.euphemisms.map((e, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2.5 border-b border-border last:border-0">
                    <RiskBadge level={severityToRiskLevel(e.severity)} label={e.phrase} />
                    <span className="text-ink-faint hidden sm:block">→</span>
                    <p className="text-sm text-ink-muted flex-1">{e.likely_meaning}</p>
                  </div>
                ))}
              </div>
            </SolidCard>
          )}

          {/* Leasehold risk */}
          {result.leasehold.detected && (
            <div className={cn(
              'card p-5',
              result.leasehold.risk_level === 'critical' || result.leasehold.risk_level === 'high'
                ? 'border-danger/30 bg-danger-bg/30'
                : 'border-warning/30 bg-warning-bg/30'
            )}>
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  result.leasehold.risk_level === 'critical' || result.leasehold.risk_level === 'high'
                    ? 'bg-danger/10' : 'bg-warning/10'
                )}>
                  <Home className={cn(
                    'w-4 h-4',
                    result.leasehold.risk_level === 'critical' || result.leasehold.risk_level === 'high'
                      ? 'text-danger' : 'text-warning'
                  )} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-base text-ink">Leasehold risk</h3>
                  {result.leasehold.risk_level && (
                    <RiskBadge
                      level={result.leasehold.risk_level === 'critical' ? 'critical' : result.leasehold.risk_level === 'high' ? 'red' : result.leasehold.risk_level === 'medium' ? 'amber' : 'low'}
                      label={result.leasehold.risk_level}
                    />
                  )}
                </div>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">{result.leasehold.explanation}</p>
              {result.leasehold.lease_years && (
                <p className="mt-3 text-sm font-semibold">
                  Lease length detected:{' '}
                  <span className={cn((result.leasehold.lease_years ?? 999) < 80 ? 'text-danger' : 'text-success')}>
                    {result.leasehold.lease_years} years
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Missing information */}
          {result.missing_info.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Info className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <h3 className="font-display text-base text-ink">Missing information</h3>
                  <p className="text-xs text-ink-muted">Ask the agent or check the listing</p>
                </div>
              </div>
              <ul className="space-y-2">
                {result.missing_info.map((m, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-ink-muted py-1.5 border-b border-border last:border-0">
                    <HelpCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />{m}
                  </li>
                ))}
              </ul>
            </SolidCard>
          )}

          {/* Viewing questions teaser → tab CTA */}
          {result.viewing_questions.length > 0 && (
            <button
              onClick={() => setTab('viewing')}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-brand-light border border-brand/20 hover:bg-brand/10 transition-colors text-left group"
            >
              <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center shrink-0">
                <HelpCircle className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand">Prepare for your viewing</p>
                <p className="text-xs text-ink-muted mt-0.5">{result.viewing_questions.length} questions ready — get the full categorised set in Viewing Prep</p>
              </div>
              <ArrowRight className="w-4 h-4 text-brand shrink-0" />
            </button>
          )}

          {/* Continue your research */}
          <div>
            <p className="section-label mb-3">Continue your research</p>
            <ContextCTAs result={result} fetched={fetched} />
          </div>

        </div>
      )}
    </div>
  )
}
