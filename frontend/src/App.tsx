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
import ShortlistPage from '@/pages/ShortlistPage'
import { ProgressBar } from '@/components/ui'
import {
  Home, Loader2, CheckCircle, ChevronRight, LogOut, User,
  PoundSterling, Search, FileText, ClipboardCheck, Menu, X,
  Handshake, Key, Lock, Sparkles, Bookmark,
} from 'lucide-react'
import type { JourneyStage } from '@/types'

const queryClient = new QueryClient()

const STAGE_META: Record<string, { path: string; icon: React.ReactNode; shortLabel: string }> = {
  readiness:  { path: '/readiness',  icon: <PoundSterling className="w-4 h-4" />,  shortLabel: 'Costs' },
  evaluation: { path: '/evaluate',   icon: <Search className="w-4 h-4" />,         shortLabel: 'Evaluate' },
  offer:      { path: '/offer',      icon: <Handshake className="w-4 h-4" />,      shortLabel: 'Offer' },
  legal:      { path: '/legal',      icon: <FileText className="w-4 h-4" />,       shortLabel: 'Legal' },
  exchange:   { path: '/exchange',   icon: <Key className="w-4 h-4" />,            shortLabel: 'Exchange' },
  homeowner:  { path: '/homeowner',  icon: <ClipboardCheck className="w-4 h-4" />, shortLabel: 'Checklist' },
}

const COMING_SOON = new Set(['exchange'])

function ComingSoon({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="max-w-lg mx-auto py-16 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto mb-6">
        <Lock className="w-7 h-7 text-ink-faint" />
      </div>
      <span className="stage-pill inline-flex mb-4">
        <span className="stage-pill-dot" />
        {stage}
      </span>
      <h1 className="font-display text-2xl text-ink mt-3 mb-3">{title}</h1>
      <p className="text-base text-ink-muted leading-relaxed">
        This stage is currently being built. Check back soon — we're working on it.
      </p>
    </div>
  )
}

function StageLink({ stage, index }: { stage: JourneyStage; index: number }) {
  const meta = STAGE_META[stage.stage]
  if (!meta) return null
  const isDone = stage.status === 'complete'
  const isComingSoon = COMING_SOON.has(stage.stage)

  return (
    <NavLink
      to={meta.path}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group relative ${
          isActive
            ? 'bg-brand-light text-brand font-semibold border-l-2 border-brand ml-0 pl-[10px]'
            : isComingSoon
            ? 'text-ink-faint cursor-default pointer-events-none'
            : 'text-ink-muted hover:text-ink hover:bg-surface-2'
        }`
      }
    >
      {/* Step number or check */}
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0 transition-colors ${
        isDone
          ? 'bg-success/10 text-success'
          : 'bg-surface-2 border border-border text-ink-faint group-hover:border-brand/30 group-hover:text-brand'
      }`}>
        {isDone
          ? <CheckCircle className="w-3.5 h-3.5" />
          : isComingSoon
          ? <Lock className="w-3 h-3" />
          : <span className="font-semibold text-[11px]">{index + 1}</span>
        }
      </span>
      <span className="flex-1 truncate">{stage.label}</span>
      {isComingSoon
        ? <span className="text-[10px] text-ink-faint shrink-0 font-medium">Soon</span>
        : <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" />
      }
    </NavLink>
  )
}

function Sidebar({ stages }: { stages: JourneyStage[] }) {
  const doneCount = stages.filter(s => s.status === 'complete').length
  const pct = stages.length > 0 ? Math.round((doneCount / stages.length) * 100) : 0

  return (
    <aside className="hidden md:flex w-60 lg:w-64 flex-shrink-0 flex-col gap-3 sticky top-0 h-screen overflow-y-auto py-6 px-3 lg:px-4">
      {/* Journey progress card */}
      <div className="glass-card px-4 py-4">
        <p className="section-label mb-3">Your Journey</p>
        <div className="flex items-end justify-between mb-3">
          <div>
            <span className="font-display text-3xl text-ink">{doneCount}</span>
            <span className="text-ink-muted text-sm font-medium">/{stages.length} stages</span>
          </div>
          <span className="text-xs font-semibold text-brand bg-brand-light px-2 py-1 rounded-full">
            {pct}% done
          </span>
        </div>
        <ProgressBar value={pct} />
      </div>

      {/* Stage navigation */}
      <div className="glass-card px-2 py-2 flex flex-col gap-0.5">
        {stages.map((s, i) => <StageLink key={s.stage} stage={s} index={i} />)}
      </div>

      {/* My Shortlist */}
      <div className="glass-card px-2 py-2">
        <NavLink
          to="/shortlist"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group ${
              isActive
                ? 'bg-brand-light text-brand font-semibold border-l-2 border-brand pl-[10px]'
                : 'text-ink-muted hover:text-ink hover:bg-surface-2'
            }`
          }
        >
          <span className="w-7 h-7 rounded-lg bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 group-hover:border-brand/30 group-hover:text-brand transition-colors">
            <Bookmark className="w-3.5 h-3.5" />
          </span>
          <span className="flex-1">My Shortlist</span>
          <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity flex-shrink-0" />
        </NavLink>
      </div>

      {/* Tip card */}
      <div className="glass-card px-4 py-4 mt-auto">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <p className="section-label">Pro tip</p>
        </div>
        <p className="text-xs text-ink-muted leading-relaxed">
          Complete the Cost Calculator first to understand your true budget before viewing any properties.
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
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />
      <div
        className="fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col gap-3 py-6 px-4 md:hidden"
        style={{
          background: 'rgba(249,250,251,0.98)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid #E5E7EB',
          boxShadow: '4px 0 24px rgba(0,0,0,0.10)',
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <Home className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-display text-lg text-ink">HomeReady</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="card px-4 py-3">
          <p className="section-label mb-2">Your Journey</p>
          <div className="flex items-end justify-between mb-2">
            <span className="font-display text-2xl text-ink">{doneCount}/{stages.length}</span>
            <span className="text-xs font-semibold text-brand">{pct}%</span>
          </div>
          <ProgressBar value={pct} />
        </div>

        <div className="card px-2 py-2 flex flex-col gap-0.5 flex-1 overflow-y-auto" onClick={onClose}>
          {stages.map((s, i) => <StageLink key={s.stage} stage={s} index={i} />)}
        </div>
      </div>
    </>
  )
}

function BottomNav({ stages }: { stages: JourneyStage[] }) {
  const allStages = stages.filter(s => STAGE_META[s.stage])

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
      style={{
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid #E5E7EB',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-stretch overflow-x-auto scrollbar-none">
        {allStages.map(stage => {
          const meta = STAGE_META[stage.stage]
          if (!meta) return null
          const isDone = stage.status === 'complete'
          const isComingSoon = COMING_SOON.has(stage.stage)
          return (
            <NavLink
              key={stage.stage}
              to={meta.path}
              className={({ isActive }) =>
                `flex-1 min-w-[56px] flex flex-col items-center gap-1 py-2.5 px-2 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-brand' : isComingSoon ? 'text-ink-faint' : 'text-ink-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`relative w-6 h-6 flex items-center justify-center transition-transform ${isActive ? 'scale-110' : ''}`}>
                    {isDone
                      ? <CheckCircle className="w-5 h-5 text-success" />
                      : isComingSoon
                      ? <Lock className="w-4 h-4" />
                      : <span className={isActive ? 'text-brand' : 'text-ink-faint'}>{meta.icon}</span>
                    }
                    {isActive && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand border-2 border-white" />
                    )}
                  </span>
                  <span className="truncate max-w-full">{meta.shortLabel}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
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
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid #E5E7EB',
        boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
      }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center hidden md:flex">
          <Home className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-display text-lg text-ink">HomeReady</span>
        <span className="badge badge-brand text-[10px] px-2 py-0.5">beta</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {user && (
          <>
            <div className="hidden sm:flex items-center gap-2 text-xs text-ink-muted bg-surface-2 border border-border rounded-full px-3 py-1.5">
              <User className="w-3.5 h-3.5" />
              <span className="truncate max-w-[160px] font-medium">{user.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors px-3 py-1.5 rounded-lg hover:bg-surface-2 font-medium"
              title="Sign out"
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
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          <Loader2 className="w-5 h-5 text-brand animate-spin" />
        </div>
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
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          <Loader2 className="w-5 h-5 text-brand animate-spin" />
        </div>
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
        <main className="flex-1 py-6 md:py-8 min-w-0 pb-28 md:pb-8">
          <Routes>
            <Route path="/"           element={<Navigate to="/readiness" replace />} />
            <Route path="/readiness"  element={<ReadinessPage />} />
            <Route path="/evaluate"   element={<EvaluatePage />} />
            <Route path="/evaluate/neighbourhood" element={<NeighbourhoodPage />} />
            <Route path="/shortlist"  element={<ShortlistPage />} />
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
        <Loader2 className="w-5 h-5 text-brand animate-spin" />
      </div>
    )
  }

  if (user) return <Navigate to={from} replace />

  return <AuthPage />
}
