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
import { ProgressBar } from '@/components/ui'
import { Home, Loader2, CheckCircle, ChevronRight, LogOut, User } from 'lucide-react'
import type { JourneyStage } from '@/types'

const queryClient = new QueryClient()

const STAGE_META: Record<string, { path: string; emoji: string }> = {
  readiness:  { path: '/readiness',  emoji: '£' },
  evaluation: { path: '/evaluate',   emoji: '🔍' },
  offer:      { path: '/offer',      emoji: '🤝' },
  legal:      { path: '/legal',      emoji: '📄' },
  exchange:   { path: '/exchange',   emoji: '🔑' },
  homeowner:  { path: '/homeowner',  emoji: '🏡' },
}

function ComingSoon({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="max-w-2xl mx-auto py-20 text-center">
      <div className="glass-card inline-block p-8 mb-6">
        <span className="text-4xl">🔨</span>
      </div>
      <div className="stage-pill inline-flex mb-3">
        <span className="stage-pill-dot" />
        {stage}
      </div>
      <h1 className="font-display text-3xl text-plum mt-2 mb-3">{title}</h1>
      <p className="text-plum-soft text-sm">This stage is being built. Check back soon.</p>
    </div>
  )
}

function StageLink({ stage }: { stage: JourneyStage }) {
  const meta = STAGE_META[stage.stage]
  if (!meta) return null
  const isDone = stage.status === 'complete'
  return (
    <NavLink
      to={meta.path}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group ${
          isActive
            ? 'bg-purple-faint border-l-2 border-purple text-plum font-medium'
            : 'text-plum-soft hover:text-plum hover:bg-white/30'
        }`
      }
    >
      <span className="w-7 h-7 rounded-lg bg-white/50 flex items-center justify-center text-xs flex-shrink-0">
        {isDone ? <CheckCircle className="w-3.5 h-3.5 text-sage" /> : <span>{meta.emoji}</span>}
      </span>
      <span className="flex-1 truncate">{stage.label}</span>
      <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" />
    </NavLink>
  )
}

function Sidebar({ stages }: { stages: JourneyStage[] }) {
  const doneCount = stages.filter(s => s.status === 'complete').length
  const pct = Math.round((doneCount / stages.length) * 100)
  return (
    <aside className="w-64 flex-shrink-0 flex flex-col gap-4 sticky top-0 h-screen overflow-y-auto py-6 px-4">
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

function TopNav() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <header
      className="sticky top-0 z-50 flex items-center px-6 h-14 gap-3"
      style={{
        background: 'rgba(255,255,255,0.60)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.50)',
      }}
    >
      <Home className="w-4 h-4 text-purple" />
      <span className="font-display text-xl text-plum">HomeReady</span>
      <span
        className="text-xs px-2 py-0.5 rounded-full ml-1"
        style={{ background: 'rgba(130,100,200,0.12)', color: '#4A3280' }}
      >
        beta
      </span>
      <div className="ml-auto flex items-center gap-3">
        {user && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-plum-soft">
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline truncate max-w-[160px]">{user.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-plum-soft hover:text-plum transition-colors px-3 py-1.5 rounded-lg hover:bg-white/40"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </>
        )}
      </div>
    </header>
  )
}

// Redirects to /auth if not signed in
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
      <TopNav />
      <div className="flex flex-1 max-w-6xl mx-auto w-full px-4 gap-6">
        <Sidebar stages={stages} />
        <main className="flex-1 py-8 min-w-0">
          <Routes>
            <Route path="/"           element={<Navigate to="/readiness" replace />} />
            <Route path="/readiness"  element={<ReadinessPage />} />
            <Route path="/evaluate"   element={<EvaluatePage />} />
            <Route path="/evaluate/neighbourhood" element={<NeighbourhoodPage />} />
            <Route path="/offer"      element={<ComingSoon title="Offer & Negotiation" stage="Stage 3" />} />
            <Route path="/legal"      element={<LegalPage />} />
            <Route path="/exchange"   element={<ComingSoon title="Exchange & Completion" stage="Stage 5" />} />
            <Route path="/homeowner"  element={<HomeownerPage />} />
          </Routes>
        </main>
      </div>
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

// Redirects already-signed-in users away from /auth
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
