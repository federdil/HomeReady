import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getSavedProperties, deleteProperty, updatePropertyNotes } from '@/lib/api'
import type { SavedProperty } from '@/types'
import { cn } from '@/lib/utils'
import { SolidCard, GlassCard, PageHeader } from '@/components/ui'
import {
  Loader2, Trash2, ExternalLink, MapPin, AlertTriangle, CheckCircle,
  StickyNote, Check, ArrowRight, TrendingDown, Home, Bookmark,
} from 'lucide-react'

function formatGBP(n: number) {
  return '£' + n.toLocaleString('en-GB')
}

function TrustBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'text-sage bg-sage-light border-sage/30'
    : score >= 45 ? 'text-amber bg-amber-light border-amber/30'
    : 'text-red-600 bg-red-50 border-red-200'
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border', color)}>
      {score}/100
    </span>
  )
}

function PropertyCard({ prop, onDelete }: { prop: SavedProperty; onDelete: () => void }) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(prop.notes ?? '')
  const [notesSaved, setNotesSaved] = useState(false)
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

  const redFlags = prop.decoded_result?.red_flags?.slice(0, 2) ?? []
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
    <SolidCard className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {prop.trust_score != null && <TrustBadge score={prop.trust_score} />}
            {prop.red_flag_count > 0 && (
              <span className="text-xs text-red-500 font-medium">{prop.red_flag_count} red flag{prop.red_flag_count !== 1 ? 's' : ''}</span>
            )}
            {prop.days_on_market != null && prop.days_on_market > 60 && (
              <span className="text-xs text-amber font-medium flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />{prop.days_on_market}d on market
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-plum truncate">{prop.address ?? 'Unknown address'}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {prop.price && <span className="text-sm font-medium text-purple">{formatGBP(prop.price)}</span>}
            {prop.bedrooms && <span className="text-xs text-plum-soft">{prop.bedrooms} bed</span>}
            {prop.property_type && <span className="text-xs text-plum-soft capitalize">{prop.property_type}</span>}
            {prop.postcode && (
              <span className="flex items-center gap-0.5 text-xs text-plum-soft">
                <MapPin className="w-3 h-3" />{prop.postcode}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {prop.rightmove_url && (
            <a href={prop.rightmove_url} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg hover:bg-white/60 text-plum-soft hover:text-plum transition-colors">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="p-1.5 rounded-lg hover:bg-red-50 text-plum-soft hover:text-red-500 transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Key flags preview */}
      {(redFlags.length > 0 || greenFlags.length > 0) && (
        <div className="space-y-1.5">
          {redFlags.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-plum-soft">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <span className="line-clamp-1">{f}</span>
            </div>
          ))}
          {greenFlags.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-plum-soft">
              <CheckCircle className="w-3.5 h-3.5 text-sage shrink-0 mt-0.5" />
              <span className="line-clamp-1">{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div>
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
            <div className="flex gap-2">
              <button
                onClick={() => notesMutation.mutate()}
                disabled={notesMutation.isPending}
                className="flex items-center gap-1 text-xs text-purple font-medium hover:text-purple/80 transition-colors disabled:opacity-50"
              >
                {notesMutation.isPending
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Check className="w-3 h-3" />
                } Save
              </button>
              <button onClick={() => { setEditingNotes(false); setNotes(prop.notes ?? '') }}
                className="text-xs text-plum-soft hover:text-plum transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditingNotes(true)}
            className="flex items-center gap-1.5 text-xs text-plum-soft hover:text-plum transition-colors"
          >
            <StickyNote className="w-3.5 h-3.5" />
            {prop.notes
              ? <span className="line-clamp-1 text-left">{prop.notes}</span>
              : <span className="opacity-60">Add notes…</span>
            }
            {notesSaved && <span className="text-sage font-medium">✓ Saved</span>}
          </button>
        )}
      </div>

      {/* CTAs */}
      <div className="flex gap-2 pt-1 border-t border-white/40">
        <button
          onClick={handleNeighbourhoodClick}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-plum-soft hover:text-plum py-1.5 rounded-lg hover:bg-white/60 transition-colors"
        >
          <MapPin className="w-3.5 h-3.5" /> Neighbourhood
        </button>
        <div className="w-px bg-white/40" />
        <button
          onClick={handleOfferClick}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs text-plum-soft hover:text-plum py-1.5 rounded-lg hover:bg-white/60 transition-colors"
        >
          <TrendingDown className="w-3.5 h-3.5" /> Offer strategy
        </button>
        {prop.rightmove_url && (
          <>
            <div className="w-px bg-white/40" />
            <a
              href={prop.rightmove_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 text-xs text-plum-soft hover:text-plum py-1.5 rounded-lg hover:bg-white/60 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Rightmove
            </a>
          </>
        )}
      </div>
    </SolidCard>
  )
}

type SortKey = 'date' | 'trust' | 'price'

export default function ShortlistPage() {
  const [sort, setSort] = useState<SortKey>('date')
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

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 text-purple animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 2 — Property Evaluation"
        title="My Shortlist"
        description="Your saved properties. Decode a Rightmove listing and click 'Save to shortlist' to track it here."
      />

      {isError && (
        <p className="text-sm text-red-500 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Failed to load shortlist.
        </p>
      )}

      {visible.length === 0 && !isLoading && (
        <GlassCard className="text-center py-12">
          <Bookmark className="w-8 h-8 text-plum-soft/30 mx-auto mb-3" />
          <p className="font-display text-lg text-plum mb-1">No properties saved yet</p>
          <p className="text-sm text-plum-soft mb-5">Decode a Rightmove listing and save it here to build your shortlist.</p>
          <button
            onClick={() => navigate('/evaluate')}
            className="inline-flex items-center gap-2 text-sm text-purple font-medium hover:underline"
          >
            <ArrowRight className="w-4 h-4" /> Go to Listing Decoder
          </button>
        </GlassCard>
      )}

      {visible.length > 0 && (
        <>
          {/* Sort + count header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-plum-soft">
              <span className="font-semibold text-plum">{visible.length}</span> propert{visible.length !== 1 ? 'ies' : 'y'} saved
            </p>
            <div className="flex gap-1 text-xs font-medium">
              {(['date', 'trust', 'price'] as SortKey[]).map(s => (
                <button key={s} onClick={() => setSort(s)}
                  className={cn('px-3 py-1.5 rounded-full transition-colors capitalize',
                    sort === s ? 'bg-purple text-white' : 'bg-white/50 text-plum-soft hover:text-plum border border-white/60'
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
