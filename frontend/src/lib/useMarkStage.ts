import { useQueryClient } from '@tanstack/react-query'
import { markStageProgress } from './api'

export function useMarkStage() {
  const qc = useQueryClient()
  return async (stage: string, status: 'in_progress' | 'complete') => {
    try {
      await markStageProgress(stage, status)
      qc.invalidateQueries({ queryKey: ['journey-stages'] })
    } catch {
      // non-critical — don't surface to user
    }
  }
}
