import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { streamNeighbourhoodBriefing } from '@/lib/api'
import { useMarkStage } from '@/lib/useMarkStage'
import type { NeighbourhoodResult } from '@/types'
import { cn } from '@/lib/utils'
import { SolidCard, PageHeader, PrimaryButton, FormField, RiskBadge, Callout } from '@/components/ui'
import {
  Train, Droplets, GraduationCap, MapPin, AlertTriangle, CheckCircle,
  ThumbsUp, ThumbsDown, Loader2, Sparkles, Info,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

const PRIORITY_OPTIONS = [
  { value: 'commute',    label: 'Commute' },
  { value: 'schools',    label: 'Schools' },
  { value: 'safety',     label: 'Safety' },
  { value: 'amenities',  label: 'Amenities' },
  { value: 'flood_risk', label: 'Flood risk' },
  { value: 'green_space',label: 'Green space' },
]

const schema = z.object({
  postcode: z.string().min(3, 'Enter a valid UK postcode'),
  buyer_priorities: z.array(z.string()).optional(),
})
type FormData = z.infer<typeof schema>

// ── Score ring ────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color = score >= 70 ? '#16A34A' : score >= 45 ? '#D97706' : '#DC2626'
  const dim   = size === 'sm' ? 64 : 96
  const r     = size === 'sm' ? 26 : 38
  const circ  = 2 * Math.PI * r
  const dash  = (score / 100) * circ
  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="shrink-0">
      <circle cx={dim/2} cy={dim/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={size === 'sm' ? 6 : 8} />
      <circle
        cx={dim/2} cy={dim/2} r={r}
        fill="none" stroke={color}
        strokeWidth={size === 'sm' ? 6 : 8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${dim/2} ${dim/2})`}
        style={{ transition: 'stroke-dasharray 0.7s ease' }}
      />
      <text
        x={dim/2} y={dim/2 + 5}
        textAnchor="middle"
        fontSize={size === 'sm' ? 14 : 22}
        fontWeight="700"
        fill="#111827"
        fontFamily="'DM Serif Display', serif"
      >
        {score}
      </text>
    </svg>
  )
}

function floodLevelToRisk(level: string): 'low' | 'amber' | 'red' | 'critical' {
  if (level === 'low')    return 'low'
  if (level === 'medium') return 'amber'
  if (level === 'high')   return 'red'
  return 'critical'
}

// ── Tool label map ────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  get_transport_data:   'Calling TfL transport API…',
  get_flood_risk:       'Checking Environment Agency flood data…',
  get_schools_data:     'Looking up Ofsted school ratings…',
  search_neighbourhood: 'Searching neighbourhood information…',
}

type ToolStep = { tool: string; done: boolean }

// ── Agent thinking loader ─────────────────────────────────────────────────────

function AgentThinking({ steps }: { steps: ToolStep[] }) {
  const allKnown = Object.keys(TOOL_LABELS)
  // Show known tools in order, plus any unexpected ones at the end
  const ordered = [
    ...allKnown.filter(t => steps.some(s => s.tool === t)),
    ...steps.filter(s => !allKnown.includes(s.tool)).map(s => s.tool),
  ]
  const activeIdx = ordered.findIndex(t => {
    const s = steps.find(x => x.tool === t)
    return s && !s.done
  })

  return (
    <div className="card p-8 text-center space-y-5">
      <div className="w-14 h-14 rounded-2xl bg-brand-light flex items-center justify-center mx-auto">
        <Sparkles className="w-6 h-6 text-brand animate-pulse" />
      </div>
      <div>
        <p className="font-display text-xl text-ink">Agent working…</p>
        <p className="text-sm text-ink-muted mt-1">Calling live APIs to build your neighbourhood briefing</p>
      </div>
      <div className="space-y-2.5 text-left max-w-xs mx-auto">
        {ordered.length === 0 ? (
          // Nothing arrived yet — show a single spinner
          <div className="flex items-center gap-2.5 text-sm text-brand font-semibold">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            Starting agent…
          </div>
        ) : (
          ordered.map((tool, i) => {
            const step = steps.find(s => s.tool === tool)
            const done = step?.done ?? false
            const active = i === activeIdx
            return (
              <div
                key={tool}
                className={cn(
                  'flex items-center gap-2.5 text-sm transition-all duration-500',
                  done    ? 'text-success' :
                  active  ? 'text-brand font-semibold' :
                  'text-ink-faint'
                )}
              >
                {done
                  ? <CheckCircle className="w-4 h-4 shrink-0" />
                  : active
                  ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                  : <div className="w-4 h-4 rounded-full border-2 border-border shrink-0" />
                }
                {TOOL_LABELS[tool] ?? tool}
              </div>
            )
          })
        )}
        {/* Synthesising step — shows after all tools done */}
        {ordered.length > 0 && steps.every(s => s.done) && (
          <div className="flex items-center gap-2.5 text-sm text-brand font-semibold">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            Synthesising briefing…
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-nav ───────────────────────────────────────────────────────────────────

function SubNav() {
  return (
    <div className="flex gap-2 text-sm font-semibold flex-wrap">
      <NavLink to="/evaluate" end
        className={({ isActive }) => cn(
          'px-4 py-2 rounded-xl transition-colors',
          isActive ? 'bg-brand text-white shadow-sm' : 'bg-surface-2 border border-border text-ink-muted hover:text-ink hover:bg-surface-3'
        )}
      >
        Listing Decoder
      </NavLink>
      <NavLink to="/evaluate/neighbourhood"
        className={({ isActive }) => cn(
          'px-4 py-2 rounded-xl transition-colors',
          isActive ? 'bg-brand text-white shadow-sm' : 'bg-surface-2 border border-border text-ink-muted hover:text-ink hover:bg-surface-3'
        )}
      >
        Neighbourhood Briefing
      </NavLink>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NeighbourhoodPage() {
  const [result, setResult] = useState<NeighbourhoodResult | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [isPending, setIsPending] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([])
  const markStage = useMarkStage()
  const [searchParams] = useSearchParams()
  const prefillPostcode = searchParams.get('postcode') ?? ''

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { postcode: prefillPostcode },
  })

  const toggle = (v: string) => setSelected(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])

  const onSubmit = useCallback(async (formData: FormData) => {
    setIsPending(true)
    setStreamError(null)
    setResult(null)
    setToolSteps([])

    try {
      await streamNeighbourhoodBriefing(
        { ...formData, buyer_priorities: selected },
        (evt) => {
          if (evt.event === 'tool_start') {
            setToolSteps(prev => [...prev, { tool: evt.tool, done: false }])
          } else if (evt.event === 'tool_done') {
            setToolSteps(prev => prev.map(s => s.tool === evt.tool ? { ...s, done: true } : s))
          } else if (evt.event === 'complete') {
            setResult(evt.data)
            markStage('evaluation', 'complete')
          } else if (evt.event === 'error') {
            setStreamError(evt.message)
          }
        }
      )
    } catch (e: any) {
      setStreamError(e?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsPending(false)
    }
  }, [selected, markStage])

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 2 — AI Agent"
        title="Neighbourhood Briefing"
        description="Enter a postcode and HomeReady's AI agent autonomously calls live APIs — transport, flood risk, schools — then synthesises an honest briefing."
      />

      {/* Sub-navigation */}
      <SubNav />

      {/* Input form */}
      <SolidCard>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <FormField label="UK postcode" error={errors.postcode?.message}>
            <input
              {...register('postcode')}
              placeholder="e.g. E2 9DA or SW1A 1AA"
              className="glass-input uppercase"
            />
          </FormField>

          <div>
            <label className="block text-sm font-semibold text-ink mb-2.5">
              What matters most to you?
              <span className="text-ink-faint font-normal ml-1.5 text-xs">optional</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    'text-sm px-4 py-1.5 rounded-full border font-medium transition-all',
                    selected.includes(opt.value)
                      ? 'bg-brand text-white border-brand shadow-sm'
                      : 'bg-white border-border text-ink-muted hover:border-brand/40 hover:text-ink'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <PrimaryButton type="submit" loading={isPending}>
            {isPending ? 'Agent running…' : 'Build neighbourhood briefing'}
          </PrimaryButton>

          {streamError && (
            <Callout variant="danger">{streamError}</Callout>
          )}
        </form>
      </SolidCard>

      {/* Loading state — real tool steps */}
      {isPending && <AgentThinking steps={toolSteps} />}

      {/* Results */}
      {result && !isPending && (
        <div className="space-y-5 animate-results">

          {/* Hero — area score */}
          <div className="card p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center"
            style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9F8 100%)', borderColor: 'rgba(91,61,174,0.15)' }}
          >
            <div className="flex flex-col items-center gap-2 shrink-0">
              <ScoreRing score={result.overall_score} />
              <span className="text-xs font-semibold text-brand">Overall score</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="stage-pill">
                  <span className="stage-pill-dot" />
                  {result.area_name} · {result.postcode}
                </span>
              </div>
              <p className="font-display text-xl text-ink leading-snug">{result.headline}</p>
            </div>
          </div>

          {/* Transport · Flood · Schools */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* Transport */}
            <SolidCard>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                  <Train className="w-4 h-4 text-brand" />
                </div>
                <h3 className="font-display text-base text-ink">Transport</h3>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <ScoreRing score={result.transport.score} size="sm" />
                <p className="text-sm text-ink-muted leading-relaxed">{result.transport.summary}</p>
              </div>
              {result.transport.nearest_stations.slice(0, 3).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-ink-muted mt-1.5">
                  <Train className="w-3 h-3 text-ink-faint shrink-0" />{s}
                </div>
              ))}
            </SolidCard>

            {/* Flood risk */}
            <SolidCard>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                  <Droplets className="w-4 h-4 text-brand" />
                </div>
                <h3 className="font-display text-base text-ink">Flood Risk</h3>
              </div>
              <div className="mb-3">
                <RiskBadge level={floodLevelToRisk(result.flood_risk.risk_level)} label={result.flood_risk.risk_level.replace('_', ' ') + ' risk'} />
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">{result.flood_risk.summary}</p>
            </SolidCard>

            {/* Schools */}
            <SolidCard>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-brand" />
                </div>
                <h3 className="font-display text-base text-ink">Schools</h3>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <ScoreRing score={result.schools.score} size="sm" />
                <p className="text-sm text-ink-muted leading-relaxed">{result.schools.summary}</p>
              </div>
              {result.schools.notable_schools.slice(0, 2).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-success mt-1.5">
                  <CheckCircle className="w-3 h-3 shrink-0" />{s}
                </div>
              ))}
            </SolidCard>
          </div>

          {/* Area character */}
          <SolidCard>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                <MapPin className="w-4 h-4 text-brand" />
              </div>
              <h3 className="font-display text-base text-ink">Area character</h3>
            </div>
            <p className="text-base text-ink-muted leading-relaxed mb-4">{result.area_character.vibe}</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {result.area_character.amenities.map((a, i) => (
                <span key={i} className="badge badge-neutral">{a}</span>
              ))}
            </div>
            {result.area_character.safety_note && (
              <Callout variant="info">
                {result.area_character.safety_note}
              </Callout>
            )}
          </SolidCard>

          {/* Buyer fit */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flag-col-green">
              <div className="flex items-center gap-2 mb-3">
                <ThumbsUp className="w-4 h-4 text-success" />
                <h3 className="font-display text-base text-ink">Good for</h3>
              </div>
              <div className="space-y-0">
                {result.buyer_fit.good_for.map((g, i) => (
                  <div key={i} className="flag-item">
                    <CheckCircle className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                    <span className="text-ink-muted">{g}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flag-col-red">
              <div className="flex items-center gap-2 mb-3">
                <ThumbsDown className="w-4 h-4 text-warning" />
                <h3 className="font-display text-base text-ink">Less suited for</h3>
              </div>
              <div className="space-y-0">
                {result.buyer_fit.less_good_for.map((g, i) => (
                  <div key={i} className="flag-item">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
                    <span className="text-ink-muted">{g}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Key risks */}
          {result.key_risks.length > 0 && (
            <Callout variant="warning" title="Things to investigate further">
              <ul className="space-y-2 mt-1">
                {result.key_risks.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Callout>
          )}

          {/* Data sources */}
          <p className="text-xs text-ink-faint text-center">
            Data sourced from: {result.data_sources.join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}
