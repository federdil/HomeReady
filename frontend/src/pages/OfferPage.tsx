import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { getOfferStrategy } from '@/lib/api'
import { useMarkStage } from '@/lib/useMarkStage'
import type { OfferStrategyResult } from '@/types'
import { cn } from '@/lib/utils'
import { SolidCard, PageHeader, PrimaryButton, FormField, Callout } from '@/components/ui'
import {
  AlertTriangle, CheckCircle, Lightbulb, MessageSquare,
  PoundSterling, TrendingDown, ShieldAlert, ListChecks, Copy, Check,
} from 'lucide-react'

const schema = z.object({
  asking_price:          z.number({ invalid_type_error: 'Enter the asking price' }).positive(),
  property_type:         z.string(),
  weeks_on_market:       z.number().int().nonnegative().optional().or(z.literal('')),
  chain_status:          z.string(),
  buyer_position:        z.string(),
  survey_outcome:        z.string().optional(),
  estimated_repair_cost: z.number().nonnegative().optional().or(z.literal('')),
  seller_situation:      z.string().optional(),
  comparable_prices:     z.string().optional(),
})
type FormData = z.infer<typeof schema>

function formatGBP(n: number) {
  return '£' + n.toLocaleString('en-GB')
}

// ── Offer range meter ─────────────────────────────────────────────────────────

function OfferMeter({ recommended, low, high, asking }: {
  recommended: number; low: number; high: number; asking: number
}) {
  const min  = Math.min(low, asking) * 0.97
  const max  = Math.max(high, asking) * 1.01
  const span = max - min
  const pct  = (v: number) => `${Math.round(((v - min) / span) * 100)}%`

  return (
    <div className="mt-5 mb-2">
      <div className="relative h-2.5 rounded-full bg-surface-3 overflow-visible mb-8">
        {/* Range band */}
        <div
          className="absolute top-0 h-full rounded-full bg-success/20"
          style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }}
        />
        {/* Asking price marker */}
        <div className="absolute -top-1 -translate-x-1/2" style={{ left: pct(asking) }}>
          <div className="w-1.5 h-4.5 rounded-full bg-danger" />
          <span className="absolute top-5 -translate-x-1/2 text-[10px] text-danger whitespace-nowrap font-semibold">Asking</span>
        </div>
        {/* Recommended marker */}
        <div className="absolute -top-1.5 -translate-x-1/2 z-10" style={{ left: pct(recommended) }}>
          <div className="w-2 h-5 rounded-full bg-brand" />
          <span className="absolute top-6 -translate-x-1/2 text-[10px] text-brand whitespace-nowrap font-semibold">Offer</span>
        </div>
      </div>
      <div className="flex justify-between text-xs text-ink-muted">
        <span className="font-medium">{formatGBP(low)}</span>
        <span className="text-brand font-semibold">Recommended: {formatGBP(recommended)}</span>
        <span className="font-medium">{formatGBP(high)}</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OfferPage() {
  const [result, setResult] = useState<OfferStrategyResult | null>(null)
  const [copied, setCopied] = useState(false)
  const markStage = useMarkStage()
  const [searchParams] = useSearchParams()

  const prefillPrice   = searchParams.get('price')   ? Number(searchParams.get('price'))   : undefined
  const prefillType    = searchParams.get('type')    ?? 'flat'
  const prefillContext = searchParams.get('context') ?? ''

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      asking_price:     prefillPrice,
      property_type:    prefillType,
      chain_status:     'unknown',
      buyer_position:   'mortgage_agreed',
      seller_situation: prefillContext || undefined,
    },
  })

  const surveyOutcome = watch('survey_outcome')

  const mutation = useMutation({
    mutationFn: (d: FormData) => getOfferStrategy({
      asking_price:          d.asking_price,
      property_type:         d.property_type,
      weeks_on_market:       d.weeks_on_market === '' ? undefined : d.weeks_on_market as number | undefined,
      chain_status:          d.chain_status,
      buyer_position:        d.buyer_position,
      survey_outcome:        d.survey_outcome || undefined,
      estimated_repair_cost: d.estimated_repair_cost === '' ? undefined : d.estimated_repair_cost as number | undefined,
      seller_situation:      d.seller_situation || undefined,
      comparable_prices:     d.comparable_prices || undefined,
    }),
    onSuccess: (data) => { setResult(data); markStage('offer', 'complete') },
  })

  const copyScript = () => {
    if (!result) return
    navigator.clipboard.writeText(result.opening_script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const saving = result ? result.walkaway_price - result.recommended_offer : 0

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 3 — Offer & Negotiation"
        title="Offer Strategy"
        description="Tell HomeReady about the property and your position. We'll calculate the right offer, give you leverage points, and write your opening script."
      />

      {prefillPrice && (
        <Callout variant="info">
          Pre-filled from your decoded listing — review and adjust before generating.
        </Callout>
      )}

      {/* Input form */}
      <SolidCard>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-5">
          {/* Core details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Asking price" error={errors.asking_price?.message}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-semibold">£</span>
                <input
                  {...register('asking_price', { valueAsNumber: true })}
                  type="number"
                  placeholder="350000"
                  className="glass-input pl-7"
                />
              </div>
            </FormField>
            <FormField label="Property type">
              <select {...register('property_type')} className="glass-input">
                <option value="flat">Flat / Apartment</option>
                <option value="house">House</option>
                <option value="maisonette">Maisonette</option>
                <option value="studio">Studio</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Weeks on market" hint="Leave blank if unknown">
              <input
                {...register('weeks_on_market', { valueAsNumber: true })}
                type="number"
                placeholder="e.g. 8"
                className="glass-input"
              />
            </FormField>
            <FormField label="Seller's chain status">
              <select {...register('chain_status')} className="glass-input">
                <option value="no_chain">No chain — vacant / new build</option>
                <option value="short_chain">Short chain (1–2 properties)</option>
                <option value="long_chain">Long chain (3+ properties)</option>
                <option value="unknown">Unknown</option>
              </select>
            </FormField>
          </div>

          <FormField label="Your position">
            <select {...register('buyer_position')} className="glass-input">
              <option value="mortgage_agreed">Mortgage agreed in principle</option>
              <option value="mortgage_offer">Full mortgage offer in hand</option>
              <option value="cash_buyer">Cash buyer</option>
              <option value="first_time_buyer_mip">First-time buyer with MIP</option>
            </select>
          </FormField>

          {/* Survey */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Survey outcome" hint="Leave blank if no survey yet">
              <select {...register('survey_outcome')} className="glass-input">
                <option value="">No survey yet</option>
                <option value="clean">Clean — no significant issues</option>
                <option value="minor_issues">Minor issues only</option>
                <option value="significant_issues">Significant issues</option>
                <option value="major_issues">Major / structural issues</option>
              </select>
            </FormField>
            {surveyOutcome && surveyOutcome !== 'clean' && surveyOutcome !== '' && (
              <FormField label="Estimated repair cost" hint="From your surveyor's report">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-semibold">£</span>
                  <input
                    {...register('estimated_repair_cost', { valueAsNumber: true })}
                    type="number"
                    placeholder="15000"
                    className="glass-input pl-7"
                  />
                </div>
              </FormField>
            )}
          </div>

          {/* Optional context */}
          <FormField label="Seller's situation" hint="Optional — anything you know about their motivation">
            <input
              {...register('seller_situation')}
              placeholder="e.g. Seller has already bought and is keen to complete quickly"
              className="glass-input"
            />
          </FormField>

          <FormField label="Comparable sold prices" hint="Optional — paste from Rightmove / Zoopla sold data">
            <textarea
              {...register('comparable_prices')}
              rows={3}
              placeholder="e.g. 12 Oak St sold for £340,000 in Oct 2024 (same size flat). 8 Elm Rd sold for £355,000 in Jan 2025."
              className="glass-input resize-none"
            />
          </FormField>

          <PrimaryButton type="submit" loading={mutation.isPending} className="w-full sm:w-auto">
            {mutation.isPending ? 'Building strategy…' : 'Build offer strategy'}
          </PrimaryButton>

          {mutation.isError && (
            <Callout variant="danger">
              {(mutation.error as any)?.userMessage ?? 'Something went wrong. Please try again.'}
            </Callout>
          )}
        </form>
      </SolidCard>

      {/* Results */}
      {result && (
        <div className="space-y-5 animate-results">

          {/* Hero — offer numbers */}
          <div className="card p-6"
            style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9F8 100%)', borderColor: 'rgba(91,61,174,0.15)' }}
          >
            <div className="flex flex-wrap items-start gap-4">
              <div>
                <p className="section-label mb-1">Recommended offer</p>
                <p className="font-display text-4xl text-brand">{formatGBP(result.recommended_offer)}</p>
                <p className="text-sm text-ink-muted mt-1">
                  Range: {formatGBP(result.offer_range.low)} – {formatGBP(result.offer_range.high)}
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="section-label mb-1">Walk-away price</p>
                <p className="font-display text-2xl text-ink">{formatGBP(result.walkaway_price)}</p>
                {saving > 0 && (
                  <p className="text-sm text-success font-semibold mt-1 flex items-center gap-1 justify-end">
                    <TrendingDown className="w-3.5 h-3.5" /> {formatGBP(saving)} below asking
                  </p>
                )}
              </div>
            </div>
            <OfferMeter
              recommended={result.recommended_offer}
              low={result.offer_range.low}
              high={result.offer_range.high}
              asking={mutation.variables?.asking_price ?? result.recommended_offer}
            />
            <p className="text-base text-ink-muted leading-relaxed mt-3">{result.offer_rationale}</p>
          </div>

          {/* Leverage points */}
          {result.leverage_points.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-success" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-ink">Your leverage points</h3>
                  <p className="text-xs text-ink-muted">Use these to justify your offer</p>
                </div>
              </div>
              <ul className="space-y-2.5">
                {result.leverage_points.map((pt, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-ink-muted py-2 border-b border-border last:border-0">
                    <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />{pt}
                  </li>
                ))}
              </ul>
            </SolidCard>
          )}

          {/* Conditions to include */}
          {result.conditions_to_include.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                  <ListChecks className="w-4 h-4 text-brand" />
                </div>
                <h3 className="font-display text-lg text-ink">Conditions to include</h3>
              </div>
              <ol className="space-y-3">
                {result.conditions_to_include.map((c, i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-muted">
                    <span className="w-5 h-5 rounded-full bg-brand-light text-brand text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{c}</span>
                  </li>
                ))}
              </ol>
            </SolidCard>
          )}

          {/* Opening script */}
          <div className="card-tinted p-5 rounded-2xl border border-brand/15">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-brand" />
                </div>
                <div>
                  <h3 className="font-display text-lg text-ink">Opening script</h3>
                  <p className="text-xs text-ink-muted">Read this when calling the agent</p>
                </div>
              </div>
              <button
                onClick={copyScript}
                className={cn(
                  'flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-semibold transition-all',
                  copied
                    ? 'bg-success/10 text-success border border-success/20'
                    : 'bg-white border border-border text-ink-muted hover:text-ink hover:border-brand/30'
                )}
              >
                {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>
            <div className="bg-white rounded-xl p-4 border border-border text-sm text-ink leading-relaxed whitespace-pre-wrap font-mono">
              {result.opening_script}
            </div>
          </div>

          {/* What to expect next */}
          <SolidCard>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-warning" />
              </div>
              <h3 className="font-display text-base text-ink">What to expect next</h3>
            </div>
            <p className="text-base text-ink-muted leading-relaxed">{result.likely_counter}</p>
          </SolidCard>

          {/* Negotiation tips */}
          {result.negotiation_tips.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-brand" />
                </div>
                <h3 className="font-display text-lg text-ink">Negotiation tips</h3>
              </div>
              <ul className="space-y-2.5">
                {result.negotiation_tips.map((tip, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-ink-muted py-2 border-b border-border last:border-0">
                    <Lightbulb className="w-4 h-4 text-brand shrink-0 mt-0.5" />{tip}
                  </li>
                ))}
              </ul>
            </SolidCard>
          )}


        </div>
      )}
    </div>
  )
}
