import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, DEV_NO_AUTH, DEV_USER_ID } from './supabase'

// Flagged anonymous so local development shows the same header a real
// first-time visitor sees, rather than a placeholder email.
const DEV_USER = { id: DEV_USER_ID, is_anonymous: true } as unknown as User

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  /** True while the visitor is using a guest session with no email attached. */
  isGuest: boolean
  /** Set when a guest session could not be started — the app is unusable. */
  startupError: string | null
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  /** Attach an email and password to the current guest session, keeping the
   *  same user id so everything they have already saved carries over. */
  upgradeAccount: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [startupError, setStartupError] = useState<string | null>(null)

  useEffect(() => {
    if (DEV_NO_AUTH) {
      setUser(DEV_USER)
      setLoading(false)
      return
    }

    let active = true

    const start = async () => {
      const { data: { session: existing } } = await supabase.auth.getSession()
      if (!active) return

      if (existing) {
        setSession(existing)
        setUser(existing.user)
        return
      }

      // Nobody should have to create an account before they can look at a
      // property. Start a guest session instead — it is a real Supabase user
      // with a real id, so everything they save persists and can later be
      // claimed by adding an email.
      const { data, error } = await supabase.auth.signInAnonymously()
      if (!active) return
      if (error) {
        setStartupError(error.message)
        return
      }
      setSession(data.session)
      setUser(data.user)
    }

    start()
      .catch(err => {
        console.error('Could not reach Supabase auth:', err)
        if (active) setStartupError('Could not reach the server.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Supabase marks guest sessions with is_anonymous on the user record.
  const isGuest = Boolean(user && (user as User & { is_anonymous?: boolean }).is_anonymous)

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message ?? null }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const upgradeAccount = async (email: string, password: string) => {
    // updateUser, not signUp: signing up would mint a *new* user id and strand
    // everything saved against the guest one.
    const { error } = await supabase.auth.updateUser({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    if (DEV_NO_AUTH) return
    await supabase.auth.signOut()
    // Signing out of a guest session would leave no session at all, so start a
    // fresh one rather than stranding the visitor on a dead screen.
    const { data } = await supabase.auth.signInAnonymously()
    setSession(data?.session ?? null)
    setUser(data?.user ?? null)
  }

  return (
    <AuthContext.Provider value={{
      user, session, loading, isGuest, startupError,
      signUp, signIn, upgradeAccount, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
