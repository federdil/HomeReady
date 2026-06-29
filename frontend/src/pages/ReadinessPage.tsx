import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { calculateCosts } from '@/lib/api'
import { useMarkStage } from '@/lib/useMarkStage'
import type { CostCalculatorResult, CostBreakdownItem } from '@/types'
import { formatGBP, cn } from '@/lib/utils'
import { SolidCard, PageHeader, PrimaryButton, FormField, Callout } from '@/components/ui'
import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'

const schema = z.object({
  property_price: z.string().min(1, 'Required'),
  deposit_amount: z.string().min(1, 'Required'),
  postcode: z.string().min(3, 'Enter a valid UK postcode').max(8),
  is_first_time_buyer: z.boolean(),
})
type FormInput = z.infer<typeof schema>

const BAR_COLORS: Record<string, string> = {
  stamp:     'bg-warning',
  solicitor: 'bg-brand-mid',
  survey:    'bg-brand',
  mortgage:  'bg-brand/60',
  land:      'bg-success',
}

function barColor(label: string): string {
  const l = label.toLowerCase()
  for (const [key, cls] of Object.entries(BAR_COLORS)) {
    if (l.includes(key)) return cls
  }
  return 'bg-surface-3'
}

function ltvBand(ltv: number): { color: string; label: string; icon: React.ReactNode } {
  if (ltv <= 75) return { color: 'text-success', label: 'Best mortgage rates available', icon: <TrendingUp className="w-4 h-4" /> }
  if (ltv <= 85) return { color: 'text-warning',  label: 'Good rates available',          icon: <TrendingUp className="w-4 h-4" /> }
  return              { color: 'text-danger',  label: 'Higher rate tier — consider saving more', icon: <TrendingDown className="w-4 h-4" /> }
}

function BreakdownRow({ item, max }: { item: CostBreakdownItem; max: number }) {
  const pct = Math.max(3, Math.round((item.amount / max) * 100))
  return (
    <div className="py-3.5 border-b border-border last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div className="min-w-0 mr-4">
          <span className="text-sm font-semibold text-ink">{item.label}</span>
          {item.note && <span className="ml-2 text-xs text-ink-faint">{item.note}</span>}
        </div>
        <span className="text-sm font-bold text-ink shrink-0 tabular-nums">{formatGBP(item.amount)}</span>
      </div>
      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', barColor(item.label))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function ReadinessPage() {
  const [result, setResult] = useState<CostCalculatorResult | null>(null)
  const markStage = useMarkStage()

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: { is_first_time_buyer: true },
  })

  const mutation = useMutation({
    mutationFn: (data: FormInput) => calculateCosts({
      property_price: parseFloat(data.property_price.replace(/[^0-9.]/g, '')),
      deposit_amount: parseFloat(data.deposit_amount.replace(/[^0-9.]/g, '')),
      postcode: data.postcode.trim().toUpperCase(),
      is_first_time_buyer: data.is_first_time_buyer,
    }),
    onSuccess: (data) => { setResult(data); markStage('readiness', 'complete') },
    onError: (err) => console.error('Cost calc error:', err),
  })

  const priceVal   = parseFloat((watch('property_price') ?? '0').replace(/[^0-9.]/g, '')) || 0
  const depositVal = parseFloat((watch('deposit_amount') ?? '0').replace(/[^0-9.]/g, '')) || 0
  const ltv = priceVal > 0 && depositVal > 0 ? Math.round(((priceVal - depositVal) / priceVal) * 100) : null
  const maxItem = result ? Math.max(...result.breakdown.map(b => b.amount)) : 1
  const ltvInfo = ltv !== null ? ltvBand(ltv) : null

  return (
    <div className="space-y-8">
      <PageHeader
        stage="Stage 1 — Financial Readiness"
        title="Cost Calculator"
        description="See the true total cost of buying — beyond the asking price. Includes Stamp Duty, legal fees, surveys, and every other expense first-time buyers are often surprised by."
      />

      {/* Input form */}
      <SolidCard>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <FormField label="Property asking price" error={errors.property_price?.message}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-semibold">£</span>
                <input
                  {...register('property_price')}
                  type="text"
                  inputMode="numeric"
                  placeholder="350,000"
                  className="glass-input pl-7"
                />
              </div>
            </FormField>

            <FormField
              label="Your deposit"
              error={errors.deposit_amount?.message}
            >
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm font-semibold">£</span>
                <input
                  {...register('deposit_amount')}
                  type="text"
                  inputMode="numeric"
                  placeholder="35,000"
                  className="glass-input pl-7"
                />
              </div>
              {ltv !== null && ltvInfo && (
                <div className={cn('mt-2 flex items-center gap-1.5 text-xs font-semibold', ltvInfo.color)}>
                  {ltvInfo.icon}
                  <span>{ltv}% LTV — {ltvInfo.label}</span>
                </div>
              )}
            </FormField>

            <FormField label="Property postcode" error={errors.postcode?.message}>
              <input
                {...register('postcode')}
                type="text"
                placeholder="SW1A 1AA"
                className="glass-input uppercase"
              />
            </FormField>

            <FormField label="Buyer status">
              <label className="flex items-center gap-3 cursor-pointer select-none mt-1 p-3 rounded-xl border border-border hover:bg-surface-2 transition-colors">
                <div className="relative shrink-0">
                  <input {...register('is_first_time_buyer')} type="checkbox" className="sr-only peer" />
                  <div className="w-10 h-5 rounded-full bg-border peer-checked:bg-brand transition-colors duration-200" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">First-time buyer</p>
                  <p className="text-xs text-ink-muted">SDLT relief up to £425,000</p>
                </div>
              </label>
            </FormField>
          </div>

          <div className="pt-1">
            <PrimaryButton type="submit" loading={mutation.isPending} className="w-full sm:w-auto">
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Calculating…
                </>
              ) : 'Calculate total cost'}
            </PrimaryButton>
          </div>

          {mutation.isError && (
            <Callout variant="danger">
              Something went wrong. Please check your inputs and try again.
            </Callout>
          )}
        </form>
      </SolidCard>

      {/* Results */}
      {result && (
        <div className="space-y-5 animate-results">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
            <div className="stat-card animate-in">
              <p className="stat-card-label">Property price</p>
              <p className="stat-card-value">{formatGBP(result.property_price)}</p>
            </div>
            <div className="stat-card animate-in">
              <p className="stat-card-label">Stamp Duty</p>
              <p className="stat-card-value">{formatGBP(result.stamp_duty)}</p>
              {result.stamp_duty === 0 && (
                <p className="stat-card-sub text-success font-medium">First-time buyer relief</p>
              )}
            </div>
            <div className="stat-card animate-in">
              <p className="stat-card-label">Additional fees</p>
              <p className="stat-card-value">{formatGBP(result.total_cost - result.property_price)}</p>
              <p className="stat-card-sub">Legal, survey & more</p>
            </div>
            <div className="stat-card animate-in" style={{ background: 'linear-gradient(135deg, #EDE9F8 0%, #F5F3FF 100%)', borderColor: 'rgba(91,61,174,0.20)' }}>
              <p className="stat-card-label" style={{ color: '#7B55C8' }}>Total you need</p>
              <p className="stat-card-value text-brand">{formatGBP(result.total_cost)}</p>
            </div>
          </div>

          {/* Breakdown */}
          <SolidCard>
            <h3 className="font-display text-lg text-ink mb-1">Full cost breakdown</h3>
            <p className="text-sm text-ink-muted mb-5">Every cost you'll need to budget for</p>
            {result.breakdown.map((item, i) => (
              <BreakdownRow key={i} item={item} max={maxItem} />
            ))}
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-muted">Total fees (excl. property)</span>
              <span className="font-display text-xl text-ink">{formatGBP(result.total_cost - result.property_price)}</span>
            </div>
          </SolidCard>

          {/* Advice */}
          <Callout variant="info" title="HomeReady advice">
            {result.advice}
          </Callout>

          {/* LTV advice */}
          {ltv !== null && (
            <Callout variant={ltv <= 85 ? 'success' : 'warning'} title={ltv <= 85 ? 'Your deposit is solid' : 'Consider saving a larger deposit'}>
              {ltv <= 75
                ? 'At 75% LTV or below you qualify for the best mortgage rates on the market.'
                : ltv <= 85
                ? `At ${ltv}% LTV you have access to a wide range of competitive mortgage deals.`
                : `At ${ltv}% LTV your options are more limited. Saving an extra 5% deposit could meaningfully reduce your monthly payments.`}
            </Callout>
          )}
        </div>
      )}
    </div>
  )
}
