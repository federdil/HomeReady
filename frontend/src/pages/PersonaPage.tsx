import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check, Loader2, MapPin, Plus, Search, Sliders, Trash2, Wallet, Home as HomeIcon,
} from 'lucide-react'
import {
  getPersona, getPersonaPresets, savePersona, geocodePlace, rescoreProperties,
} from '@/lib/api'
import { PrimaryButton, SecondaryButton, Callout } from '@/components/ui'
import type { DimensionKey, Persona, Workplace } from '@/types'

const EMPTY: Persona = {
  label: 'My search',
  preset_key: null,
  price_min: null,
  price_max: null,
  deposit: null,
  min_bedrooms: 2,
  needs_outdoor_space: false,
  needs_parking: false,
  property_types: [],
  min_lease_years: 85,
  weights: { commute: 60, safety: 60, schools: 40, value: 60, space: 50 },
  workplaces: [],
}

const parseMoney = (raw: string): number | null => {
  const digits = raw.replace(/[^0-9]/g, '')
  return digits ? parseInt(digits, 10) : null
}
const formatMoney = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('en-GB')

function Section({ icon, title, blurb, children }: {
  icon: React.ReactNode; title: string; blurb: string; children: React.ReactNode
}) {
  return (
    <section className="card px-5 py-5 md:px-6 md:py-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-brand-light text-brand flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-lg text-ink leading-snug">{title}</h2>
          <p className="text-sm text-ink-muted mt-0.5">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function MoneyInput({ label, value, onChange, placeholder }: {
  label: string; value: number | null | undefined
  onChange: (v: number | null) => void; placeholder: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-muted">{label}</span>
      <span className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint text-sm">£</span>
        <input
          inputMode="numeric"
          className="input pl-7 w-full"
          value={formatMoney(value)}
          placeholder={placeholder}
          onChange={e => onChange(parseMoney(e.target.value))}
        />
      </span>
    </label>
  )
}

function WorkplaceRow({ workplace, onRemove, onChange }: {
  workplace: Workplace
  onRemove: () => void
  onChange: (w: Workplace) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
      <MapPin className="w-4 h-4 text-brand flex-shrink-0" />
      <span className="text-sm font-medium text-ink flex-1 min-w-[120px] truncate">
        {workplace.label}
      </span>
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        no more than
        <input
          type="number"
          min={5}
          max={180}
          value={workplace.max_minutes}
          onChange={e => onChange({ ...workplace, max_minutes: Number(e.target.value) || 45 })}
          className="input w-16 py-1 text-center"
        />
        min
      </label>
      <button
        onClick={onRemove}
        aria-label={`Remove ${workplace.label}`}
        className="p-1.5 rounded-lg text-ink-faint hover:text-danger hover:bg-surface-3 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function PersonaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: presetData } = useQuery({
    queryKey: ['persona-presets'],
    queryFn: getPersonaPresets,
  })
  const { data: saved, isLoading } = useQuery({
    queryKey: ['persona'],
    queryFn: getPersona,
  })

  const [persona, setPersona] = useState<Persona>(EMPTY)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!hydrated && !isLoading) {
      if (saved) setPersona({ ...EMPTY, ...saved })
      setHydrated(true)
    }
  }, [saved, isLoading, hydrated])

  const [placeQuery, setPlaceQuery] = useState('')
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)

  const dimensions = presetData?.dimensions ?? []

  const save = useMutation({
    mutationFn: async () => {
      await savePersona(persona)
      // Weights alone re-rank on the client, but a changed workplace needs new
      // journey times from TfL — which only the server can fetch. Without this
      // the map would keep showing commutes to the old address.
      await rescoreProperties().catch(() => undefined)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['persona'] })
      queryClient.invalidateQueries({ queryKey: ['assessed-properties'] })
      navigate('/map')
    },
  })

  const applyPreset = (key: string) => {
    const preset = presetData?.presets.find(p => p.key === key)
    if (!preset) return
    setPersona(p => ({
      ...p,
      preset_key: preset.key,
      label: preset.label,
      weights: { ...preset.weights },
      min_bedrooms: preset.min_bedrooms,
      needs_outdoor_space: preset.needs_outdoor_space,
      needs_parking: preset.needs_parking,
    }))
  }

  const addWorkplace = async () => {
    const query = placeQuery.trim()
    if (!query) return
    setSearching(true)
    setPlaceError(null)
    try {
      const result = await geocodePlace(query)
      if (!result.found || result.latitude == null || result.longitude == null) {
        setPlaceError(result.reason ?? 'Couldn’t find that place.')
        return
      }
      setPersona(p => ({
        ...p,
        workplaces: [...p.workplaces, {
          label: query,
          postcode: result.postcode || null,
          latitude: result.latitude!,
          longitude: result.longitude!,
          max_minutes: 45,
        }],
      }))
      setPlaceQuery('')
    } catch {
      setPlaceError('Lookup failed. Try again in a moment.')
    } finally {
      setSearching(false)
    }
  }

  const budgetValid = useMemo(
    () => !persona.price_min || !persona.price_max || persona.price_min <= persona.price_max,
    [persona.price_min, persona.price_max],
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-5 h-5 text-brand animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <header className="mb-1">
        <span className="stage-pill inline-flex mb-3">
          <span className="stage-pill-dot" />
          Step 1 — About you
        </span>
        <h1 className="font-display text-2xl md:text-3xl text-ink mb-2">
          Tell us what you&rsquo;re looking for
        </h1>
        <p className="text-base text-ink-muted leading-relaxed">
          Every property you add gets scored against this. There is no universal
          &ldquo;good area&rdquo; &mdash; a flat that suits a short commute may be
          wrong for schools and space, so we score against your priorities, not
          someone else&rsquo;s.
        </p>
      </header>

      <Section
        icon={<Sliders className="w-4 h-4" />}
        title="Start from a profile"
        blurb="Pick whichever is closest. You can change everything below."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          {presetData?.presets.map(preset => {
            const active = persona.preset_key === preset.key
            return (
              <button
                key={preset.key}
                onClick={() => applyPreset(preset.key)}
                className={`text-left rounded-xl border px-4 py-3.5 transition-all ${
                  active
                    ? 'border-brand bg-brand-light ring-1 ring-brand/20'
                    : 'border-border bg-surface hover:border-brand/40 hover:bg-surface-2'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-semibold ${active ? 'text-brand' : 'text-ink'}`}>
                    {preset.label}
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-brand flex-shrink-0" />}
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{preset.description}</p>
              </button>
            )
          })}
        </div>
      </Section>

      <Section
        icon={<Wallet className="w-4 h-4" />}
        title="Budget"
        blurb="What you can actually spend — you know this better than we can calculate it."
      >
        <div className="grid sm:grid-cols-3 gap-4">
          <MoneyInput
            label="Lowest price" placeholder="400,000"
            value={persona.price_min}
            onChange={v => setPersona(p => ({ ...p, price_min: v }))}
          />
          <MoneyInput
            label="Highest price" placeholder="600,000"
            value={persona.price_max}
            onChange={v => setPersona(p => ({ ...p, price_max: v }))}
          />
          <MoneyInput
            label="Your deposit" placeholder="60,000"
            value={persona.deposit}
            onChange={v => setPersona(p => ({ ...p, deposit: v }))}
          />
        </div>
        {!budgetValid && (
          <p className="text-xs text-danger mt-2">
            The lowest price is above the highest — swap them round.
          </p>
        )}
      </Section>

      <Section
        icon={<HomeIcon className="w-4 h-4" />}
        title="The property itself"
        blurb="We check each listing against these and tell you what it's missing."
      >
        <div className="flex flex-col gap-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm text-ink">Minimum bedrooms</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setPersona(p => ({ ...p, min_bedrooms: n }))}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                    persona.min_bedrooms === n
                      ? 'bg-brand text-white'
                      : 'bg-surface-2 border border-border text-ink-muted hover:border-brand/40'
                  }`}
                >
                  {n}{n === 5 ? '+' : ''}
                </button>
              ))}
            </div>
          </label>

          {([
            ['needs_outdoor_space', 'Outdoor space', 'Garden, terrace, or balcony'],
            ['needs_parking', 'Parking', 'Driveway, garage, or off-street'],
          ] as const).map(([key, label, hint]) => (
            <label key={key} className="flex items-center justify-between gap-4 cursor-pointer">
              <span>
                <span className="text-sm text-ink block">{label}</span>
                <span className="text-xs text-ink-faint">{hint}</span>
              </span>
              <input
                type="checkbox"
                checked={persona[key]}
                onChange={e => setPersona(p => ({ ...p, [key]: e.target.checked }))}
                className="w-5 h-5 accent-brand cursor-pointer"
              />
            </label>
          ))}

          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="text-sm text-ink block">Shortest lease you&rsquo;d accept</span>
              <span className="text-xs text-ink-faint">
                Under 80 years gets expensive to extend and harder to mortgage
              </span>
            </span>
            <span className="flex items-center gap-2">
              <input
                type="number" min={0} max={999}
                value={persona.min_lease_years ?? ''}
                onChange={e => setPersona(p => ({
                  ...p, min_lease_years: e.target.value ? Number(e.target.value) : null,
                }))}
                className="input w-20 py-1.5 text-center"
              />
              <span className="text-xs text-ink-muted">years</span>
            </span>
          </label>
        </div>
      </Section>

      <Section
        icon={<MapPin className="w-4 h-4" />}
        title="Where you need to get to"
        blurb="We'll show real door-to-door journey times from every property to each of these."
      >
        <div className="flex flex-col gap-3">
          {persona.workplaces.map((w, i) => (
            <WorkplaceRow
              key={`${w.label}-${i}`}
              workplace={w}
              onRemove={() => setPersona(p => ({
                ...p, workplaces: p.workplaces.filter((_, j) => j !== i),
              }))}
              onChange={updated => setPersona(p => ({
                ...p, workplaces: p.workplaces.map((x, j) => (j === i ? updated : x)),
              }))}
            />
          ))}

          <div className="flex gap-2">
            <span className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
              <input
                className="input pl-9 w-full"
                placeholder="Postcode or place — e.g. E14 5AB, or Canary Wharf"
                value={placeQuery}
                onChange={e => { setPlaceQuery(e.target.value); setPlaceError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addWorkplace() } }}
              />
            </span>
            <SecondaryButton onClick={addWorkplace} disabled={searching || !placeQuery.trim()}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </SecondaryButton>
          </div>

          {placeError && (
            <Callout variant="warning" title="Couldn't find that">
              {placeError} Office names often aren&rsquo;t in the public map data &mdash;
              the building&rsquo;s postcode works best.
            </Callout>
          )}

          {persona.workplaces.length === 0 && !placeError && (
            <p className="text-xs text-ink-faint">
              Add at least one and commute becomes a scored dimension. Without it,
              we&rsquo;ll say so rather than guess.
            </p>
          )}
        </div>
      </Section>

      <Section
        icon={<Sliders className="w-4 h-4" />}
        title="What matters most"
        blurb="These weights decide the ranking. Drag anything you don't care about to zero."
      >
        <div className="flex flex-col gap-4">
          {dimensions.map(dim => {
            const value = persona.weights[dim.key as DimensionKey] ?? 0
            return (
              <div key={dim.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{dim.label}</span>
                  <span className="text-xs font-semibold text-brand tabular-nums">{value}</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5}
                  value={value}
                  aria-label={dim.label}
                  onChange={e => setPersona(p => ({
                    ...p,
                    weights: { ...p.weights, [dim.key]: Number(e.target.value) },
                  }))}
                  className="w-full accent-brand cursor-pointer"
                />
                <span className="text-xs text-ink-faint">{dim.blurb}</span>
              </div>
            )
          })}
        </div>
      </Section>

      <div className="flex items-center justify-between gap-4 py-2">
        <p className="text-xs text-ink-faint">
          You can change any of this later &mdash; scores update immediately.
        </p>
        <PrimaryButton onClick={() => save.mutate()} disabled={save.isPending || !budgetValid}>
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {save.isPending ? 'Re-scoring your properties…' : 'Save and view map'}
        </PrimaryButton>
      </div>

      {save.isError && (
        <Callout variant="danger" title="Couldn't save">
          Something went wrong saving your profile. Try again.
        </Callout>
      )}
    </div>
  )
}
