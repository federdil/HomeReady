import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { calculateCosts } from '@/lib/api'
import type { CostCalculatorResult, CostBreakdownItem } from '@/types'
import { formatGBP, cn } from '@/lib/utils'
import { SolidCard, PageHeader, PrimaryButton, FormField } from '@/components/ui'
import { AlertTriangle, CheckCircle, Info } from 'lucide-react'

const schema = z.object({
  property_price: z.string().min(1, 'Required'),
  deposit_amount: z.string().min(1, 'Required'),
  postcode: z.string().min(3, 'Enter a valid UK postcode').max(8),
  is_first_time_buyer: z.boolean(),
})
type FormInput = z.infer<typeof schema>

function barColor(label: string) {
  const l = label.toLowerCase()
  if (l.includes('stamp'))   return 'bg-amber'
  if (l.includes('solicitor')) return 'bg-purple-mid'
  if (l.includes('survey'))  return 'bg-purple'
  if (l.includes('mortgage')) return 'bg-purple-soft'
  if (l.includes('land'))    return 'bg-sage'
  return 'bg-dusk-deep'
}

function ltvColor(ltv: number) {
  if (ltv <= 75) return 'text-sage'
  if (ltv <= 85) return 'text-amber'
  return 'text-red-500'
}

function BreakdownRow({ item, max }: { item: CostBreakdownItem; max: number }) {
  const pct = Math.max(2, Math.round((item.amount / max) * 100))
  return (
    <div className="py-3 border-b border-white/40 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="min-w-0 mr-4">
          <span className="text-sm font-medium text-plum">{item.label}</span>
          {item.note && <span className="ml-2 text-xs text-plum-soft">{item.note}</span>}
        </div>
        <span className="text-sm font-semibold text-plum shrink-0">{formatGBP(item.amount)}</span>
      </div>
      <div className="h-1 bg-dusk rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', barColor(item.label))} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass-card px-4 py-4">
      <p className="text-xs text-plum-soft uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="font-display text-2xl text-plum">{value}</p>
      {sub && <p className="text-xs text-plum-soft mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ReadinessPage() {
  const [result, setResult] = useState<CostCalculatorResult | null>(null)

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
    onSuccess: setResult,
    onError: (err) => console.error('Cost calc error:', err),
  })

  const priceVal   = parseFloat((watch('property_price') ?? '0').replace(/[^0-9.]/g, '')) || 0
  const depositVal = parseFloat((watch('deposit_amount') ?? '0').replace(/[^0-9.]/g, '')) || 0
  const ltv = priceVal > 0 && depositVal > 0 ? Math.round(((priceVal - depositVal) / priceVal) * 100) : null
  const maxItem = result ? Math.max(...result.breakdown.map(b => b.amount)) : 1

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 1 — Financial Readiness"
        title="Cost Calculator"
        description="See the true total cost of buying — beyond the asking price. Includes Stamp Duty, legal fees, surveys, and every other expense first-time buyers are often surprised by."
      />

      {/* Form */}
      <SolidCard>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <FormField label="Property asking price" error={errors.property_price?.message}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-plum-soft text-sm font-medium">£</span>
                <input {...register('property_price')} type="text" inputMode="numeric"
                  placeholder="350,000"
                  className="glass-input pl-7" />
              </div>
            </FormField>

            <FormField
              label="Your deposit"
              error={errors.deposit_amount?.message}
              hint={ltv !== null ? undefined : undefined}
            >
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-plum-soft text-sm font-medium">£</span>
                <input {...register('deposit_amount')} type="text" inputMode="numeric"
                  placeholder="35,000"
                  className="glass-input pl-7" />
              </div>
              {ltv !== null && (
                <p className={cn('mt-1 text-xs font-medium', ltvColor(ltv))}>
                  {ltv}% LTV · {ltv <= 75 ? 'Best mortgage rates' : ltv <= 85 ? 'Good rates available' : 'Higher rate tier'}
                </p>
              )}
            </FormField>

            <FormField label="Property postcode" error={errors.postcode?.message}>
              <input {...register('postcode')} type="text" placeholder="SW1A 1AA"
                className="glass-input uppercase" />
            </FormField>

            <FormField label="Buyer status">
              <label className="flex items-center gap-3 cursor-pointer select-none mt-1">
                <div className="relative">
                  <input {...register('is_first_time_buyer')} type="checkbox" className="sr-only peer" />
                  <div className="w-10 h-5 rounded-full bg-dusk-deep peer-checked:bg-purple transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-plum">First-time buyer</p>
                  <p className="text-xs text-plum-soft">SDLT relief up to £425k</p>
                </div>
              </label>
            </FormField>
          </div>

          <PrimaryButton type="submit" loading={mutation.isPending}>
            {mutation.isPending ? 'Calculating…' : 'Calculate total cost'}
          </PrimaryButton>

          {mutation.isError && (
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Something went wrong. Please try again.
            </p>
          )}
        </form>
      </SolidCard>

      {/* Results */}
      {result && (
        <div className="space-y-5 animate-results">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Property price" value={formatGBP(result.property_price)} />
            <StatCard label="Stamp Duty" value={formatGBP(result.stamp_duty)} sub={result.stamp_duty === 0 ? 'First-time buyer relief' : undefined} />
            <StatCard label="Additional fees" value={formatGBP(result.total_cost - result.property_price)} sub="Legal, survey & more" />
            <StatCard label="Total you need" value={formatGBP(result.total_cost)} />
          </div>

          <SolidCard>
            <h3 className="font-display text-lg text-plum mb-4">Full cost breakdown</h3>
            {result.breakdown.map((item, i) => <BreakdownRow key={i} item={item} max={maxItem} />)}
            <div className="mt-4 pt-4 border-t border-white/40 flex justify-between">
              <span className="text-sm font-medium text-plum">Total fees (excl. property)</span>
              <span className="font-display text-lg text-plum">{formatGBP(result.total_cost - result.property_price)}</span>
            </div>
          </SolidCard>

          <div className="glass-card px-5 py-4 flex gap-3">
            <Info className="w-4 h-4 text-purple shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-plum mb-1">HomeReady advice</p>
              <p className="text-sm text-plum-soft leading-relaxed">{result.advice}</p>
            </div>
          </div>

          {ltv !== null && (
            <div className={cn('solid-card px-5 py-4 flex gap-3', ltv <= 85 ? 'border-sage/30' : 'border-amber/30')}>
              {ltv <= 85
                ? <CheckCircle className="w-4 h-4 text-sage shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" />}
              <div>
                <p className={cn('text-sm font-medium mb-0.5', ltv <= 85 ? 'text-sage' : 'text-amber')}>
                  {ltv <= 85 ? 'Your deposit is solid' : 'Consider saving a larger deposit'}
                </p>
                <p className="text-sm text-plum-soft">
                  {ltv <= 75
                    ? 'At 75% LTV or below you qualify for the best mortgage rates on the market.'
                    : ltv <= 85
                    ? `At ${ltv}% LTV you have access to a wide range of competitive mortgage deals.`
                    : `At ${ltv}% LTV your options are more limited. Saving an extra 5% deposit could meaningfully reduce your monthly payments.`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
