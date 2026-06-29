import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getChecklist, toggleChecklistItem } from '@/lib/api'
import type { ChecklistItem } from '@/types'
import { SolidCard, PageHeader, ProgressBar, Callout } from '@/components/ui'
import { CheckCircle, Circle, Clock, AlertTriangle, Star, FolderOpen, Loader2, Key } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORY_META = {
  urgent: {
    label: 'Urgent',
    icon: AlertTriangle,
    iconColor: 'text-danger',
    iconBg: 'bg-danger/10',
    border: 'border-danger/20',
    headerBg: 'bg-danger-bg/40',
  },
  important: {
    label: 'Important',
    icon: Star,
    iconColor: 'text-warning',
    iconBg: 'bg-warning/10',
    border: 'border-warning/20',
    headerBg: 'bg-warning-bg/40',
  },
  admin: {
    label: 'Admin',
    icon: FolderOpen,
    iconColor: 'text-brand',
    iconBg: 'bg-brand-light',
    border: 'border-border',
    headerBg: 'bg-surface-2',
  },
}

function DeadlineBadge({ days }: { days: number | null }) {
  if (!days) return null
  const label  = days === 1 ? 'Day 1' : `Within ${days} days`
  const urgent = days <= 7
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
      urgent ? 'bg-danger-bg text-danger border border-danger/20' : 'bg-surface-2 border border-border text-ink-muted'
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
        'w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all rounded-xl',
        'hover:bg-surface-2 active:scale-[0.99] group',
        item.is_complete && 'opacity-55'
      )}
    >
      {/* Checkbox */}
      <span className="mt-0.5 shrink-0 transition-transform group-hover:scale-110">
        {mutation.isPending
          ? <Loader2 className="w-5 h-5 text-brand animate-spin" />
          : item.is_complete
          ? <CheckCircle className="w-5 h-5 text-success" />
          : <Circle className="w-5 h-5 text-border group-hover:text-brand transition-colors" />
        }
      </span>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={cn(
            'text-sm font-semibold transition-colors',
            item.is_complete ? 'line-through text-ink-faint' : 'text-ink'
          )}>
            {item.title}
          </span>
          <DeadlineBadge days={item.deadline_days} />
        </div>
        <p className="text-xs text-ink-muted leading-relaxed">{item.description}</p>
      </div>
    </button>
  )
}

function CategorySection({ category, items }: { category: 'urgent' | 'important' | 'admin'; items: ChecklistItem[] }) {
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  const done = items.filter(i => i.is_complete).length
  const allDone = done === items.length

  return (
    <div className={cn('card overflow-hidden border', meta.border)}>
      {/* Category header */}
      <div className={cn('flex items-center justify-between px-4 py-3.5 border-b border-border', meta.headerBg)}>
        <div className="flex items-center gap-2.5">
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', meta.iconBg)}>
            <Icon className={cn('w-3.5 h-3.5', meta.iconColor)} />
          </div>
          <h3 className="font-display text-base text-ink">{meta.label}</h3>
          {allDone && (
            <span className="badge badge-success text-[10px]">All done</span>
          )}
        </div>
        <span className="text-xs font-semibold text-ink-muted tabular-nums">
          {done}/{items.length}
        </span>
      </div>
      {/* Items */}
      <div className="divide-y divide-border bg-white">
        {items.map(item => <ChecklistRow key={item.id} item={item} />)}
      </div>
    </div>
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
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-brand animate-spin" />
          <p className="text-sm text-ink-muted">Loading your checklist…</p>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="py-12">
        <Callout variant="danger">
          Failed to load checklist. Make sure you're signed in and try refreshing.
        </Callout>
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
      <div className="card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5"
        style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9F8 100%)', borderColor: 'rgba(91,61,174,0.15)' }}
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
            <Key className="w-7 h-7 text-brand" />
          </div>
          <div>
            <p className="font-display text-4xl text-brand">{pct}%</p>
            <p className="text-sm text-ink-muted font-medium">complete</p>
          </div>
        </div>
        <div className="flex-1 w-full sm:w-auto">
          <div className="flex justify-between mb-2 text-xs font-semibold text-ink-muted">
            <span>{complete} tasks done</span>
            <span>{total - complete} remaining</span>
          </div>
          <ProgressBar value={pct} />
          {pct === 100 && (
            <p className="text-sm text-success font-semibold mt-3 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> All done — you're fully set up!
            </p>
          )}
        </div>
      </div>

      {/* Checklist sections */}
      <div className="space-y-4 animate-results">
        {urgent.length    > 0 && <CategorySection category="urgent"    items={urgent} />}
        {important.length > 0 && <CategorySection category="important" items={important} />}
        {admin.length     > 0 && <CategorySection category="admin"     items={admin} />}
      </div>
    </div>
  )
}
