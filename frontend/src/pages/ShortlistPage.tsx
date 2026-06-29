import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getSavedProperties, deleteProperty, updatePropertyNotes } from '@/lib/api'
import type { SavedProperty } from '@/types'
import { cn } from '@/lib/utils'
import { SolidCard, PageHeader, Callout } from '@/components/ui'
import {
  Loader2, Trash2, ExternalLink, MapPin, AlertTriangle, CheckCircle,
  StickyNote, Check, ArrowRight, TrendingDown, Bookmark, Home,
} from 'lucide-react'

function formatGBP(n: number) {
  return '£' + n.toLocaleString('en-GB')
}

function TrustBadge({ score }: { score: number }) {
  const cls = score >= 70
    ? 'text-success bg-success-bg border-success/30'
    : score >= 45
    ? 'text-warning bg-warning-bg border-warning/30'
    : 'text-danger bg-danger-bg border-danger/30'
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border', cls)}>
      {score}/100
    </span>
  )
}

function PropertyCard({ prop, onDelete }: { prop: SavedProperty; onDelete: () => void }) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes]               = useState(prop.notes ?? '')
  const [notesSaved, setNotesSaved]     = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const notesMutation = useMutation({
    mutationFn: () => updatePropertyNotes(prop.id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-properties'] })
      setEditingNotes(false)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteProperty(prop.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-properties'] })
      onDelete()
    },
  })

  const redFlags   = prop.decoded_result?.red_flags?.slice(0, 2)   ?? []
  const greenFlags = prop.decoded_result?.green_flags?.slice(0, 1) ?? []

  const handleOfferClick = () => {
    const params = new URLSearchParams()
    if (prop.price) params.set('price', String(prop.price))
    if (prop.property_type) params.set('type', prop.property_type)
    const flags = prop.decoded_result?.red_flags?.slice(0, 2).join('; ')
    if (flags) params.set('context', flags)
    navigate(`/offer?${params.toString()}`)
  }

  const handleNeighbourhoodClick = () => {
    navigate(`/evaluate/neighbourhood${prop.postcode ? `?postcode=${encodeURIComponent(prop.postcode)}` : ''}`)
  }

  return (
    <div className="card overflow-hidden flex flex-col">
      {/* Card header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {prop.trust_score != null && <TrustBadge score={prop.trust_score} />}
              {prop.red_flag_count > 0 && (
                <span className="badge badge-danger">
                  {prop.red_flag_count} flag{prop.red_flag_count !== 1 ? 's' : ''}
                </span>
              )}
              {prop.days_on_market != null && prop.days_on_market > 60 && (
                <span className="badge badge-warning flex items-center gap-1">
                  <TrendingDown className="w-2.5 h-2.5" />{prop.days_on_market}d on market
                </span>
              )}
            </div>
            {/* Address */}
            <p className="text-sm font-semibold text-ink truncate">
              {prop.address ?? 'Unknown address'}
            </p>
            {/* Meta pills */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {prop.price && (
                <span className="text-base font-bold text-brand">{formatGBP(prop.price)}</span>
              )}
              {prop.bedrooms && (
                <span className="text-xs text-ink-muted font-medium">{prop.bedrooms} bed</span>
              )}
              {prop.property_type && (
                <span className="text-xs text-ink-muted capitalize">{prop.property_type}</span>
              )}
              {prop.postcode && (
                <span className="flex items-center gap-1 text-xs text-ink-muted">
                  <MapPin className="w-3 h-3" />{prop.postcode}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {prop.rightmove_url && (
              <a
                href={prop.rightmove_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg hover:bg-surface-2 text-ink-faint hover:text-ink transition-colors"
                title="View on Rightmove"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="p-1.5 rounded-lg hover:bg-danger-bg text-ink-faint hover:text-danger transition-colors disabled:opacity-40"
              title="Remove from shortlist"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Flags preview */}
      {(redFlags.length > 0 || greenFlags.length > 0) && (
        <div className="px-4 py-3 space-y-1.5 border-b border-border bg-surface-2">
          {redFlags.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-ink-muted">
              <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
              <span className="line-clamp-1">{f}</span>
            </div>
          ))}
          {greenFlags.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-ink-muted">
              <CheckCircle className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
              <span className="line-clamp-1">{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div className="px-4 py-3 border-b border-border flex-1">
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add your notes about this property…"
              className="glass-input resize-none text-xs w-full"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => notesMutation.mutate()}
                disabled={notesMutation.isPending}
                className="flex items-center gap-1.5 text-xs text-brand font-semibold hover:text-brand-hover transition-colors disabled:opacity-50"
              >
                {notesMutation.isPending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Check className="w-3 h-3" />
                }
                Save
              </button>
              <button
                onClick={() => { setEditingNotes(false); setNotes(prop.notes ?? '') }}
                className="text-xs text-ink-muted hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className="flex items-start gap-2 text-xs text-ink-muted hover:text-ink transition-colors w-full text-left"
          >
            <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {prop.notes
                ? <span className="line-clamp-2">{prop.notes}</span>
                : <span className="opacity-50">Add notes…</span>
              }
              {notesSaved && <span className="text-success font-semibold ml-2">✓ Saved</span>}
            </span>
          </button>
        )}
      </div>

      {/* CTAs */}
      <div className="flex items-stretch divide-x divide-border">
        <button
          onClick={handleNeighbourhoodClick}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-ink-muted hover:text-brand hover:bg-brand-light py-2.5 transition-colors font-semibold"
        >
          <MapPin className="w-3.5 h-3.5" /> Neighbourhood
        </button>
        <button
          onClick={handleOfferClick}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-ink-muted hover:text-brand hover:bg-brand-light py-2.5 transition-colors font-semibold"
        >
          <TrendingDown className="w-3.5 h-3.5" /> Offer strategy
        </button>
        {prop.rightmove_url && (
          <a
            href={prop.rightmove_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 text-xs text-ink-muted hover:text-brand hover:bg-brand-light py-2.5 transition-colors font-semibold"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Rightmove
          </a>
        )}
      </div>
    </div>
  )
}

type SortKey = 'date' | 'trust' | 'price'

export default function ShortlistPage() {
  const [sort, setSort]     = useState<SortKey>('date')
  const [deleted, setDeleted] = useState<Set<string>>(new Set())
  const navigate = useNavigate()

  const { data: properties = [], isLoading, isError } = useQuery({
    queryKey: ['saved-properties'],
    queryFn: getSavedProperties,
  })

  const visible = properties
    .filter(p => !deleted.has(p.id))
    .sort((a, b) => {
      if (sort === 'trust') return (b.trust_score ?? 0) - (a.trust_score ?? 0)
      if (sort === 'price') return (a.price ?? 0) - (b.price ?? 0)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-brand animate-spin" />
          <p className="text-sm text-ink-muted">Loading your shortlist…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 2 — Property Evaluation"
        title="My Shortlist"
        description="Your saved properties. Decode a Rightmove listing and click 'Save to shortlist' to track it here."
      />

      {isError && (
        <Callout variant="danger">Failed to load your shortlist. Please try refreshing.</Callout>
      )}

      {visible.length === 0 && !isLoading && (
        <div className="card p-12 text-center"
          style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9F8 100%)', borderColor: 'rgba(91,61,174,0.12)' }}
        >
          <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
            <Bookmark className="w-6 h-6 text-brand" />
          </div>
          <p className="font-display text-xl text-ink mb-2">No properties saved yet</p>
          <p className="text-sm text-ink-muted mb-6 max-w-xs mx-auto">
            Decode a Rightmove listing and save it here to build your shortlist and compare properties.
          </p>
          <button
            onClick={() => navigate('/evaluate')}
            className="inline-flex items-center gap-2 text-sm text-brand font-semibold hover:text-brand-hover transition-colors px-4 py-2 rounded-xl bg-white border border-brand/20 hover:bg-brand-light"
          >
            <ArrowRight className="w-4 h-4" /> Go to Listing Decoder
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <>
          {/* Sort + count bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-ink-muted">
              <span className="font-bold text-ink">{visible.length}</span>{' '}
              propert{visible.length !== 1 ? 'ies' : 'y'} saved
            </p>
            <div className="flex gap-1.5">
              {(['date', 'trust', 'price'] as SortKey[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    sort === s
                      ? 'bg-brand text-white shadow-sm'
                      : 'bg-surface-2 border border-border text-ink-muted hover:text-ink'
                  )}
                >
                  {s === 'trust' ? 'Trust score' : s === 'price' ? 'Price ↑' : 'Newest'}
                </button>
              ))}
            </div>
          </div>

          {/* Property grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {visible.map(prop => (
              <PropertyCard
                key={prop.id}
                prop={prop}
                onDelete={() => setDeleted(d => new Set([...d, prop.id]))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
