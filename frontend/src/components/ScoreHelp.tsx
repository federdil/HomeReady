import { useId, useState, type ReactNode } from 'react'
import { HelpCircle, X } from 'lucide-react'

/**
 * The "?" beside a dimension, and the panel it opens.
 *
 * The premise of the whole score is that it is an argument the buyer can
 * inspect rather than a verdict they have to accept — but that only holds if
 * the rule is somewhere they can read it. Before this, a property showed
 * "Safety 38" and a sentence of evidence, and nothing anywhere said what 38
 * meant, what it was measured against, or why it was not 0.
 *
 * Two questions, answered in that order:
 *   1. How is this scored, for any property? — the rule, with its real
 *      thresholds and its known weaknesses. Served from the API so it cannot
 *      drift away from the code that applies it.
 *   2. Why did *this* property get *this* number? — the measurement the score
 *      was actually derived from.
 *
 * Returned as a hook rather than one component because the two halves belong in
 * different places: the trigger sits inline next to the label, while the panel
 * needs the full width of the row beneath it. It also expands in flow rather
 * than floating — it has to work inside a scrolling side panel and inside a
 * horizontally scrolling table, where a positioned popover ends up clipped.
 */
export function useScoreHelp({
  label,
  method,
  source,
  score,
  evidence,
  unavailableReason,
}: {
  label: string
  method?: string
  source?: string
  /** Omit entirely on the profile form, where no property is in view yet. */
  score?: number | null
  evidence?: string
  unavailableReason?: string | null
}): { trigger: ReactNode; panel: ReactNode } {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  if (!method) return { trigger: null, panel: null }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(v => !v)}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={open ? `Hide how ${label} is scored` : `How is ${label} scored?`}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0 transition-colors ${
        open ? 'text-brand' : 'text-ink-faint hover:text-brand'
      }`}
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </button>
  )

  if (!open) return { trigger, panel: null }

  const paragraphs = method.split('\n\n').filter(Boolean)
  // `undefined` means "no property in view"; `null` means "this property has no
  // score", which is a different thing worth explaining.
  const hasProperty = score !== undefined

  const panel = (
    <div
      id={panelId}
      className="mt-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-[11px] leading-relaxed text-ink-muted"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="section-label">How {label.toLowerCase()} is scored</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={`Hide how ${label} is scored`}
          className="text-ink-faint hover:text-ink -mt-0.5 flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {paragraphs.map((paragraph, i) => (
        <p key={i} className={i ? 'mt-2' : undefined}>{paragraph}</p>
      ))}

      {hasProperty && (
        <div className="mt-3 pt-2.5 border-t border-border">
          <p className="section-label mb-1">
            {score === null
              ? 'Why this one has no score'
              : `Why this one scored ${score}`}
          </p>
          <p className="text-ink">
            {score === null
              ? unavailableReason || 'No data was available for this property.'
              : evidence || 'No further detail was recorded.'}
          </p>
        </div>
      )}

      {source && (
        <p className="mt-2.5 text-[10px] text-ink-faint">Source: {source}</p>
      )}
    </div>
  )

  return { trigger, panel }
}
