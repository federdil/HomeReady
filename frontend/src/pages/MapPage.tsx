import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  AlertCircle, Clock, ExternalLink, Info, Loader2, Plus, Quote, Ruler,
  Sliders, Wallet, X,
} from 'lucide-react'

import {
  assessProperty, generatePropertySummary, getPersona, getPersonaPresets,
  listAssessedProperties,
} from '@/lib/api'
import { computeFit, fitColour, fitLabel, standouts } from '@/lib/fit'
import { PrimaryButton, Callout } from '@/components/ui'
import { useScoreHelp } from '@/components/ScoreHelp'
import type {
  AssessedProperty, DimensionKey, DimensionMeta, DimensionScore, Persona,
} from '@/types'

const LONDON: [number, number] = [51.5074, -0.1278]

const money = (n?: number | null) =>
  n == null ? '—' : `£${Math.round(n).toLocaleString('en-GB')}`

// divIcon rather than Leaflet's default PNG markers: no external image to load,
// and the pin itself can carry the score.
function propertyPin(score: number | null, selected: boolean, active = true) {
  const colour = fitColour(score)
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${selected ? 40 : 32}px;height:${selected ? 40 : 32}px;
      background:${colour};color:#fff;border-radius:50% 50% 50% 4px;
      transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
      border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);
      opacity:${active ? 1 : 0.45};
      font:600 ${selected ? 13 : 11}px/1 ui-sans-serif,system-ui;">
      <span style="transform:rotate(45deg)">${score ?? '?'}</span></div>`,
    iconSize: [selected ? 40 : 32, selected ? 40 : 32],
    iconAnchor: [selected ? 20 : 16, selected ? 38 : 30],
  })
}

const workplacePin = L.divIcon({
  className: '',
  html: `<div style="
    width:28px;height:28px;background:#2A1620;color:#fff;border-radius:8px;
    display:flex;align-items:center;justify-content:center;
    border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.5" stroke-linecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
})

// Deliberately a different shape as well as a different colour from the
// workplace marker: these are two kinds of place with two different meanings,
// and colour alone is not a channel everyone can read.
const preferredAreaPin = L.divIcon({
  className: '',
  html: `<div style="
    width:24px;height:24px;background:#FBE9F0;color:#9C2F62;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    border:2px solid #9C2F62;box-shadow:0 1px 5px rgba(0,0,0,.25);">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="3" stroke-linecap="round"><path d="M12 21s-7-5.5-7-10a7 7 0 0 1 14 0c0 4.5-7 10-7 10z"/>
      </svg></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

/** Keeps every pin in view as properties are added. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 14)
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 15 })
  }, [map, points])
  return null
}

/**
 * A property past the buyer's stated ceiling.
 *
 * It already caps the value score, but the score is one number among six and
 * this is the constraint that decides whether they can buy at all — so it is
 * also said, in pounds, wherever the property appears.
 */
function OverBudgetBadge({ price, ceiling }: { price: number; ceiling: number }) {
  const over = price - ceiling
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-danger-bg text-danger"
      title={`£${ceiling.toLocaleString('en-GB')} is the most you said you could spend`}
    >
      £{Math.round(over).toLocaleString('en-GB')} over budget
    </span>
  )
}

/** Null unless there is a stated ceiling and the price is past it. */
function overBudgetBy(
  price: number | null | undefined,
  ceiling: number | null | undefined,
): number | null {
  if (!price || !ceiling) return null
  return price > ceiling ? price - ceiling : null
}

/**
 * The handful of figures a buyer compares properties on, pulled out of the
 * enrichment payload.
 *
 * The dimension scores answer "how does this rate for me"; these answer "what
 * is it, actually". Both matter and they are not substitutes — a Safety of 44
 * is only meaningful next to the 403 crimes it came from, and £4,720 a year in
 * running costs is a fact you can act on in a way that "Value 88" is not.
 *
 * A fact we do not have is omitted rather than shown as a dash, so the strip
 * never implies we looked and found nothing.
 */
interface KeyFact {
  label: string
  value: string
  title?: string
}

function keyFacts(property: AssessedProperty): KeyFact[] {
  const e = property.enrichment ?? {}
  const facts: KeyFact[] = []

  const costs = e.running_costs?.status === 'ok' ? e.running_costs.value : null
  if (costs?.price_per_sqft) {
    facts.push({
      label: 'Price',
      value: `£${costs.price_per_sqft.toLocaleString('en-GB')}/sq ft`,
      title: costs.floor_area_sqft
        ? `${costs.floor_area_sqft.toLocaleString('en-GB')} sq ft`
        : undefined,
    })
  }
  if (costs?.total_annual) {
    facts.push({
      label: 'To run',
      value: `£${Math.round(costs.total_annual).toLocaleString('en-GB')}/yr`,
      title: costs.lines
        .map(l => `${l.label} £${Math.round(l.annual).toLocaleString('en-GB')}`)
        .join(' · '),
    })
  }
  if (costs?.council_tax_band) {
    facts.push({ label: 'Council tax', value: `Band ${costs.council_tax_band}` })
  }

  // The worst journey, matching what the commute score is derived from.
  const journeys = (e.commutes ?? []).filter(c => c.value)
  if (journeys.length) {
    const worst = journeys.reduce((a, b) =>
      (b.value!.minutes > a.value!.minutes ? b : a))
    facts.push({
      label: 'Commute',
      value: `${worst.value!.minutes} min`,
      title: `To ${worst.label}${journeys.length > 1 ? ', your longest journey' : ''}`,
    })
  }

  const crime = e.crime?.status === 'ok' ? e.crime.value : null
  if (crime) {
    facts.push({
      label: 'Crime',
      value: `${crime.total.toLocaleString('en-GB')}/mo`,
      title: `Recorded within ${crime.radius_m ?? 800} m in the month of ${crime.month}`,
    })
  }

  const comps = e.comparables?.status === 'ok' ? e.comparables.value : null
  if (comps?.median_price) {
    facts.push({
      label: 'Sold nearby',
      value: `£${Math.round(comps.median_price / 1000)}k`,
      title: `Median of ${comps.sales.length} recent sales in this postcode`,
    })
  }

  return facts
}

function FactStrip({ facts }: { facts: KeyFact[] }) {
  if (!facts.length) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {facts.map(fact => (
        <span key={fact.label} className="text-[11px] whitespace-nowrap" title={fact.title}>
          <span className="text-ink-faint">{fact.label} </span>
          <span className="font-semibold text-ink tabular-nums">{fact.value}</span>
        </span>
      ))}
    </div>
  )
}

/** The one-line case for and against, from the dimensions this buyer weights. */
function WhyYesWhyNot({ dimensions, weights }: {
  dimensions: DimensionScore[]
  weights: Record<DimensionKey, number>
}) {
  const { best, worst, unknown } = standouts(dimensions, weights)

  if (!best && !worst && !unknown.length) {
    return (
      <p className="text-[11px] text-ink-faint">
        Nothing stands out either way on the things you said matter.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {best && (
        <p className="text-[11px] leading-snug">
          <span className="font-semibold text-fit-strong">Why yes · </span>
          <span className="text-ink">{best.label} {best.score}</span>
          <span className="text-ink-muted"> — {best.detail}</span>
        </p>
      )}
      {worst && (
        <p className="text-[11px] leading-snug">
          <span className="font-semibold text-fit-poor">Why not · </span>
          <span className="text-ink">{worst.label} {worst.score}</span>
          <span className="text-ink-muted"> — {worst.detail}</span>
        </p>
      )}
      {unknown.length > 0 && (
        <p className="text-[11px] leading-snug text-ink-faint">
          <span className="font-semibold">Not known · </span>
          {unknown.map(d => d.label).join(', ')} — the score rests on the rest.
        </p>
      )}
    </div>
  )
}

function GoneBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-surface-3 text-ink-muted"
      title="Rightmove no longer lists this property — it has been sold, let, or withdrawn"
    >
      No longer listed
    </span>
  )
}

function ScoreChip({ score, coverage }: { score: number | null; coverage: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center justify-center min-w-[34px] h-[22px] px-1.5 rounded-md text-xs font-bold text-white tabular-nums"
        style={{ background: fitColour(score) }}
      >
        {score ?? '—'}
      </span>
      {coverage < 100 && (
        <span className="text-[10px] text-ink-faint">{coverage}% of priorities</span>
      )}
    </span>
  )
}

function DimensionBar({ dim, meta }: {
  dim: DimensionScore
  meta?: DimensionMeta
}) {
  const { trigger, panel } = useScoreHelp({
    label: dim.label,
    method: meta?.method,
    source: meta?.source,
    score: dim.score,
    evidence: dim.detail,
    unavailableReason: dim.unavailable_reason,
  })

  if (dim.weight === 0) return null

  if (dim.score === null) {
    return (
      <div className="flex flex-col gap-1 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium text-ink-muted">{dim.label}</span>
            {trigger}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-ink-faint font-semibold">
            No data
          </span>
        </div>
        <p className="text-[11px] text-ink-faint leading-snug">{dim.unavailable_reason}</p>
        {panel}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-ink">{dim.label}</span>
          {trigger}
        </span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: fitColour(dim.score) }}>
          {dim.score}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${dim.score}%`, background: fitColour(dim.score) }}
        />
      </div>
      {dim.detail && <p className="text-[11px] text-ink-faint leading-snug">{dim.detail}</p>}
      {panel}
    </div>
  )
}

function RunningCosts({ enrichment }: { enrichment: AssessedProperty['enrichment'] }) {
  const signal = enrichment?.running_costs
  const costs = signal?.status === 'ok' ? signal.value : null

  if (!costs) {
    return (
      <div className="rounded-xl bg-surface-2 border border-border px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Wallet className="w-3.5 h-3.5 text-ink-faint" />
          <p className="section-label">Annual running costs</p>
        </div>
        <p className="text-xs text-ink-muted leading-relaxed">
          {signal?.reason ?? 'Not stated on this listing.'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-surface-2 border border-border px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5 text-brand" />
          <p className="section-label">Annual running costs</p>
        </div>
        <span className="text-right">
          <span className="block font-display text-lg text-ink leading-none tabular-nums">
            £{costs.total_annual.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
            <span className="text-xs text-ink-muted font-sans"> /yr</span>
          </span>
          <span className="text-[11px] text-ink-faint tabular-nums">
            £{costs.monthly.toLocaleString('en-GB', { maximumFractionDigits: 0 })} a month
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {costs.lines.map(line => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-ink-muted flex items-center gap-1.5">
              {line.label}
              {line.is_estimate && (
                <span
                  className="text-[9px] uppercase tracking-wide text-ink-faint border border-border rounded px-1 py-px"
                  title={line.basis}
                >
                  est
                </span>
              )}
            </span>
            <span className="font-semibold text-ink tabular-nums">
              £{line.annual.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
      </div>

      {(costs.floor_area_sqft || costs.price_per_sqft) && (
        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border text-[11px] text-ink-muted">
          <Ruler className="w-3 h-3 flex-shrink-0" />
          {costs.floor_area_sqft && <span>{costs.floor_area_sqft.toLocaleString('en-GB')} sq ft</span>}
          {costs.price_per_sqft && (
            <span className="font-semibold text-ink">
              £{costs.price_per_sqft.toLocaleString('en-GB')}/sq ft
            </span>
          )}
        </div>
      )}

      <p className="text-[10px] text-ink-faint mt-2 leading-snug">
        Service charge and ground rent are taken from the listing. Council tax is
        estimated from the band — your borough sets the exact bill.
      </p>
    </div>
  )
}

function ValueSummary({ property }: { property: AssessedProperty }) {
  const queryClient = useQueryClient()
  const existing = property.enrichment?.value_summary

  const generate = useMutation({
    mutationFn: () => generatePropertySummary(property.id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assessed-properties'] }),
  })

  // Written on open rather than on assess: enrichment returns in ~2s and the
  // pin should appear then, not after a model call four times longer.
  useEffect(() => {
    if (!existing && property.id && !generate.isPending && !generate.isError) {
      generate.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, existing])

  if (!existing && generate.isError) return null

  return (
    <div className="rounded-xl bg-brand-light/40 border border-brand/20 px-4 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <Quote className="w-3.5 h-3.5 text-brand" />
        <p className="section-label">The verdict</p>
      </div>
      {existing ? (
        <p className="text-sm text-ink leading-relaxed">{existing}</p>
      ) : (
        <div className="flex items-center gap-2 text-xs text-ink-muted py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
          Weighing this one up against your priorities…
        </div>
      )}
    </div>
  )
}

function PropertyDetail({ property, weights, meta, priceCeiling, onClose }: {
  property: AssessedProperty
  weights: Record<DimensionKey, number>
  meta: DimensionMeta[]
  priceCeiling?: number | null
  onClose: () => void
}) {
  const metaByKey = Object.fromEntries(meta.map(m => [m.key, m])) as
    Record<DimensionKey, DimensionMeta>
  const dims = property.enrichment?.fit?.dimensions ?? []
  const { score, coverage } = computeFit(dims, weights)
  const commutes = property.enrichment?.commutes ?? []
  const stations = property.enrichment?.stations
  const comps = property.enrichment?.comparables

  return (
    <div className="card px-5 py-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <ScoreChip score={score} coverage={coverage} />
            <span className="text-xs font-medium text-ink-muted">{fitLabel(score)}</span>
            {overBudgetBy(property.price, priceCeiling) !== null && (
              <OverBudgetBadge price={property.price!} ceiling={priceCeiling!} />
            )}
            {!property.is_active && <GoneBadge />}
          </div>
          <h2 className="font-display text-lg text-ink leading-snug truncate">
            {property.address ?? property.postcode}
          </h2>
          <p className="text-sm text-ink-muted">
            {money(property.price)}
            {property.bedrooms ? ` · ${property.bedrooms} bed` : ''}
            {property.postcode ? ` · ${property.postcode}` : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close property details"
          className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ValueSummary property={property} />

      <RunningCosts enrichment={property.enrichment} />

      {commutes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="section-label">Getting to work</p>
          {commutes.map(c => (
            <div key={c.label} className="flex items-center gap-2 text-sm">
              <Clock className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
              <span className="text-ink-muted flex-1 truncate">{c.label}</span>
              {c.value ? (
                <span className="font-semibold text-ink tabular-nums">
                  {c.value.minutes} min
                  <span className="font-normal text-ink-faint"> · {c.value.summary}</span>
                </span>
              ) : (
                <span className="text-xs text-ink-faint">{c.reason}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border pt-1">
        <p className="section-label mb-1">How it scores for you</p>
        <p className="text-[11px] text-ink-faint mb-1.5 leading-snug">
          Every number has a rule behind it &mdash; tap the ? to see how it was
          worked out and why this property got it.
        </p>
        {dims.map(d => (
          <DimensionBar key={d.key} dim={d} meta={metaByKey[d.key]} />
        ))}
      </div>

      {(stations?.value?.length || comps?.value?.sales?.length) && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          {stations?.value?.length ? (
            <p className="text-xs text-ink-muted">
              <span className="font-semibold text-ink">Nearest stations · </span>
              {stations.value.slice(0, 3).map(s => `${s.name} (${s.distance_m}m)`).join(', ')}
            </p>
          ) : null}
          {comps?.value?.sales?.length ? (
            <p className="text-xs text-ink-muted">
              <span className="font-semibold text-ink">Recently sold nearby · </span>
              {comps.value.sales.slice(0, 3).map(s => `${money(s.price)} (${s.date})`).join(', ')}
            </p>
          ) : null}
        </div>
      )}

      {property.rightmove_url && (
        <a
          href={property.rightmove_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
        >
          View the original listing <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  )
}

export default function MapPage() {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  // Selection lives in the URL so a property can be linked to or shared.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('property')
  const setSelectedId = (id: string | null) => {
    setSearchParams(id ? { property: id } : {}, { replace: true })
  }
  const [showWeights, setShowWeights] = useState(false)
  const [localWeights, setLocalWeights] = useState<Record<DimensionKey, number> | null>(null)

  const { data: persona } = useQuery({ queryKey: ['persona'], queryFn: getPersona })
  const { data: presetData } = useQuery({ queryKey: ['persona-presets'], queryFn: getPersonaPresets })
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['assessed-properties'],
    queryFn: listAssessedProperties,
  })

  const weights = localWeights ?? (persona?.weights as Record<DimensionKey, number>) ?? {
    commute: 60, safety: 60, schools: 40, value: 60, space: 50,
  }

  const add = useMutation({
    mutationFn: (link: string) => assessProperty(link),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['assessed-properties'] })
      setUrl('')
      if (result.id) setSelectedId(result.id)
    },
  })

  const ranked = useMemo(() => {
    return [...properties]
      .map(p => ({ p, ...computeFit(p.enrichment?.fit?.dimensions, weights) }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  }, [properties, weights])

  const pinned = ranked.filter(r => r.p.latitude != null && r.p.longitude != null)
  const selected = properties.find(p => p.id === selectedId) ?? null

  const points: [number, number][] = [
    ...pinned.map(r => [r.p.latitude!, r.p.longitude!] as [number, number]),
    ...(persona?.workplaces ?? []).map(w => [w.latitude, w.longitude] as [number, number]),
    ...(persona?.preferred_areas ?? []).map(a => [a.latitude, a.longitude] as [number, number]),
  ]

  const selectedLine: [number, number][] | null =
    selected?.latitude != null && persona?.workplaces?.length
      ? [[selected.latitude, selected.longitude!], [persona.workplaces[0].latitude, persona.workplaces[0].longitude]]
      : null

  if (!persona) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-light text-brand flex items-center justify-center mx-auto mb-5">
          <Sliders className="w-6 h-6" />
        </div>
        <h1 className="font-display text-2xl text-ink mb-2">Set up your profile first</h1>
        <p className="text-base text-ink-muted mb-6 leading-relaxed">
          The properties you paste in are scored against what you care about, so
          we need to know that before any of this means anything.
        </p>
        <Link to="/persona"><PrimaryButton>Set up scoring</PrimaryButton></Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* Not "Your search" — nothing here was searched for. Every one of
              these is a listing the buyer found and chose to add, and calling
              it a search invited people to wait for results we never produce. */}
          <h1 className="font-display text-2xl text-ink">Your shortlist</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            Scored for <span className="font-semibold text-ink">{persona.label}</span>
            {persona.workplaces.length > 0 &&
              ` · ${persona.workplaces.map(w => w.label).join(', ')}`}
            {persona.preferred_areas.length > 0 && (
              <> &middot; looking in{' '}
                <span className="font-semibold text-ink">
                  {persona.preferred_areas.map(a => a.label).join(', ')}
                </span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowWeights(v => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-ink px-3 py-2 rounded-lg border border-border hover:bg-surface-2 transition-colors"
        >
          <Sliders className="w-3.5 h-3.5" />
          {showWeights ? 'Hide priorities' : 'Adjust priorities'}
        </button>
      </header>

      {/* Paste a link */}
      <div className="card px-4 py-3.5">
        <p className="text-xs text-ink-muted mb-2 leading-relaxed">
          Found something on Rightmove? Paste the link and it&rsquo;s scored
          against your profile in a couple of seconds. Add as many as you like
          &mdash; the point is the comparison.
        </p>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Paste a Rightmove property link"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && url.trim()) add.mutate(url.trim()) }}
          />
          <PrimaryButton onClick={() => add.mutate(url.trim())} disabled={add.isPending || !url.trim()}>
            {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </PrimaryButton>
        </div>
        {add.isError && (
          <p className="text-xs text-danger mt-2">
            {(add.error as { userMessage?: string })?.userMessage ??
              'Couldn’t read that listing. Check the link and try again.'}
          </p>
        )}
      </div>

      {showWeights && (
        <div className="card px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="section-label">Priorities</p>
            <button
              onClick={() => setLocalWeights(null)}
              className="text-xs text-ink-faint hover:text-ink"
            >
              Reset to saved
            </button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(presetData?.dimensions ?? []).map(dim => (
              <label key={dim.key} className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-ink">{dim.label}</span>
                  <span className="font-semibold text-brand tabular-nums">
                    {weights[dim.key] ?? 0}
                  </span>
                </span>
                <input
                  type="range" min={0} max={100} step={5}
                  value={weights[dim.key] ?? 0}
                  aria-label={dim.label}
                  onChange={e => setLocalWeights({
                    ...weights, [dim.key]: Number(e.target.value),
                  })}
                  className="w-full accent-brand cursor-pointer"
                />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-ink-faint mt-3">
            Changes here re-rank immediately without saving. Edit your{' '}
            <Link to="/persona" className="text-brand hover:underline">profile</Link> to keep them.
          </p>
        </div>
      )}

      {/* Map + ranked list */}
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <div
          className="card overflow-hidden map-tinted"
          style={{ height: 'clamp(340px, 52vh, 560px)' }}
        >
          <MapContainer
            center={LONDON}
            zoom={11}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
          >
            {/* CARTO Voyager, split into geography and labels and served as two
                layers so each can be treated differently — the ground gets the
                bramble tint, the place names stay neutral and legible. See
                index.css for what the filters do and why.

                Voyager rather than Positron: Positron is so light that there is
                almost no ink in it to work with, and a tint over it produced a
                map with no discernible roads or river. Voyager has the tonal
                range to survive being pushed.

                Both attributions are required by CARTO's terms. */}
            <TileLayer
              className="map-base-tinted"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
            <TileLayer
              className="map-labels"
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
            <FitBounds points={points} />

            {selectedLine && (
              <Polyline
                positions={selectedLine}
                pathOptions={{ color: '#9C2F62', weight: 2, dashArray: '5 6', opacity: 0.7 }}
              />
            )}

            {persona.preferred_areas.map(a => (
              <Marker
                key={`area-${a.label}-${a.latitude}`}
                position={[a.latitude, a.longitude]}
                icon={preferredAreaPin}
              >
                <Popup>
                  <strong>{a.label}</strong>
                  <br />An area you&rsquo;d like to live in
                </Popup>
              </Marker>
            ))}

            {persona.workplaces.map(w => (
              <Marker key={`wp-${w.label}`} position={[w.latitude, w.longitude]} icon={workplacePin}>
                <Popup>
                  <strong>{w.label}</strong>
                  <br />Your workplace · target under {w.max_minutes} min
                </Popup>
              </Marker>
            ))}

            {pinned.map(({ p, score }) => (
              <Marker
                key={p.id}
                position={[p.latitude!, p.longitude!]}
                icon={propertyPin(score, p.id === selectedId, p.is_active)}
                eventHandlers={{ click: () => setSelectedId(p.id ?? null) }}
              >
                <Popup>
                  <strong>{p.address ?? p.postcode}</strong>
                  <br />{money(p.price)} · fit {score ?? '—'}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="flex flex-col gap-2 max-h-[560px] overflow-y-auto pr-0.5">
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 text-brand animate-spin" />
            </div>
          )}

          {!isLoading && ranked.length === 0 && (
            <div className="card px-5 py-8 text-center">
              <Info className="w-5 h-5 text-ink-faint mx-auto mb-3" />
              <p className="text-sm font-semibold text-ink mb-1">
                Nothing to compare yet
              </p>
              <p className="text-xs text-ink-muted leading-relaxed">
                HomeReady doesn&rsquo;t search for properties &mdash; you bring
                the ones you&rsquo;re considering. Paste a Rightmove link above
                and each gets a pin, a real commute time to your workplaces, and
                a score built from your priorities.
              </p>
            </div>
          )}

          {ranked.map(({ p, score, coverage }, i) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id ?? null)}
              className={`text-left card px-4 py-3 transition-all ${
                p.id === selectedId ? 'ring-2 ring-brand border-brand' : 'hover:border-brand/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-ink-faint tabular-nums w-4">{i + 1}</span>
                <ScoreChip score={score} coverage={coverage} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-ink truncate">
                    {p.address ?? p.postcode}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-muted flex-wrap">
                    {money(p.price)}{p.bedrooms ? ` · ${p.bedrooms} bed` : ''}
                    {overBudgetBy(p.price, persona.price_max) !== null && (
                      <OverBudgetBadge price={p.price!} ceiling={persona.price_max!} />
                    )}
                    {!p.is_active && <GoneBadge />}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <PropertyDetail
          property={selected}
          weights={weights}
          meta={presetData?.dimensions ?? []}
          priceCeiling={persona.price_max}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Side-by-side comparison */}
      {ranked.length > 1 && (
        <section className="card px-0 py-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-display text-lg text-ink">Side by side</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Scores on the right, the figures behind them underneath. Blank
              cells mean we have no data for that dimension &mdash; not that it
              scored zero.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border">
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wide font-semibold text-ink-muted">
                    Property
                  </th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wide font-semibold text-ink-muted">
                    Fit
                  </th>
                  {(presetData?.dimensions ?? []).map(d => (
                    <th key={d.key} className="px-3 py-2.5 text-[11px] uppercase tracking-wide font-semibold text-ink-muted">
                      {d.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ p, score, coverage }) => {
                  const dimensions = p.enrichment?.fit?.dimensions ?? []
                  const byKey = Object.fromEntries(dimensions.map(d => [d.key, d]))
                  const selectedRow = p.id === selectedId
                  const rowClass = selectedRow ? 'bg-brand-light' : 'hover:bg-surface-2'
                  const over = overBudgetBy(p.price, persona.price_max)

                  return (
                    // Two rows per property: the scores, then the figures they
                    // came from. A row of numbers alone invites the buyer to
                    // trust the ranking without ever seeing what it rests on,
                    // which is the habit this product is trying to break.
                    <Fragment key={p.id}>
                      <tr
                        onClick={() => setSelectedId(p.id ?? null)}
                        className={`cursor-pointer transition-colors ${rowClass}`}
                      >
                        <td className="px-4 pt-3 pb-1.5">
                          <span className="block text-sm font-medium text-ink truncate max-w-[210px]">
                            {p.address ?? p.postcode}
                          </span>
                          <span className="flex items-center gap-1.5 flex-wrap text-xs text-ink-muted">
                            {money(p.price)}
                            {p.bedrooms ? ` · ${p.bedrooms} bed` : ''}
                            {over !== null && (
                              <OverBudgetBadge price={p.price!} ceiling={persona.price_max!} />
                            )}
                            {!p.is_active && <GoneBadge />}
                          </span>
                        </td>
                        <td className="px-3 pt-3 pb-1.5 text-center align-top">
                          <ScoreChip score={score} coverage={coverage} />
                        </td>
                        {(presetData?.dimensions ?? []).map(d => {
                          const dim = byKey[d.key]
                          return (
                            <td key={d.key} className="px-3 pt-3 pb-1.5 text-center align-top">
                              {dim?.score != null ? (
                                <span
                                  className="text-sm font-semibold tabular-nums"
                                  style={{ color: fitColour(dim.score) }}
                                  title={dim.detail}
                                >
                                  {dim.score}
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] text-ink-faint"
                                  title={dim?.unavailable_reason ?? 'No data'}
                                >
                                  <AlertCircle className="w-3 h-3" /> n/a
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>

                      <tr
                        onClick={() => setSelectedId(p.id ?? null)}
                        className={`border-b border-border last:border-0 cursor-pointer transition-colors ${rowClass}`}
                      >
                        <td
                          colSpan={2 + (presetData?.dimensions ?? []).length}
                          className="px-4 pb-3 pt-0"
                        >
                          {/* Pinned to the left edge so it stays readable while
                              the score columns scroll horizontally. */}
                          <div className="sticky left-0 flex flex-col gap-1.5 max-w-[620px]">
                            <FactStrip facts={keyFacts(p)} />
                            <WhyYesWhyNot dimensions={dimensions} weights={weights} />
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(persona.workplaces.length === 0 || persona.preferred_areas.length === 0) && (
        <Callout variant="info" title="Two things only you can tell us">
          {persona.workplaces.length === 0 && (
            <p>
              Commute is the one dimension we can&rsquo;t estimate without a
              destination &mdash; add where you work and every property gets a
              real door-to-door journey time.
            </p>
          )}
          {persona.preferred_areas.length === 0 && (
            <p className={persona.workplaces.length === 0 ? 'mt-2' : undefined}>
              Add the parts of London you&rsquo;d like to live in and each
              property is scored on how close it is to the nearest one.
            </p>
          )}
          <p className="mt-2">
            <Link to="/persona" className="font-semibold underline">
              Edit your profile
            </Link>{' '}
            &mdash; until then these leave the score rather than being guessed at,
            which is why the fit numbers say what share of your priorities they
            rest on.
          </p>
        </Callout>
      )}
    </div>
  )
}
