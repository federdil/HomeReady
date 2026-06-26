import { Link, useLocation } from 'react-router-dom'
import { CheckCircle, Circle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JourneyStage } from '@/types'

const STAGE_ROUTES: Record<string, string> = {
  readiness:  '/readiness',
  evaluation: '/evaluate',
  offer:      '/offer',
  legal:      '/legal',
  exchange:   '/exchange',
  homeowner:  '/homeowner',
}

interface Props {
  stages: JourneyStage[]
}

export function JourneyTracker({ stages }: Props) {
  const { pathname } = useLocation()

  return (
    <nav className="w-full bg-white border-b border-slate-100 px-6 py-4">
      <ol className="flex items-center justify-between max-w-4xl mx-auto">
        {stages.map((stage, i) => {
          const route = STAGE_ROUTES[stage.stage]
          const isActive = pathname.startsWith(route)
          const isDone   = stage.status === 'complete'
          const isLocked = stages.slice(0, i).some(s => s.status === 'not_started') && !isDone

          return (
            <li key={stage.stage} className="flex items-center flex-1 last:flex-none">
              <Link
                to={isLocked ? '#' : route}
                className={cn(
                  'flex flex-col items-center group',
                  isLocked && 'pointer-events-none opacity-40'
                )}
              >
                {/* Node */}
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                  isDone   && 'bg-emerald-500 text-white',
                  isActive && !isDone && 'bg-brand text-white ring-4 ring-brand/20',
                  !isDone && !isActive && 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                )}>
                  {isDone
                    ? <CheckCircle className="w-5 h-5" />
                    : stage.status === 'in_progress'
                      ? <Clock className="w-4 h-4" />
                      : <span className="text-xs font-bold">{i + 1}</span>
                  }
                </div>

                {/* Label */}
                <span className={cn(
                  'mt-1.5 text-[11px] font-medium text-center leading-tight hidden md:block',
                  isActive ? 'text-brand' : 'text-slate-500'
                )}>
                  {stage.label}
                </span>
              </Link>

              {/* Connector */}
              {i < stages.length - 1 && (
                <div className={cn(
                  'flex-1 h-0.5 mx-2',
                  isDone ? 'bg-emerald-400' : 'bg-slate-200'
                )} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
