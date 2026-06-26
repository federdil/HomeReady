import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/lib/auth'
import { SolidCard, FormField, PrimaryButton, GhostButton } from '@/components/ui'
import { Home, AlertTriangle, CheckCircle, Mail, Lock } from 'lucide-react'

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
type FormData = z.infer<typeof schema>

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 mb-2">
            <Home className="w-6 h-6 text-purple" />
            <span className="font-display text-3xl text-plum">HomeReady</span>
          </div>
          <p className="text-sm text-plum-soft">
            {mode === 'signin' ? 'Welcome back — sign in to continue your journey' : 'Create your account to start your home-buying journey'}
          </p>
        </div>

        {signupDone ? (
          <SolidCard className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-sage/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-6 h-6 text-sage" />
            </div>
            <div>
              <h2 className="font-display text-xl text-plum mb-1">Check your email</h2>
              <p className="text-sm text-plum-soft">
                We've sent a confirmation link. Click it to verify your account, then sign in.
              </p>
            </div>
            <GhostButton onClick={() => { setSignupDone(false); setMode('signin') }}>
              Back to sign in
            </GhostButton>
          </SolidCard>
        ) : (
          <SolidCard className="space-y-5">
            {/* Mode toggle */}
            <div className="flex bg-dusk rounded-xl p-1 text-sm">
              {(['signin', 'signup'] as const).map(m => (
                <button key={m} type="button" onClick={() => { setMode(m); setServerError(null) }}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-all ${
                    mode === m ? 'bg-white shadow-sm text-plum' : 'text-plum-soft hover:text-plum'
                  }`}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <FormField label="Email address" error={errors.email?.message}>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-plum-soft" />
                  <input {...register('email')} type="email" autoComplete="email"
                    placeholder="you@example.com" className="glass-input pl-9" />
                </div>
              </FormField>

              <FormField label="Password" error={errors.password?.message}>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-plum-soft" />
                  <input {...register('password')} type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                    className="glass-input pl-9" />
                </div>
              </FormField>

              {serverError && (
                <p className="text-sm text-red-500 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{serverError}
                </p>
              )}

              <PrimaryButton type="submit" loading={isSubmitting} className="w-full">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </PrimaryButton>
            </form>
          </SolidCard>
        )}

        <p className="text-center text-xs text-plum-soft">
          {mode === 'signin'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setServerError(null) }}
            className="text-purple font-medium hover:underline">
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
