import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Check, Loader2, MapPin, Sliders, Trash2, Wallet, Home as HomeIcon,
} from 'lucide-react'
import {
  getPersona, getPersonaPresets, savePersona, rescoreProperties,
} from '@/lib/api'
import { PrimaryButton, Callout } from '@/components/ui'
import PlaceSearch from '@/components/PlaceSearch'
import { useScoreHelp } from '@/components/ScoreHelp'
import type {
  DimensionKey, DimensionMeta, OptionMeta, Persona, PlaceSuggestion,
  PreferredArea, Workplace,
} from '@/types'

const EMPTY: Persona = {
  label: 'My profile',
  preset_key: null,
  price_min: null,
  price_max: null,
  deposit: null,
  min_bedrooms: 2,
  needs_outdoor_space: false,
  needs_parking: false,
  property_types: [],
  preferred_periods: [],
  min_lease_years: 85,
  weights: { commute: 60, area: 60, safety: 60, schools: 40, value: 60, space: 50 },
  workplaces: [],
  preferred_areas: [],
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

function PlaceRow({ label, sublabel, onRemove, children }: {
  label: string
  sublabel?: string | null
  onRemove: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
      <MapPin className="w-4 h-4 text-brand flex-shrink-0" />
      <span className="flex-1 min-w-[120px] truncate">
        <span className="text-sm font-medium text-ink block truncate">{label}</span>
        {sublabel && <span className="text-xs text-ink-faint">{sublabel}</span>}
      </span>
      {children}
      <button
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="p-1.5 rounded-lg text-ink-faint hover:text-danger hover:bg-surface-3 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

function WorkplaceRow({ workplace, onRemove, onChange }: {
  workplace: Workplace
  onRemove: () => void
  onChange: (w: Workplace) => void
}) {
  return (
    <PlaceRow
      label={workplace.label}
      sublabel={workplace.postcode}
      onRemove={onRemove}
    >
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        no more than
        <input
          type="number"
          min={5}
          max={180}
          value={workplace.max_minutes}
          onChange={e => onChange({ ...workplace, max_minutes: Number(e.target.value) || 45 })}
          className="input w-16 py-1 text-center"
          aria-label={`Longest acceptable journey to ${workplace.label}, in minutes`}
        />
        min
      </label>
    </PlaceRow>
  )
}

/**
 * Multi-select cards for options that need describing rather than naming.
 *
 * "Victorian (1837–1901)" is a fact about a date. "Bay windows, cornicing,
 * original fireplaces" is the thing people are actually choosing between, and
 * it is what lets someone recognise the house they have been picturing without
 * knowing what to call it.
 */
function CardSelect({ options, selected, onChange, emptyNote }: {
  options: OptionMeta[]
  selected: string[]
  onChange: (next: string[]) => void
  emptyNote: string
}) {
  const toggle = (key: string) =>
    onChange(
      selected.includes(key)
        ? selected.filter(k => k !== key)
        : [...selected, key],
    )

  return (
    <div className="flex flex-col gap-2">
      <div className="grid sm:grid-cols-2 gap-2">
        {options.map(option => {
          const active = selected.includes(option.key)
          return (
            <button
              key={option.key}
              onClick={() => toggle(option.key)}
              aria-pressed={active}
              className={`text-left rounded-xl border px-3.5 py-3 transition-all ${
                active
                  ? 'border-brand bg-brand-light ring-1 ring-brand/20'
                  : 'border-border bg-surface hover:border-brand/40 hover:bg-surface-2'
              }`}
            >
              <span className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-sm font-semibold ${active ? 'text-brand' : 'text-ink'}`}>
                  {option.label}
                </span>
                {active && <Check className="w-3.5 h-3.5 text-brand flex-shrink-0" />}
              </span>
              <span className="block text-xs text-ink-muted leading-relaxed">
                {option.blurb}
              </span>
            </button>
          )
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-ink-faint leading-relaxed">{emptyNote}</p>
      )}
    </div>
  )
}

/**
 * Multi-select chips for the attribute preferences.
 *
 * Nothing selected means "no preference" and the attribute is left out of
 * scoring entirely — which is different from preferring nothing, and is why
 * the empty state says so rather than looking like an unfinished form.
 */
function ChipSelect({ options, selected, onChange, emptyNote }: {
  options: OptionMeta[]
  selected: string[]
  onChange: (next: string[]) => void
  emptyNote: string
}) {
  const toggle = (key: string) =>
    onChange(
      selected.includes(key)
        ? selected.filter(k => k !== key)
        : [...selected, key],
    )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const active = selected.includes(option.key)
          return (
            <button
              key={option.key}
              onClick={() => toggle(option.key)}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                active
                  ? 'border-brand bg-brand-light text-brand'
                  : 'border-border bg-surface text-ink-muted hover:border-brand/40'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-ink-faint leading-relaxed">{emptyNote}</p>
      )}
    </div>
  )
}

function PrioritySlider({ dimension, value, onChange }: {
  dimension: DimensionMeta
  value: number
  onChange: (value: number) => void
}) {
  const { trigger, panel } = useScoreHelp({
    label: dimension.label,
    method: dimension.method,
    source: dimension.source,
  })

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-ink">{dimension.label}</span>
          {trigger}
        </span>
        <span className="text-xs font-semibold text-brand tabular-nums">{value}</span>
      </div>
      <input
        type="range" min={0} max={100} step={5}
        value={value}
        aria-label={dimension.label}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-brand cursor-pointer"
      />
      <span className="text-xs text-ink-faint">{dimension.blurb}</span>
      {panel}
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

  const dimensions = presetData?.dimensions ?? []
  const builtForms = presetData?.built_forms ?? []
  const periods = presetData?.periods ?? []

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
      property_types: [...preset.property_types],
      preferred_periods: [...preset.preferred_periods],
    }))
  }

  const addWorkplace = (place: PlaceSuggestion) =>
    setPersona(p => ({
      ...p,
      workplaces: [...p.workplaces, {
        label: place.label,
        postcode: place.postcode || null,
        latitude: place.latitude,
        longitude: place.longitude,
        max_minutes: 45,
      }],
    }))

  const addPreferredArea = (place: PlaceSuggestion) =>
    setPersona(p => {
      const already = p.preferred_areas.some(
        a => a.latitude === place.latitude && a.longitude === place.longitude,
      )
      if (already) return p
      const area: PreferredArea = {
        label: place.label,
        postcode: place.postcode || null,
        latitude: place.latitude,
        longitude: place.longitude,
        district: place.district || null,
      }
      return { ...p, preferred_areas: [...p.preferred_areas, area] }
    })

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
        <h1 className="font-display text-2xl md:text-3xl text-ink mb-2">
          How should we judge a property?
        </h1>
        {/* Stated first and stated plainly. People read a form asking for
            budget, bedrooms and areas as a search form, because on every other
            property site it is one — and then wait for listings that never
            come. What this actually sets is the yardstick. */}
        <Callout variant="info" title="HomeReady doesn't find properties for you (yet)">
          You&rsquo;ll still find those on Rightmove. What this does is score the
          ones you&rsquo;re <em>already</em> considering &mdash; paste a link and
          it gets measured against everything below, so you can tell which are
          worth a Saturday morning and which aren&rsquo;t.
        </Callout>
        <p className="text-base text-ink-muted leading-relaxed mt-3">
          Set this once. There is no universal &ldquo;good area&rdquo; &mdash; a
          flat that suits a short commute may be wrong for schools and space
          &mdash; so every property is measured against your priorities, not
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
        icon={<Building2 className="w-4 h-4" />}
        title="Areas you'd like to live in"
        blurb="Most people arrive with a shortlist. We'll score how close each property is to yours."
      >
        <div className="flex flex-col gap-3">
          {persona.preferred_areas.map((a, i) => (
            <PlaceRow
              key={`${a.label}-${i}`}
              label={a.label}
              sublabel={[a.district, a.postcode].filter(Boolean).join(' · ') || null}
              onRemove={() => setPersona(p => ({
                ...p,
                preferred_areas: p.preferred_areas.filter((_, j) => j !== i),
              }))}
            />
          ))}

          <PlaceSearch
            placeholder="Start typing — e.g. London Bridge, Bethnal Green"
            onSelect={addPreferredArea}
            hint={
              persona.preferred_areas.length === 0
                ? 'Add a few and we’ll score each property on how close it is to the nearest one. Leave it empty and this drops out of the score entirely.'
                : 'A property is scored against whichever of these it is nearest — they’re alternatives, not a list it has to satisfy all of.'
            }
          />
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

          <PlaceSearch
            placeholder="Start typing — e.g. Canary Wharf, or E14 5AB"
            onSelect={addWorkplace}
            hint={
              persona.workplaces.length === 0
                ? 'Add at least one and commute becomes a scored dimension. Without it, we’ll say so rather than guess.'
                : undefined
            }
          />
        </div>
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

          <div className="flex flex-col gap-2 pt-1">
            <span className="text-sm text-ink">Flat or house</span>
            <ChipSelect
              options={builtForms}
              selected={persona.property_types}
              onChange={next => setPersona(p => ({ ...p, property_types: next }))}
              emptyNote="Nothing selected — any kind of home is fine, and this won’t count for or against anything."
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <span className="text-sm text-ink">The kind of building you want to live in</span>
            <span className="text-xs text-ink-faint -mt-1.5 leading-relaxed">
              Pick as many as you&rsquo;d be happy with. We read this from what the
              listing actually says &mdash; most don&rsquo;t say, and a building we
              can&rsquo;t place is left out of the score rather than counted against.
            </span>
            <CardSelect
              options={periods}
              selected={persona.preferred_periods}
              onChange={next => setPersona(p => ({ ...p, preferred_periods: next }))}
              emptyNote="Nothing selected — a Victorian terrace and a new-build tower score the same on this."
            />
          </div>

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
        icon={<Sliders className="w-4 h-4" />}
        title="What matters most"
        blurb="These weights decide the ranking. Drag anything you don't care about to zero."
      >
        <div className="flex flex-col gap-4">
          {dimensions.map(dim => (
            <PrioritySlider
              key={dim.key}
              dimension={dim}
              value={persona.weights[dim.key as DimensionKey] ?? 0}
              onChange={next => setPersona(p => ({
                ...p, weights: { ...p.weights, [dim.key]: next },
              }))}
            />
          ))}
        </div>
      </Section>

      <div className="flex items-center justify-between gap-4 py-2">
        <p className="text-xs text-ink-faint">
          You can change any of this later &mdash; every property you&rsquo;ve
          added is re-scored immediately.
        </p>
        <PrimaryButton onClick={() => save.mutate()} disabled={save.isPending || !budgetValid}>
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {save.isPending ? 'Re-scoring your properties…' : 'Save and add properties'}
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
