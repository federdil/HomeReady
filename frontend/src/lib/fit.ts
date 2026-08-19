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

/** Colour ramp for map pins and score chips. Deliberately not red/green only —
 *  mid-range needs to read as "mixed", not "bad". */
export function fitColour(score: number | null): string {
  if (score === null) return '#9CA3AF'
  if (score >= 75) return '#16A34A'
  if (score >= 55) return '#65A30D'
  if (score >= 40) return '#D97706'
  return '#DC2626'
}

export function fitLabel(score: number | null): string {
  if (score === null) return 'Not scored'
  if (score >= 75) return 'Strong match'
  if (score >= 55) return 'Good match'
  if (score >= 40) return 'Mixed'
  return 'Poor match'
}
