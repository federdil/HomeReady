import { useState } from 'react'
import {
  BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { getPersona } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth'
import PersonaPage from '@/pages/PersonaPage'
import MapPage from '@/pages/MapPage'
import ReadinessPage from '@/pages/ReadinessPage'
import EvaluatePage from '@/pages/EvaluatePage'
import LegalPage from '@/pages/LegalPage'
import AuthPage from '@/pages/AuthPage'
import HomeownerPage from '@/pages/HomeownerPage'
import OfferPage from '@/pages/OfferPage'
import ShortlistPage from '@/pages/ShortlistPage'
import {
  Home, Loader2, LogOut, User, PoundSterling, Search, FileText,
  ClipboardCheck, Menu, X, Handshake, Map as MapIcon, SlidersHorizontal,
} from 'lucide-react'

const queryClient = new QueryClient()

/**
 * Two things people do repeatedly — describing what they want, and judging
 * properties against it — are the whole navigation. The six-stage journey that
 * used to organise the app is now a set of tools opened when needed; most of
 * them are visited once, and giving them equal billing buried the map.
 */
const PRIMARY_NAV = [
  { path: '/persona', label: 'Your profile', icon: <SlidersHorizontal className="w-4 h-4" />, short: 'Profile' },
  { path: '/map', label: 'Properties', icon: <MapIcon className="w-4 h-4" />, short: 'Map' },
]

const TOOLS_NAV = [
  { path: '/readiness', label: 'Cost calculator', icon: <PoundSterling className="w-4 h-4" /> },
  { path: '/evaluate', label: 'Listing decoder', icon: <Search className="w-4 h-4" /> },
  { path: '/offer', label: 'Offer & negotiation', icon: <Handshake className="w-4 h-4" /> },
  { path: '/legal', label: 'Legal & survey', icon: <FileText className="w-4 h-4" /> },
  { path: '/homeowner', label: 'Homeowner checklist', icon: <ClipboardCheck className="w-4 h-4" /> },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
    isActive
      ? 'bg-brand-light text-brand font-semibold'
      : 'text-ink-muted hover:text-ink hover:bg-surface-2'
  }`

function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="card px-2 py-2 flex flex-col gap-0.5" onClick={onNavigate}>
        {PRIMARY_NAV.map(item => (
          <NavLink key={item.path} to={item.path} className={linkClass}>
            <span className="w-7 h-7 rounded-lg bg-surface-2 border border-border flex items-center justify-center flex-shrink-0">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="card px-2 py-2 flex flex-col gap-0.5" onClick={onNavigate}>
        <p className="section-label px-3 pt-2 pb-1.5">Tools</p>
        {TOOLS_NAV.map(item => (
          <NavLink key={item.path} to={item.path} className={linkClass}>
            <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-ink-faint">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </>
  )
}

function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 lg:w-64 flex-shrink-0 flex-col gap-3 sticky top-0 h-screen overflow-y-auto py-6 px-3 lg:px-4">
      <NavGroups />
      <div className="card px-4 py-4 mt-auto">
        <p className="section-label mb-2">How scoring works</p>
        <p className="text-xs text-ink-muted leading-relaxed">
          Every figure comes from public data — TfL, the police, Land Registry,
          the DfE. Where there&rsquo;s no data we say so rather than guess.
        </p>
      </div>
    </aside>
  )
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden" onClick={onClose} />
      <div className="fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col gap-3 py-6 px-4 md:hidden bg-surface-2 border-r border-border shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <Home className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-display text-lg text-ink">HomeReady</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-3 text-ink-muted hover:text-ink transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <NavGroups onNavigate={onClose} />
      </div>
    </>
  )
}

function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-surface/95 backdrop-blur border-t border-border">
      <div className="flex items-stretch">
        {([
          ...PRIMARY_NAV,
          { path: '/readiness', label: 'Costs', icon: <PoundSterling className="w-4 h-4" />, short: 'Costs' },
        ] as { path: string; label: string; icon: React.ReactNode; short: string }[])
          .map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-2.5 px-2 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-brand' : 'text-ink-muted'
                }`
              }
            >
              {item.icon}
              <span>{item.short}</span>
            </NavLink>
          ))}
      </div>
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </nav>
  )
}

function TopNav({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-50 flex items-center px-4 md:px-6 h-14 gap-3 bg-surface/95 backdrop-blur border-b border-border">
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand items-center justify-center hidden md:flex">
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
              onClick={async () => { await signOut(); navigate('/auth', { replace: true }) }}
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

function Spinner() {
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />
  return <>{children}</>
}

/** New users land on the profile; returning users land on their map. */
function Landing() {
  const { data: persona, isLoading } = useQuery({ queryKey: ['persona'], queryFn: getPersona })
  if (isLoading) return <Spinner />
  return <Navigate to={persona ? '/map' : '/persona'} replace />
}

function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav onMenuClick={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex flex-1 max-w-7xl mx-auto w-full px-3 md:px-4 gap-4 lg:gap-6">
        <Sidebar />
        <main className="flex-1 py-6 md:py-8 min-w-0 pb-28 md:pb-8">
          <Routes>
            <Route path="/"          element={<Landing />} />
            <Route path="/persona"   element={<PersonaPage />} />
            <Route path="/map"       element={<MapPage />} />
            <Route path="/readiness" element={<ReadinessPage />} />
            <Route path="/evaluate"  element={<EvaluatePage />} />
            <Route path="/shortlist" element={<ShortlistPage />} />
            <Route path="/offer"     element={<OfferPage />} />
            <Route path="/legal"     element={<LegalPage />} />
            <Route path="/homeowner" element={<HomeownerPage />} />
            <Route path="*"          element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <BottomNav />
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
            <Route path="/*" element={<RequireAuth><AppShell /></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function AuthPublic() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'
  if (loading) return <Spinner />
  if (user) return <Navigate to={from} replace />
  return <AuthPage />
}
