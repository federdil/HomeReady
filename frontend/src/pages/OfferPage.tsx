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
import { SolidCard, GlassCard, PageHeader, PrimaryButton, FormField } from '@/components/ui'
import {
  AlertTriangle, CheckCircle, Lightbulb, MessageSquare,
  PoundSterling, TrendingDown, ShieldAlert, ListChecks,
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

function OfferMeter({ recommended, low, high, asking }: {
  recommended: number; low: number; high: number; asking: number
}) {
  const min = Math.min(low, asking) * 0.97
  const max = Math.max(high, asking) * 1.01
  const span = max - min
  const pct = (v: number) => `${Math.round(((v - min) / span) * 100)}%`

  return (
    <div className="mt-4 mb-2">
      <div className="relative h-3 rounded-full bg-dusk-deep overflow-visible mb-6">
        {/* Range band */}
        <div
          className="absolute top-0 h-full rounded-full bg-sage/20"
          style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }}
        />
        {/* Asking price marker */}
        <div className="absolute -top-1 -translate-x-1/2" style={{ left: pct(asking) }}>
          <div className="w-1.5 h-5 rounded-full bg-red-400" />
          <span className="absolute top-6 -translate-x-1/2 text-[10px] text-red-500 whitespace-nowrap font-medium">Asking</span>
        </div>
        {/* Recommended marker */}
        <div className="absolute -top-1.5 -translate-x-1/2 z-10" style={{ left: pct(recommended) }}>
          <div className="w-2 h-6 rounded-full bg-purple" />
          <span className="absolute top-7 -translate-x-1/2 text-[10px] text-purple whitespace-nowrap font-medium">Offer</span>
        </div>
      </div>
      <div className="flex justify-between text-xs text-plum-soft">
        <span>{formatGBP(low)}</span>
        <span className="text-purple font-medium">Rec. {formatGBP(recommended)}</span>
        <span>{formatGBP(high)}</span>
      </div>
    </div>
  )
}

export default function OfferPage() {
  const [result, setResult] = useState<OfferStrategyResult | null>(null)
  const [copied, setCopied]  = useState(false)
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
    setTimeout(() => setCopied(false), 2000)
  }

  const saving = result ? result.walkaway_price - result.recommended_offer : 0

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 3 — Offer & Negotiation"
        title="Offer Strategy"
        description="Tell HomeReady about the property and your position. We'll calculate the right offer, give you leverage points, and write the opening script."
      />

      {prefillPrice && (
        <div className="flex items-center gap-2 text-xs text-purple bg-purple-faint border border-purple/20 rounded-xl px-4 py-2.5">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          Pre-filled from your decoded listing — review and adjust before generating.
        </div>
      )}

      <SolidCard>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-5">
          {/* Core details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Asking price (£)" error={errors.asking_price?.message}>
              <input
                {...register('asking_price', { valueAsNumber: true })}
                type="number" placeholder="e.g. 350000"
                className="glass-input"
              />
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
                type="number" placeholder="e.g. 8"
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
              <FormField label="Estimated repair cost (£)" hint="From your surveyor's report">
                <input
                  {...register('estimated_repair_cost', { valueAsNumber: true })}
                  type="number" placeholder="e.g. 15000"
                  className="glass-input"
                />
              </FormField>
            )}
          </div>

          {/* Optional context */}
          <FormField label="Seller's situation" hint="Optional — anything you know (e.g. relocating, already bought, motivated)">
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
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {(mutation.error as any)?.userMessage ?? 'Something went wrong. Please try again.'}
            </p>
          )}
        </form>
      </SolidCard>

      {result && (
        <div className="space-y-4 animate-results">

          {/* Hero — offer numbers */}
          <GlassCard>
            <div className="flex flex-wrap items-start gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-plum-soft uppercase tracking-wide mb-1">Recommended offer</p>
                <p className="font-display text-3xl md:text-4xl text-purple">{formatGBP(result.recommended_offer)}</p>
                <p className="text-xs text-plum-soft mt-0.5">
                  Range: {formatGBP(result.offer_range.low)} – {formatGBP(result.offer_range.high)}
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs font-medium text-plum-soft uppercase tracking-wide mb-1">Walk-away price</p>
                <p className="font-display text-xl text-plum">{formatGBP(result.walkaway_price)}</p>
                {saving > 0 && (
                  <p className="text-xs text-sage font-medium mt-0.5 flex items-center gap-1 justify-end">
                    <TrendingDown className="w-3 h-3" /> {formatGBP(saving)} below asking
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
            <p className="text-sm text-plum-soft leading-relaxed mt-2">{result.offer_rationale}</p>
          </GlassCard>

          {/* Leverage points */}
          {result.leverage_points.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-purple" />
                <h3 className="font-display text-lg text-plum">Your leverage points</h3>
              </div>
              <ul className="space-y-2">
                {result.leverage_points.map((pt, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum-soft">
                    <CheckCircle className="w-4 h-4 text-sage shrink-0 mt-0.5" />{pt}
                  </li>
                ))}
              </ul>
            </SolidCard>
          )}

          {/* Conditions */}
          {result.conditions_to_include.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <ListChecks className="w-4 h-4 text-purple" />
                <h3 className="font-display text-lg text-plum">Conditions to include</h3>
              </div>
              <ul className="space-y-2">
                {result.conditions_to_include.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum-soft">
                    <span className="w-5 h-5 rounded-full bg-purple-faint text-purple text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {c}
                  </li>
                ))}
              </ul>
            </SolidCard>
          )}

          {/* Opening script */}
          <GlassCard>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple" />
                <h3 className="font-display text-lg text-plum">Opening script</h3>
              </div>
              <button
                onClick={copyScript}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-lg transition-colors',
                  copied ? 'bg-sage-light text-sage font-medium' : 'btn-ghost py-1.5 px-3'
                )}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div className="bg-white/60 rounded-xl p-4 text-sm text-plum leading-relaxed whitespace-pre-wrap">
              {result.opening_script}
            </div>
          </GlassCard>

          {/* Likely counter */}
          <SolidCard>
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4 text-amber" />
              <h3 className="font-display text-base text-plum">What to expect next</h3>
            </div>
            <p className="text-sm text-plum-soft leading-relaxed">{result.likely_counter}</p>
          </SolidCard>

          {/* Tips */}
          {result.negotiation_tips.length > 0 && (
            <SolidCard>
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-purple" />
                <h3 className="font-display text-lg text-plum">Negotiation tips</h3>
              </div>
              <ul className="space-y-2">
                {result.negotiation_tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-sm text-plum-soft">
                    <PoundSterling className="w-4 h-4 text-purple shrink-0 mt-0.5" />{tip}
                  </li>
                ))}
              </ul>
            </SolidCard>
          )}

          <p className="text-xs text-plum-soft text-center opacity-60 pb-2">
            This is AI-generated guidance only, not financial advice. Always discuss offers with your estate agent or solicitor.
          </p>
        </div>
      )}
    </div>
  )
}
