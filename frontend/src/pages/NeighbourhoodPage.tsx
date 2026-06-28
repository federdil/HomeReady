import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { getNeighbourhoodBriefing } from '@/lib/api'
import { useMarkStage } from '@/lib/useMarkStage'
import type { NeighbourhoodResult } from '@/types'
import { cn } from '@/lib/utils'
import { SolidCard, GlassCard, PageHeader, PrimaryButton, FormField, RiskBadge } from '@/components/ui'
import { Train, Droplets, GraduationCap, MapPin, AlertTriangle, CheckCircle, ThumbsUp, ThumbsDown, Loader2, Sparkles, Info } from 'lucide-react'
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

function ScoreRing({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color = score >= 70 ? '#22A05A' : score >= 45 ? '#D97706' : '#DC2626'
  const dim = size === 'sm' ? 64 : 96
  const r   = size === 'sm' ? 26 : 38
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="shrink-0">
      <circle cx={dim/2} cy={dim/2} r={r} fill="none" stroke="rgba(200,190,220,0.3)" strokeWidth={size==='sm'?6:8} />
      <circle cx={dim/2} cy={dim/2} r={r} fill="none" stroke={color} strokeWidth={size==='sm'?6:8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${dim/2} ${dim/2})`} />
      <text x={dim/2} y={dim/2+2} textAnchor="middle" fontSize={size==='sm'?13:20} fontWeight="700" fill="#1E1030">{score}</text>
    </svg>
  )
}

function floodLevelToRisk(level: string): 'low' | 'amber' | 'red' | 'critical' {
  if (level === 'low')       return 'low'
  if (level === 'medium')    return 'amber'
  if (level === 'high')      return 'red'
  return 'critical'
}

function AgentThinking() {
  const steps = [
    'Calling TfL transport API…',
    'Checking Environment Agency flood data…',
    'Looking up Ofsted school ratings…',
    'Searching neighbourhood information…',
    'Synthesising briefing…',
  ]
  const [step, setStep] = useState(0)
  useState(() => {
    const iv = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 2200)
    return () => clearInterval(iv)
  })
  return (
    <GlassCard className="text-center space-y-4 py-8">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto" style={{ background: 'rgba(130,100,200,0.12)' }}>
        <Sparkles className="w-6 h-6 text-purple animate-pulse" />
      </div>
      <div>
        <p className="font-display text-lg text-plum">Agent working…</p>
        <p className="text-xs text-plum-soft mt-1">Claude is calling live APIs to build your briefing</p>
      </div>
      <div className="space-y-2 text-left max-w-xs mx-auto">
        {steps.map((s, i) => (
          <div key={i} className={cn('flex items-center gap-2 text-xs transition-all duration-500',
            i < step ? 'text-sage' : i === step ? 'text-purple font-medium' : 'text-plum-soft opacity-40'
          )}>
            {i < step
              ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              : i === step
              ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              : <div className="w-3.5 h-3.5 rounded-full border border-dusk-deep shrink-0" />}
            {s}
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

export default function NeighbourhoodPage() {
  const [result, setResult] = useState<NeighbourhoodResult | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const markStage = useMarkStage()
  const [searchParams] = useSearchParams()
  const prefillPostcode = searchParams.get('postcode') ?? ''

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { postcode: prefillPostcode },
  })

  const mutation = useMutation({
    mutationFn: getNeighbourhoodBriefing,
    onSuccess: (data) => { setResult(data); markStage('evaluation', 'complete') },
  })

  const toggle = (v: string) => setSelected(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 2 — AI Agent"
        title="Neighbourhood Briefing"
        description="Enter a postcode and HomeReady's AI agent autonomously calls live APIs — transport, flood risk, schools — then synthesises an honest briefing."
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
      </div>

      <SolidCard>
        <form onSubmit={handleSubmit(d => mutation.mutate({ ...d, buyer_priorities: selected }))} className="space-y-5">
          <FormField label="UK postcode" error={errors.postcode?.message}>
            <input {...register('postcode')} placeholder="e.g. E2 9DA or SW1A 1AA" className="glass-input uppercase" />
          </FormField>

          <div>
            <label className="block text-sm font-medium text-plum mb-2">
              What matters most to you?
              <span className="text-plum-soft font-normal ml-1 text-xs">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
                  className={cn('text-xs px-3 py-1.5 rounded-full border transition-all',
                    selected.includes(opt.value)
                      ? 'bg-purple text-white border-purple'
                      : 'bg-white/40 text-plum-soft border-white/60 hover:border-purple/30 hover:text-plum'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <PrimaryButton type="submit" loading={mutation.isPending}>
            {mutation.isPending ? 'Agent running…' : 'Build neighbourhood briefing'}
          </PrimaryButton>

          {mutation.isError && (
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />{(mutation.error as any)?.userMessage ?? 'Something went wrong. Please try again.'}
            </p>
          )}
        </form>
      </SolidCard>

      {mutation.isPending && <AgentThinking />}

      {result && !mutation.isPending && (
        <div className="space-y-4 animate-results">

          {/* Hero */}
          <GlassCard className="flex gap-6 items-center px-6 py-5">
            <ScoreRing score={result.overall_score} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="stage-pill">
                  <span className="stage-pill-dot" />
                  {result.area_name} · {result.postcode}
                </span>
              </div>
              <p className="font-display text-xl text-plum leading-snug">{result.headline}</p>
            </div>
          </GlassCard>

          {/* Transport · Flood · Schools */}
          <div className="grid md:grid-cols-3 gap-4">
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <Train className="w-4 h-4 text-purple" />
                <h3 className="font-display text-base text-plum">Transport</h3>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <ScoreRing score={result.transport.score} size="sm" />
                <p className="text-xs text-plum-soft leading-relaxed">{result.transport.summary}</p>
              </div>
              {result.transport.nearest_stations.slice(0, 3).map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-plum-soft mt-1">
                  <Train className="w-3 h-3 opacity-50" />{s}
                </div>
              ))}
            </SolidCard>

            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <Droplets className="w-4 h-4 text-purple" />
                <h3 className="font-display text-base text-plum">Flood Risk</h3>
              </div>
              <div className="mb-2">
                <RiskBadge level={floodLevelToRisk(result.flood_risk.risk_level)} label={result.flood_risk.risk_level.replace('_', ' ') + ' risk'} />
              </div>
              <p className="text-xs text-plum-soft leading-relaxed">{result.flood_risk.summary}</p>
            </SolidCard>

            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <GraduationCap className="w-4 h-4 text-purple" />
                <h3 className="font-display text-base text-plum">Schools</h3>
              </div>
              <div className="flex items-center gap-3 mb-2">
                <ScoreRing score={result.schools.score} size="sm" />
                <p className="text-xs text-plum-soft leading-relaxed">{result.schools.summary}</p>
              </div>
              {result.schools.notable_schools.slice(0, 2).map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-sage mt-1">
                  <CheckCircle className="w-3 h-3" />{s}
                </div>
              ))}
            </SolidCard>
          </div>

          {/* Area character */}
          <SolidCard>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-purple" />
              <h3 className="font-display text-base text-plum">Area character</h3>
            </div>
            <p className="text-sm text-plum-soft leading-relaxed mb-3">{result.area_character.vibe}</p>
            <div className="flex flex-wrap gap-2">
              {result.area_character.amenities.map((a, i) => (
                <span key={i} className="text-xs bg-dusk text-plum-soft px-2.5 py-1 rounded-full">{a}</span>
              ))}
            </div>
            {result.area_character.safety_note && (
              <div className="flex gap-2 mt-3 bg-white/50 rounded-xl p-3">
                <Info className="w-4 h-4 text-plum-soft shrink-0 mt-0.5" />
                <p className="text-xs text-plum-soft">{result.area_character.safety_note}</p>
              </div>
            )}
          </SolidCard>

          {/* Buyer fit */}
          <div className="grid md:grid-cols-2 gap-4">
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <ThumbsUp className="w-4 h-4 text-sage" />
                <h3 className="font-display text-base text-plum">Good for</h3>
              </div>
              <ul className="space-y-2">
                {result.buyer_fit.good_for.map((g, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum-soft">
                    <CheckCircle className="w-4 h-4 text-sage mt-0.5 shrink-0" />{g}
                  </li>
                ))}
              </ul>
            </SolidCard>
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <ThumbsDown className="w-4 h-4 text-amber" />
                <h3 className="font-display text-base text-plum">Less suited for</h3>
              </div>
              <ul className="space-y-2">
                {result.buyer_fit.less_good_for.map((g, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum-soft">
                    <AlertTriangle className="w-4 h-4 text-amber mt-0.5 shrink-0" />{g}
                  </li>
                ))}
              </ul>
            </SolidCard>
          </div>

          {/* Key risks */}
          {result.key_risks.length > 0 && (
            <GlassCard>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber" />
                <h3 className="font-display text-base text-plum">Things to investigate further</h3>
              </div>
              <ul className="space-y-2">
                {result.key_risks.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum-soft">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />{r}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          <p className="text-xs text-plum-soft text-center opacity-60">
            Data sourced from: {result.data_sources.join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}
