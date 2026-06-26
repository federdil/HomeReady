import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

// ── GlassCard ────────────────────────────────────────────────────────────────
export function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('glass-card p-5', className)}>{children}</div>
}

// ── SolidCard — for content (forms, results, data) ───────────────────────────
export function SolidCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('solid-card p-5', className)}>{children}</div>
}

// ── StagePill ────────────────────────────────────────────────────────────────
export function StagePill({ label }: { label: string }) {
  return (
    <span className="stage-pill">
      <span className="stage-pill-dot" />
      {label}
    </span>
  )
}

// ── RiskBadge ────────────────────────────────────────────────────────────────
type RiskLevel = 'low' | 'amber' | 'red' | 'critical'

const riskStyles: Record<RiskLevel, { dot: string; text: string; bg: string }> = {
  low:      { dot: 'bg-sage',  text: 'text-sage',  bg: 'bg-sage-light' },
  amber:    { dot: 'bg-amber', text: 'text-amber', bg: 'bg-amber-light' },
  red:      { dot: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' },
  critical: { dot: 'bg-red-600', text: 'text-red-700 font-semibold', bg: 'bg-red-50' },
}

export function RiskBadge({ level, label }: { level: RiskLevel; label: string }) {
  const s = riskStyles[level] ?? riskStyles.amber
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full', s.bg, s.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {label}
    </span>
  )
}

// ── ProgressBar ──────────────────────────────────────────────────────────────
export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

// ── PrimaryButton ────────────────────────────────────────────────────────────
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
    <button type={type} onClick={onClick} disabled={disabled || loading} className={cn('btn-primary', className)}>
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  )
}

// ── GhostButton ──────────────────────────────────────────────────────────────
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

// ── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({ stage, title, description }: { stage: string; title: string; description: string }) {
  return (
    <div className="mb-8">
      <StagePill label={stage} />
      <h1 className="font-display text-3xl text-plum mt-2 mb-2">{title}</h1>
      <p className="text-plum-soft text-sm max-w-xl leading-relaxed">{description}</p>
    </div>
  )
}

// ── FormField ────────────────────────────────────────────────────────────────
export function FormField({
  label, error, hint, children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-plum mb-1.5">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-plum-soft">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
