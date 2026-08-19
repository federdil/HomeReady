import type { DimensionKey, DimensionScore } from '@/types'

/**
 * Client-side mirror of the backend's scoring rule, so moving a priority
 * slider re-ranks instantly instead of waiting on a round trip.
 *
 * It must stay identical in behaviour to `combine()` in
 * backend/app/services/scoring.py: a dimension with no score leaves the
 * calculation entirely and the remaining weights renormalise. Never impute a
 * midpoint — that would let a property with absent data outrank one with
 * genuinely poor data.
 */
export function computeFit(
  dimensions: DimensionScore[] | undefined,
  weights: Record<DimensionKey, number>,
): { score: number | null; coverage: number } {
  if (!dimensions?.length) return { score: null, coverage: 0 }

  let weighted = 0
  let availableWeight = 0
  let totalWeight = 0

  for (const dim of dimensions) {
    const weight = weights[dim.key] ?? 0
    totalWeight += weight
    if (dim.score !== null && weight > 0) {
      weighted += dim.score * weight
      availableWeight += weight
    }
  }

  return {
    score: availableWeight ? Math.round(weighted / availableWeight) : null,
    coverage: totalWeight ? Math.round((availableWeight / totalWeight) * 100) : 0,
  }
}

/**
 * Fit score colour — a diverging ramp with a neutral midpoint.
 *
 * Deliberately NOT red-amber-green. Red and green are the one pair that around
 * one in twelve men cannot separate, so the old ramp was unreadable for a real
 * share of users. This pair was checked with the palette validator: orange and
 * blue separate at ΔE 17 under protanopia and 31 under tritanopia, against a
 * floor of 8 — and both stay clear of the brand colour so a score never reads
 * as chrome.
 *
 * Three bands, not four. A 52 against a 58 is noise, and giving it a colour
 * boundary implied a precision the score does not have.
 */
export const FIT_STRONG = '#0284C7'
export const FIT_MIXED  = '#78716C'
export const FIT_POOR   = '#C2410C'
export const FIT_NONE   = '#A89A9F'

export function fitColour(score: number | null): string {
  if (score === null) return FIT_NONE
  if (score >= 65) return FIT_STRONG
  if (score >= 45) return FIT_MIXED
  return FIT_POOR
}

export function fitLabel(score: number | null): string {
  if (score === null) return 'Not scored'
  if (score >= 65) return 'Strong match'
  if (score >= 45) return 'Mixed'
  return 'Poor match'
}

/**
 * Colour is never the only channel. Every chip carries its number, and an
 * unscored property is drawn as an outline rather than a third shade of grey —
 * "we don't know" is a different kind of answer from "we scored it low", so it
 * gets a different shape, not just a different fill.
 */
export function fitIsOutlined(score: number | null): boolean {
  return score === null
}
