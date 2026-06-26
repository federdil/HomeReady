import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChecklist, toggleChecklistItem } from '@/lib/api'
import type { ChecklistItem } from '@/types'
import { SolidCard, GlassCard, PageHeader, ProgressBar } from '@/components/ui'
import { CheckCircle, Circle, Clock, AlertTriangle, Star, FolderOpen, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORY_META = {
  urgent:    { label: 'Urgent',    icon: AlertTriangle, color: 'text-red-500',   bg: 'bg-red-50',   border: 'border-red-200'  },
  important: { label: 'Important', icon: Star,          color: 'text-amber',     bg: 'bg-amber-light', border: 'border-amber/30' },
  admin:     { label: 'Admin',     icon: FolderOpen,    color: 'text-purple',    bg: 'bg-dusk',     border: 'border-dusk-deep' },
}

function DeadlineBadge({ days }: { days: number | null }) {
  if (!days) return null
  const label = days === 1 ? 'Day 1' : `Within ${days} days`
  const urgent = days <= 7
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
      urgent ? 'bg-red-50 text-red-600' : 'bg-dusk text-plum-soft'
    )}>
      <Clock className="w-3 h-3" />
      {label}
    </span>
  )
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => toggleChecklistItem(item.id, !item.is_complete),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['checklist'] })
      const prev = qc.getQueryData(['checklist'])
      qc.setQueryData(['checklist'], (old: any) => ({
        ...old,
        complete: old.complete + (item.is_complete ? -1 : 1),
        items: old.items.map((i: ChecklistItem) =>
          i.id === item.id ? { ...i, is_complete: !i.is_complete } : i
        ),
      }))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['checklist'], ctx.prev)
    },
  })

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className={cn(
        'w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all',
        'hover:bg-white/60 active:scale-[0.99]',
        item.is_complete && 'opacity-60'
      )}
    >
      <span className="mt-0.5 shrink-0">
        {mutation.isPending
          ? <Loader2 className="w-5 h-5 text-purple animate-spin" />
          : item.is_complete
          ? <CheckCircle className="w-5 h-5 text-sage" />
          : <Circle className="w-5 h-5 text-plum-soft/40" />
        }
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={cn('text-sm font-medium', item.is_complete ? 'line-through text-plum-soft' : 'text-plum')}>
            {item.title}
          </span>
          <DeadlineBadge days={item.deadline_days} />
        </div>
        <p className="text-xs text-plum-soft leading-relaxed">{item.description}</p>
      </div>
    </button>
  )
}

function CategorySection({ category, items }: { category: 'urgent' | 'important' | 'admin'; items: ChecklistItem[] }) {
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  const done = items.filter(i => i.is_complete).length
  return (
    <SolidCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', meta.color)} />
          <h3 className="font-display text-base text-plum">{meta.label}</h3>
        </div>
        <span className="text-xs text-plum-soft">{done}/{items.length} done</span>
      </div>
      <div className="divide-y divide-white/40">
        {items.map(item => <ChecklistRow key={item.id} item={item} />)}
      </div>
    </SolidCard>
  )
}

export default function HomeownerPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['checklist'],
    queryFn: getChecklist,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-purple animate-spin" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-red-500 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Failed to load checklist. Make sure you're signed in.
        </p>
      </div>
    )
  }

  const { items = [], total, complete } = data!
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0

  const urgent    = items.filter(i => i.category === 'urgent')
  const important = items.filter(i => i.category === 'important')
  const admin     = items.filter(i => i.category === 'admin')

  return (
    <div className="space-y-6">
      <PageHeader
        stage="Stage 6 — Homeowner Mode"
        title="Post-Completion Checklist"
        description="You've got the keys — now make it official. Work through these tasks in the first weeks to protect yourself legally and practically."
      />

      {/* Progress hero */}
      <GlassCard className="flex items-center gap-6 px-6 py-5">
        <div className="shrink-0 text-center w-20">
          <p className="font-display text-4xl text-plum">{pct}%</p>
          <p className="text-xs text-plum-soft mt-0.5">complete</p>
        </div>
        <div className="flex-1">
          <div className="flex justify-between mb-2 text-xs text-plum-soft">
            <span>{complete} tasks done</span>
            <span>{total - complete} remaining</span>
          </div>
          <ProgressBar value={pct} />
          {pct === 100 && (
            <p className="text-xs text-sage font-medium mt-2 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> All done — you're fully set up!
            </p>
          )}
        </div>
      </GlassCard>

      <div className="space-y-4 animate-results">
        {urgent.length    > 0 && <CategorySection category="urgent"    items={urgent} />}
        {important.length > 0 && <CategorySection category="important" items={important} />}
        {admin.length     > 0 && <CategorySection category="admin"     items={admin} />}
      </div>
    </div>
  )
}
