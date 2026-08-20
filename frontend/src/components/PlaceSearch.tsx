import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { geocodePlace, suggestPlaces } from '@/lib/api'
import type { PlaceSuggestion } from '@/types'

/**
 * A London place picker for workplaces and preferred areas.
 *
 * Free text was the wrong shape of input for a field that has to resolve to
 * coordinates: the user cannot know what vocabulary the geocoder speaks, so
 * they type, fail, and try again with no idea what would work. Choosing from
 * matches replaces guessing with picking, and everything offered has already
 * been resolved and already confirmed to be inside Greater London — the field
 * cannot produce a persona we are unable to score.
 *
 * Typing still works: enter without a highlighted row falls back to a one-shot
 * lookup, which is what someone who pastes a full postcode expects.
 */

/**
 * Long enough that a normal typing burst is one request, short enough not to
 * feel laggy. It also keeps us inside what OpenStreetMap asks of a client —
 * that service is donated, and the server caches on top of this.
 */
const DEBOUNCE_MS = 300

export default function PlaceSearch({
  placeholder,
  onSelect,
  hint,
}: {
  placeholder: string
  onSelect: (place: PlaceSuggestion) => void
  hint?: string
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [highlighted, setHighlighted] = useState(-1)
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const listId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  // Every response carries the query it answered, so a slow request that lands
  // after a faster later one cannot overwrite the newer suggestions.
  const latestQuery = useRef('')

  useEffect(() => {
    const trimmed = query.trim()
    latestQuery.current = trimmed

    if (trimmed.length < 2) {
      setSuggestions([])
      setSearched(false)
      return
    }

    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const results = await suggestPlaces(trimmed)
        if (latestQuery.current !== trimmed) return
        setSuggestions(results)
        setSearched(true)
        // Nothing is pre-highlighted, so enter never accepts a row the user has
        // not looked at. Auto-highlighting the top match made typing
        // "Manchester" and pressing enter silently add Manchester Grove Estate
        // in Tower Hamlets — a real London street, and the exact substitution
        // the server-side lookup refuses to make.
        setHighlighted(-1)
        setOpen(true)
      } catch {
        if (latestQuery.current === trimmed) setSuggestions([])
      } finally {
        if (latestQuery.current === trimmed) setSearching(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  // Clicking away should close the list without choosing anything.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const reset = () => {
    setQuery('')
    setSuggestions([])
    setSearched(false)
    setHighlighted(-1)
    setOpen(false)
    setError(null)
  }

  const choose = (place: PlaceSuggestion) => {
    onSelect(place)
    reset()
  }

  /** Enter with nothing highlighted: resolve what was typed, as-is. */
  const resolveTyped = async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    setResolving(true)
    setError(null)
    try {
      const result = await geocodePlace(trimmed)
      if (!result.found || result.latitude == null || result.longitude == null) {
        setError(result.reason ?? 'Couldn’t find that place.')
        return
      }
      choose({
        label: trimmed,
        description: result.district || result.postcode,
        postcode: result.postcode,
        district: result.district,
        latitude: result.latitude,
        longitude: result.longitude,
      })
    } catch {
      setError('Lookup failed. Try again in a moment.')
    } finally {
      setResolving(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!suggestions.length) return
      e.preventDefault()
      setOpen(true)
      setHighlighted(i => {
        // From "nothing highlighted", down goes to the first row and up to the
        // last, rather than both landing on the same place.
        if (i < 0) return e.key === 'ArrowDown' ? 0 : suggestions.length - 1
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1
        return (next + suggestions.length) % suggestions.length
      })
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // Only an explicitly highlighted row — arrowed to or hovered. Otherwise
      // resolve what was actually typed, which is the path that refuses
      // anywhere outside London by name.
      const picked = open && highlighted >= 0 ? suggestions[highlighted] : undefined
      if (picked) choose(picked)
      else resolveTyped()
      return
    }
    if (e.key === 'Escape') setOpen(false)
  }

  const busy = searching || resolving
  // Only once a search has actually completed — otherwise the empty state
  // flashes up mid-keystroke and reads as a failure.
  const nothingFound = searched && !searching && suggestions.length === 0

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
        <input
          className="input pl-9 pr-9 w-full"
          placeholder={placeholder}
          value={query}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlighted >= 0 ? `${listId}-${highlighted}` : undefined
          }
          onChange={e => {
            setQuery(e.target.value)
            setError(null)
            setOpen(true)
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {busy && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand animate-spin" />
        )}

        {open && suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-[1000] left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg py-1"
          >
            {suggestions.map((place, i) => (
              <li
                key={`${place.label}-${place.latitude}-${place.longitude}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === highlighted}
                // mousedown, not click: the input's blur would close the list
                // before a click ever landed.
                onMouseDown={e => { e.preventDefault(); choose(place) }}
                onMouseEnter={() => setHighlighted(i)}
                className={`px-3 py-2 cursor-pointer flex flex-col gap-0.5 ${
                  i === highlighted ? 'bg-brand-light' : ''
                }`}
              >
                <span className="text-sm font-medium text-ink">{place.label}</span>
                {place.description && (
                  <span className="text-xs text-ink-faint">{place.description}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-danger leading-relaxed">{error}</p>}

      {nothingFound && !error && (
        <p className="text-xs text-ink-faint leading-relaxed">
          Nothing in London matches &ldquo;{query.trim()}&rdquo;. Office names
          and internal site codes aren&rsquo;t in the public map data &mdash; the
          building&rsquo;s postcode works best. HomeReady covers London only.
        </p>
      )}

      {hint && !error && !nothingFound && (
        <p className="text-xs text-ink-faint leading-relaxed">{hint}</p>
      )}
    </div>
  )
}
