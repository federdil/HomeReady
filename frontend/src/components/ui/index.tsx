import { cn } from '@/lib/utils'
import { Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react'

// ── Card components ───────────────────────────────────────────────────────────

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('card p-6', className)}>
      {children}
    </div>
  )
}

// Backward-compat aliases
export function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('glass-card p-5', className)}>{children}</div>
}

export function SolidCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('card p-6', className)}>{children}</div>
}

export function TintedCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('card-tinted p-5', className)}>{children}</div>
}

// ── Stage pill ────────────────────────────────────────────────────────────────

export function StagePill({ label }: { label: string }) {
  return (
    <span className="stage-pill">
      <span className="stage-pill-dot" />
      {label}
    </span>
  )
}

// ── Risk badge ────────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'amber' | 'red' | 'critical'

const riskConfig: Record<RiskLevel, { className: string; dot: string }> = {
  low:      { className: 'badge-success', dot: 'bg-success' },
  amber:    { className: 'badge-warning', dot: 'bg-warning' },
  red:      { className: 'badge-danger',  dot: 'bg-danger' },
  critical: { className: 'badge-danger',  dot: 'bg-danger' },
}

export function RiskBadge({ level, label }: { level: RiskLevel; label: string }) {
  const cfg = riskConfig[level] ?? riskConfig.amber
  return (
    <span className={cn('badge', cfg.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
      {label}
    </span>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('progress-track', className)}>
      <div
        className="progress-fill"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  )
}

// ── Buttons ───────────────────────────────────────────────────────────────────

export function PrimaryButton({
  children, onClick, loading, type = 'button', disabled, className,
}: {
  children: React.ReactNode
  onClick?: () => void
  loading?: boolean
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn('btn-primary', className)}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
}

export function SecondaryButton({
  children, onClick, className,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} className={cn('btn-secondary', className)}>
      {children}
    </button>
  )
}

export function GhostButton({
  children, onClick, className,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} className={cn('btn-ghost', className)}>
      {children}
    </button>
  )
}

// ── Page header ───────────────────────────────────────────────────────────────

export function PageHeader({
  stage, title, description, action,
}: {
  stage: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-header">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <StagePill label={stage} />
          <h1 className="font-display text-2xl md:text-3xl text-ink mt-3 mb-2 text-balance">
            {title}
          </h1>
          <p className="text-base text-ink-muted max-w-2xl leading-relaxed">
            {description}
          </p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}

// ── Form field ────────────────────────────────────────────────────────────────

export function FormField({
  label, error, hint, children, required,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-ink">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-ink-faint flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" />
          {hint}
        </p>
      )}
      {error && (
        <p className="text-xs text-danger flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

export function SectionHeader({
  icon, title, subtitle, badge,
}: {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  badge?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {icon && (
        <div className="w-8 h-8 rounded-lg bg-brand-light flex items-center justify-center text-brand shrink-0">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-display text-lg text-ink">{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
    </div>
  )
}

// ── Callout ───────────────────────────────────────────────────────────────────

type CalloutVariant = 'info' | 'success' | 'warning' | 'danger'

const calloutIcons: Record<CalloutVariant, React.ReactNode> = {
  info:    <Info className="w-4 h-4 shrink-0 mt-0.5" />,
  success: <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />,
  warning: <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />,
  danger:  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />,
}

export function Callout({
  variant = 'info', title, children,
}: {
  variant?: CalloutVariant
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('callout', `callout-${variant}`)}>
      {calloutIcons[variant]}
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold mb-0.5">{title}</p>}
        <div className="text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon, title, description, action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-4 text-ink-faint">
        {icon}
      </div>
      <h3 className="font-display text-lg text-ink mb-2">{title}</h3>
      <p className="text-sm text-ink-muted max-w-xs leading-relaxed mb-5">{description}</p>
      {action}
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

// ── Stat card ─────────────────────────────────────────────────────────────────

export function StatCard({
  label, value, sub, accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'success' | 'warning' | 'danger' | 'brand'
}) {
  const accentColor = {
    success: 'text-success',
    warning: 'text-warning',
    danger:  'text-danger',
    brand:   'text-brand',
  }[accent ?? 'brand'] ?? 'text-ink'

  return (
    <div className="stat-card">
      <p className="stat-card-label">{label}</p>
      <p className={cn('stat-card-value', accentColor)}>{value}</p>
      {sub && <p className="stat-card-sub">{sub}</p>}
    </div>
  )
}
