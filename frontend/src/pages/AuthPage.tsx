import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/lib/auth'
import { FormField, PrimaryButton, GhostButton } from '@/components/ui'
import {
  Home, AlertCircle, CheckCircle, Mail, Lock,
  PoundSterling, Search, FileText, ClipboardCheck,
} from 'lucide-react'

const schema = z.object({
  email:    z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
type FormData = z.infer<typeof schema>

const FEATURES = [
  { icon: <PoundSterling className="w-4 h-4" />, label: 'True cost calculator', desc: 'Stamp duty, legal fees, surveys — all in one place' },
  { icon: <Search className="w-4 h-4" />,        label: 'AI listing decoder',   desc: 'Decode estate agent language and surface hidden risks' },
  { icon: <FileText className="w-4 h-4" />,      label: 'Legal document explainer', desc: 'Understand contracts and survey reports in plain English' },
  { icon: <ClipboardCheck className="w-4 h-4" />, label: 'Post-completion checklist', desc: 'Everything you need to do after getting the keys' },
]

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [serverError, setServerError] = useState<string | null>(null)
  const [signupDone, setSignupDone]   = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    if (mode === 'signin') {
      const { error } = await signIn(data.email, data.password)
      if (error) { setServerError(error); return }
      navigate('/readiness', { replace: true })
    } else {
      const { error } = await signUp(data.email, data.password)
      if (error) { setServerError(error); return }
      setSignupDone(true)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand/features (desktop only) */}
      <div className="hidden lg:flex w-[480px] flex-shrink-0 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #3B2080 0%, #5B3DAE 50%, #7B55C8 100%)',
        }}
      >
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #FFFFFF 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #FFFFFF 0%, transparent 70%)', transform: 'translate(-30%, 30%)' }} />

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          <span className="font-display text-2xl text-white">HomeReady</span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="font-display text-3xl text-white leading-tight mb-3">
              Your guide through every step of buying a home
            </h1>
            <p className="text-white/70 text-base leading-relaxed">
              From calculating your true budget to getting the keys — HomeReady gives you the tools and clarity to buy with confidence.
            </p>
          </div>

          <div className="space-y-4">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white shrink-0 mt-0.5">
                  {f.icon}
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">{f.label}</p>
                  <p className="text-white/60 text-xs leading-relaxed mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-white/40 text-xs relative z-10">
          Built for UK home buyers · Free to use during beta
        </p>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-surface-2">
        <div className="w-full max-w-sm space-y-6">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
              <Home className="w-4 h-4 text-white" />
            </div>
            <span className="font-display text-xl text-ink">HomeReady</span>
          </div>

          {signupDone ? (
            <div className="card p-8 text-center space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center mx-auto">
                <CheckCircle className="w-7 h-7 text-success" />
              </div>
              <div>
                <h2 className="font-display text-xl text-ink mb-2">Check your email</h2>
                <p className="text-sm text-ink-muted leading-relaxed">
                  We've sent a confirmation link to your email address. Click it to verify your account, then sign in.
                </p>
              </div>
              <GhostButton onClick={() => { setSignupDone(false); setMode('signin') }} className="w-full">
                Back to sign in
              </GhostButton>
            </div>
          ) : (
            <>
              <div>
                <h2 className="font-display text-2xl text-ink mb-1">
                  {mode === 'signin' ? 'Welcome back' : 'Create your account'}
                </h2>
                <p className="text-sm text-ink-muted">
                  {mode === 'signin'
                    ? 'Sign in to continue your home-buying journey'
                    : 'Start your home-buying journey for free'}
                </p>
              </div>

              <div className="card p-6 space-y-5">
                {/* Mode toggle */}
                <div className="flex bg-surface-2 border border-border rounded-xl p-1 text-sm">
                  {(['signin', 'signup'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMode(m); setServerError(null) }}
                      className={`flex-1 py-2 rounded-lg font-semibold transition-all text-sm ${
                        mode === m
                          ? 'bg-white shadow-sm text-ink border border-border'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {m === 'signin' ? 'Sign in' : 'Sign up'}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <FormField label="Email address" error={errors.email?.message}>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                      <input
                        {...register('email')}
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="glass-input pl-10"
                      />
                    </div>
                  </FormField>

                  <FormField label="Password" error={errors.password?.message}>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
                      <input
                        {...register('password')}
                        type="password"
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                        className="glass-input pl-10"
                      />
                    </div>
                  </FormField>

                  {serverError && (
                    <div className="flex items-center gap-2 text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{serverError}</span>
                    </div>
                  )}

                  <PrimaryButton type="submit" loading={isSubmitting} className="w-full">
                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                  </PrimaryButton>
                </form>
              </div>

              <p className="text-center text-sm text-ink-muted">
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setServerError(null) }}
                  className="text-brand font-semibold hover:underline"
                >
                  {mode === 'signin' ? 'Create one free' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
