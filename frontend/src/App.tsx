import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { getJourneyStages } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth'
import ReadinessPage from '@/pages/ReadinessPage'
import EvaluatePage from '@/pages/EvaluatePage'
import NeighbourhoodPage from '@/pages/NeighbourhoodPage'
import LegalPage from '@/pages/LegalPage'
import AuthPage from '@/pages/AuthPage'
import HomeownerPage from '@/pages/HomeownerPage'
import OfferPage from '@/pages/OfferPage'
import { ProgressBar } from '@/components/ui'
import { Home, Loader2, CheckCircle, ChevronRight, LogOut, User, PoundSterling, Search, FileText, ClipboardCheck, Menu, X, Handshake, Key } from 'lucide-react'
import type { JourneyStage } from '@/types'

const queryClient = new QueryClient()

const STAGE_META: Record<string, { path: string; emoji: string; icon: React.ReactNode }> = {
  readiness:  { path: '/readiness',  emoji: '£',  icon: <PoundSterling className="w-5 h-5" /> },
  evaluation: { path: '/evaluate',   emoji: '🔍', icon: <Search className="w-5 h-5" /> },
  offer:      { path: '/offer',      emoji: '🤝', icon: <Handshake className="w-5 h-5" /> },
  legal:      { path: '/legal',      emoji: '📄', icon: <FileText className="w-5 h-5" /> },
  exchange:   { path: '/exchange',   emoji: '🔑', icon: <Key className="w-5 h-5" /> },
  homeowner:  { path: '/homeowner',  emoji: '🏡', icon: <ClipboardCheck className="w-5 h-5" /> },
}

const COMING_SOON = new Set(['exchange'])

function ComingSoon({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="max-w-2xl mx-auto py-12 md:py-20 text-center px-4">
      <div className="glass-card inline-block p-8 mb-6">
        <span className="text-4xl">🔨</span>
      </div>
      <div className="stage-pill inline-flex mb-3">
        <span className="stage-pill-dot" />
        {stage}
      </div>
      <h1 className="font-display text-2xl md:text-3xl text-plum mt-2 mb-3">{title}</h1>
      <p className="text-plum-soft text-sm">This stage is being built. Check back soon.</p>
    </div>
  )
}

function StageLink({ stage }: { stage: JourneyStage }) {
  const meta = STAGE_META[stage.stage]
  if (!meta) return null
  const isDone = stage.status === 'complete'
  const isComingSoon = COMING_SOON.has(stage.stage)
  return (
    <NavLink
      to={meta.path}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group ${
          isActive
            ? 'bg-purple-faint border-l-2 border-purple text-plum font-medium'
            : isComingSoon
            ? 'text-plum-soft/40 cursor-default pointer-events-none'
            : 'text-plum-soft hover:text-plum hover:bg-white/30'
        }`
      }
    >
      <span className="w-7 h-7 rounded-lg bg-white/50 flex items-center justify-center text-xs flex-shrink-0">
        {isDone ? <CheckCircle className="w-3.5 h-3.5 text-sage" /> : <span>{meta.emoji}</span>}
      </span>
      <span className="flex-1 truncate">{stage.label}</span>
      {isComingSoon
        ? <span className="text-[10px] text-plum-soft/40 shrink-0">soon</span>
        : <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" />
      }
    </NavLink>
  )
}

function Sidebar({ stages }: { stages: JourneyStage[] }) {
  const doneCount = stages.filter(s => s.status === 'complete').length
  const pct = stages.length > 0 ? Math.round((doneCount / stages.length) * 100) : 0
  return (
    <aside className="hidden md:flex w-56 lg:w-64 flex-shrink-0 flex-col gap-4 sticky top-0 h-screen overflow-y-auto py-6 px-3 lg:px-4">
      <div className="glass-card px-4 py-4">
        <p className="text-xs font-medium text-plum-soft uppercase tracking-wide mb-3">Your journey</p>
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-display text-2xl text-plum">{doneCount}/{stages.length}</span>
          <span className="text-xs text-plum-soft">{pct}% complete</span>
        </div>
        <ProgressBar value={pct} />
      </div>
      <div className="glass-card px-2 py-2 flex flex-col gap-0.5">
        {stages.map(s => <StageLink key={s.stage} stage={s} />)}
      </div>
      <div className="glass-card px-4 py-4 mt-auto">
        <p className="text-xs font-medium text-plum-soft uppercase tracking-wide mb-2">Tip</p>
        <p className="text-xs text-plum leading-relaxed">
          Start with the Cost Calculator to understand your true budget before viewing any properties.
        </p>
      </div>
    </aside>
  )
}

function MobileDrawer({ stages, open, onClose }: { stages: JourneyStage[]; open: boolean; onClose: () => void }) {
  const doneCount = stages.filter(s => s.status === 'complete').length
  const pct = stages.length > 0 ? Math.round((doneCount / stages.length) * 100) : 0

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col gap-4 py-6 px-4 md:hidden"
        style={{
          background: 'rgba(242,237,248,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255,255,255,0.60)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Home className="w-4 h-4 text-purple" />
            <span className="font-display text-lg text-plum">HomeReady</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/40 text-plum-soft hover:text-plum transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="glass-card px-4 py-3">
          <p className="text-xs font-medium text-plum-soft uppercase tracking-wide mb-2">Your journey</p>
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-display text-xl text-plum">{doneCount}/{stages.length}</span>
            <span className="text-xs text-plum-soft">{pct}% complete</span>
          </div>
          <ProgressBar value={pct} />
        </div>

        <div className="glass-card px-2 py-2 flex flex-col gap-0.5 flex-1 overflow-y-auto" onClick={onClose}>
          {stages.map(s => <StageLink key={s.stage} stage={s} />)}
        </div>
      </div>
    </>
  )
}

function BottomNav({ stages }: { stages: JourneyStage[] }) {
  const primaryStages = ['readiness', 'evaluation', 'legal', 'homeowner']
  const filtered = stages.filter(s => primaryStages.includes(s.stage))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      style={{
        background: 'rgba(242,237,248,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.60)',
      }}
    >
      <div className="flex items-stretch">
        {filtered.map(stage => {
          const meta = STAGE_META[stage.stage]
          if (!meta) return null
          const isDone = stage.status === 'complete'
          const shortLabel: Record<string, string> = {
            readiness: 'Costs',
            evaluation: 'Evaluate',
            legal: 'Legal',
            homeowner: 'Checklist',
          }
          return (
            <NavLink
              key={stage.stage}
              to={meta.path}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-purple' : 'text-plum-soft'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`relative transition-transform ${isActive ? 'scale-110' : ''}`}>
                    {isDone
                      ? <CheckCircle className="w-5 h-5 text-sage" />
                      : <span className={isActive ? 'text-purple' : 'text-plum-soft/60'}>{meta.icon}</span>
                    }
                    {isActive && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-purple" />
                    )}
                  </span>
                  <span className={isActive ? 'text-purple' : 'text-plum-soft'}>
                    {shortLabel[stage.stage] ?? stage.label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
      {/* Safe area padding for iPhone home indicator */}
      <div className="h-safe-bottom" style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  )
}

function TopNav({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <header
      className="sticky top-0 z-50 flex items-center px-4 md:px-6 h-14 gap-3"
      style={{
        background: 'rgba(255,255,255,0.60)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.50)',
      }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-white/40 text-plum-soft hover:text-plum transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <Home className="w-4 h-4 text-purple hidden md:block" />
      <span className="font-display text-lg md:text-xl text-plum">HomeReady</span>
      <span
        className="text-xs px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(130,100,200,0.12)', color: '#4A3280' }}
      >
        beta
      </span>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {user && (
          <>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-plum-soft">
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[140px]">{user.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-plum-soft hover:text-plum transition-colors px-2.5 py-1.5 rounded-lg hover:bg-white/40"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </>
        )}
      </div>
    </header>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-purple animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['journey-stages'],
    queryFn: getJourneyStages,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-purple animate-spin" />
      </div>
    )
  }

  const stages = data?.stages ?? []

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav onMenuClick={() => setDrawerOpen(true)} />
      <MobileDrawer stages={stages} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex flex-1 max-w-6xl mx-auto w-full px-3 md:px-4 gap-4 lg:gap-6">
        <Sidebar stages={stages} />
        <main className="flex-1 py-6 md:py-8 min-w-0 pb-24 md:pb-8">
          <Routes>
            <Route path="/"           element={<Navigate to="/readiness" replace />} />
            <Route path="/readiness"  element={<ReadinessPage />} />
            <Route path="/evaluate"   element={<EvaluatePage />} />
            <Route path="/evaluate/neighbourhood" element={<NeighbourhoodPage />} />
            <Route path="/offer"      element={<OfferPage />} />
            <Route path="/legal"      element={<LegalPage />} />
            <Route path="/exchange"   element={<ComingSoon title="Exchange & Completion" stage="Stage 5" />} />
            <Route path="/homeowner"  element={<HomeownerPage />} />
          </Routes>
        </main>
      </div>
      <BottomNav stages={stages} />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <div className="bg-wash" aria-hidden="true" />
          <Routes>
            <Route path="/auth" element={<AuthPublic />} />
            <Route path="/*" element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function AuthPublic() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/readiness'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-purple animate-spin" />
      </div>
    )
  }

  if (user) return <Navigate to={from} replace />

  return <AuthPage />
}
