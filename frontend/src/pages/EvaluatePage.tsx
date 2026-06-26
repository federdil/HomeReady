import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { decodeListing } from '@/lib/api'
import type { ListingDecoderResult } from '@/types'
import { cn } from '@/lib/utils'
import { SolidCard, GlassCard, PageHeader, PrimaryButton, FormField, RiskBadge } from '@/components/ui'
import { AlertTriangle, CheckCircle, HelpCircle, Eye, Home, Info, Loader2 } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const schema = z.object({
  listing_text: z.string().min(50, 'Please paste the full listing text (at least 50 characters)'),
  property_type: z.string().optional(),
})
type FormData = z.infer<typeof schema>

function TrustRing({ score }: { score: number }) {
  const color = score >= 70 ? '#22A05A' : score >= 45 ? '#D97706' : '#DC2626'
  const label = score >= 70 ? 'Reasonably transparent' : score >= 45 ? 'Some concerns' : 'Significant red flags'
  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 120 120" className="w-28 h-28">
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

function severityToRiskLevel(s: string): 'low' | 'amber' | 'red' {
  if (s === 'low') return 'low'
  if (s === 'high') return 'red'
  return 'amber'
}

export default function EvaluatePage() {
  const [result, setResult] = useState<ListingDecoderResult | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: decodeListing,
    onSuccess: setResult,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 2 — Property Evaluation"
        title="Listing Decoder"
        description="Paste any estate agent listing. HomeReady decodes the language, flags risks, and tells you what questions to ask at the viewing."
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

      {/* Form */}
      <SolidCard>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
          <FormField label="Paste the listing text" error={errors.listing_text?.message}>
            <textarea {...register('listing_text')} rows={8}
              placeholder="Paste the full listing description here — the longer the better. Include any details about the property, area, tenure, service charges, etc."
              className="glass-input resize-none" />
          </FormField>

          <div className="flex gap-4 items-end">
            <FormField label="Property type (optional)">
              <select {...register('property_type')} className="glass-input">
                <option value="">Select…</option>
                <option value="flat">Flat / Apartment</option>
                <option value="house">House</option>
                <option value="maisonette">Maisonette</option>
                <option value="studio">Studio</option>
              </select>
            </FormField>
            <PrimaryButton type="submit" loading={mutation.isPending} className="mb-0 self-end">
              {mutation.isPending ? 'Decoding…' : 'Decode listing'}
            </PrimaryButton>
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Something went wrong. Please try again.
            </p>
          )}
        </form>
      </SolidCard>

      {result && (
        <div className="space-y-4 animate-results">

          {/* Trust score + summary */}
          <SolidCard className="flex flex-col md:flex-row gap-6 items-center">
            <TrustRing score={result.trust_score} />
            <div className="flex-1">
              <h2 className="font-display text-xl text-plum mb-2">The honest picture</h2>
              <p className="text-sm text-plum-soft leading-relaxed">{result.summary}</p>
            </div>
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
        </div>
      )}
    </div>
  )
}
