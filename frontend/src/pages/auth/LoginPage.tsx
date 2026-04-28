import { useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ArrowRight, Users, FileCheck, Shield, Zap, ShieldCheck, Mail, Lock, LogIn } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/layout/AuthLayout'
import type { User, Tenant } from '@/types'

const OTP_LENGTH = 6

function OtpInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])
  // Guard against double-fire (React 19 StrictMode runs setState updaters twice in dev)
  const submittedRef = useRef<string | null>(null)

  const focus = (i: number) => refs.current[i]?.focus()

  const fireComplete = useCallback((code: string) => {
    if (submittedRef.current === code) return
    submittedRef.current = code
    onComplete(code)
  }, [onComplete])

  const handleChange = useCallback((i: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1)
    let nextDigits: string[] = []
    setDigits(prev => {
      const next = [...prev]
      next[i] = char
      nextDigits = next
      return next
    })
    if (char && i < OTP_LENGTH - 1) setTimeout(() => focus(i + 1), 0)
    // Fire OUTSIDE the setState updater so StrictMode double-invocation doesn't double-submit
    queueMicrotask(() => {
      const full = nextDigits.join('')
      if (full.length === OTP_LENGTH && !nextDigits.includes('')) fireComplete(full)
    })
  }, [fireComplete])

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      submittedRef.current = null // clear guard on edit
      if (digits[i]) {
        setDigits(prev => { const n = [...prev]; n[i] = ''; return n })
      } else if (i > 0) {
        focus(i - 1)
        setDigits(prev => { const n = [...prev]; n[i - 1] = ''; return n })
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focus(i - 1)
    } else if (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) {
      focus(i + 1)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((c, idx) => { next[idx] = c })
    setDigits(next)
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
    setTimeout(() => focus(focusIdx), 0)
    if (pasted.length === OTP_LENGTH) fireComplete(pasted)
  }

  return (
    <div className="flex gap-2.5 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={i === 0}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className={cn(
            'h-14 w-11 rounded-xl border-2 bg-background text-center text-xl font-bold font-mono',
            'transition-all duration-150 outline-none',
            'focus:border-primary focus:ring-2 focus:ring-primary/20',
            d ? 'border-primary/60 bg-primary/5 text-foreground' : 'border-input text-foreground',
          )}
        />
      ))}
    </div>
  )
}

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type LoginForm = z.infer<typeof loginSchema>

const stats = [
  { value: '12,000+', label: 'Active Employees' },
  { value: '98%', label: 'WPS Compliance' },
  { value: '60%', label: 'Faster PRO' },
]

const features = [
  { icon: Users, title: 'Complete HR Lifecycle', desc: 'From recruitment to exit, fully automated' },
  { icon: FileCheck, title: 'UAE Labour Law Ready', desc: 'Federal Decree-Law No. 33 of 2021 compliant' },
  { icon: Shield, title: 'Multi-Entity Management', desc: 'Mainland + Free Zone in one account' },
  { icon: Zap, title: 'Instant WPS Generation', desc: 'MOHRE-compliant SIF files in one click' },
]

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  // MFA challenge state
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaToken, setMfaToken] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [backupCodeInput, setBackupCodeInput] = useState('')
  const mfaInFlightRef = useRef(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const completeLogin = useCallback((data: { user: User; tenant: Tenant | null; accessToken: string; refreshToken: string }) => {
    login(data.user, data.tenant as Tenant, data.accessToken, data.refreshToken)
    toast.success(`Welcome back, ${data.user.name}!`, 'Redirecting to your dashboard.')
    navigate('/dashboard')
  }, [login, navigate])

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 423) {
          toast.error('Account locked', json?.message ?? 'Too many failed attempts. Try again later.')
        } else if (res.status === 429) {
          toast.error('Too many attempts', json?.message ?? 'Please wait before trying again.')
        } else {
          toast.error('Login failed', json?.message ?? 'Invalid email or password.')
        }
        return
      }
      // 2FA challenge — show TOTP input
      if (json.data?.requiresMfa) {
        setMfaToken(json.data.mfaToken)
        setMfaStep(true)
        return
      }
      completeLogin(json.data)
    } catch {
      toast.error('Login failed', 'Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const onMfaComplete = useCallback(async (code: string) => {
    if (code.length !== OTP_LENGTH) return
    if (mfaInFlightRef.current) return // prevent double-submit (StrictMode etc.)
    mfaInFlightRef.current = true
    setMfaLoading(true)
    try {
      const res = await fetch('/api/v1/auth/2fa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, code }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error('Invalid code', json?.message ?? 'The code is incorrect or expired. Try again.')
        return
      }
      completeLogin(json.data)
    } catch {
      toast.error('Verification failed', 'Network error. Please try again.')
    } finally {
      setMfaLoading(false)
      mfaInFlightRef.current = false
    }
  }, [mfaToken, completeLogin])

  const onBackupCodeSubmit = useCallback(async () => {
    const code = backupCodeInput.trim()
    if (code.length < 8) {
      toast.warning('Invalid code', 'Backup codes are 10 characters (e.g. ABCDE-12345).')
      return
    }
    if (mfaInFlightRef.current) return
    mfaInFlightRef.current = true
    setMfaLoading(true)
    try {
      const res = await fetch('/api/v1/auth/2fa/backup-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, code }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error('Invalid backup code', json?.message ?? 'The code is incorrect or already used.')
        return
      }
      completeLogin(json.data)
    } catch {
      toast.error('Verification failed', 'Network error. Please try again.')
    } finally {
      setMfaLoading(false)
      mfaInFlightRef.current = false
    }
  }, [backupCodeInput, mfaToken, completeLogin])

  return (
    <AuthLayout
      heroEyebrow="Built for UAE Businesses"
      heroTitle={
        <>
          The smartest way
          <br />
          to manage people.
        </>
      }
      heroSubtitle="Automate visa processing, payroll, and compliance — purpose-built for UAE mainland and free zone companies."
      heroContent={
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-4 bg-white/[0.04] border border-white/10 backdrop-blur-sm hover:bg-white/[0.07] transition-colors"
              >
                <p className="text-2xl font-bold font-display text-white">
                  {s.value}
                </p>
                <p className="text-[11px] text-white/60 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-3 rounded-xl p-3.5 bg-white/[0.03] border border-white/10 backdrop-blur-sm hover:bg-white/[0.06] hover:border-white/15 transition-colors"
              >
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/20 text-primary ring-1 ring-primary/30">
                  <f.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">{f.title}</p>
                  <p className="text-[11px] text-white/60 mt-0.5 leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      }
    >
      {/* Heading */}
      <div className="mb-7">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 ring-1 ring-primary/15">
          {mfaStep ? <ShieldCheck className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
        </div>
        <h2 className="text-[22px] font-bold text-foreground tracking-tight font-display">
          {mfaStep ? 'Verify your identity' : 'Welcome back'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          {mfaStep
            ? (useBackupCode
              ? 'Enter one of your saved single-use backup codes to continue.'
              : 'Enter the 6-digit code from your authenticator app to continue.')
            : 'Sign in to your workspace to continue.'}
        </p>
      </div>

      {/* MFA challenge */}
      {mfaStep ? (
        <div className="space-y-6">
          {/* Icon badge */}
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-inner">
                <ShieldCheck className="h-8 w-8 text-primary" />
              </div>
              <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-background border-2 border-border flex items-center justify-center">
                <span className="block h-2 w-2 rounded-full bg-green-500" />
              </span>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-[220px] leading-relaxed">
              {useBackupCode
                ? <>Each code can only be used <span className="font-medium text-foreground">once</span>.</>
                : <>Open your <span className="font-medium text-foreground">authenticator app</span> and enter the current code</>}
            </p>
          </div>

          {/* Code entry */}
          {useBackupCode ? (
            <div className="space-y-3">
              <Input
                autoFocus
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="ABCDE-12345"
                value={backupCodeInput}
                onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') onBackupCodeSubmit() }}
                className="text-center tracking-[0.3em] text-base font-mono"
              />
              <Button
                type="button"
                className="w-full"
                onClick={onBackupCodeSubmit}
                loading={mfaLoading}
                disabled={backupCodeInput.trim().length < 8}
              >
                Verify backup code
              </Button>
            </div>
          ) : (
            <OtpInput onComplete={onMfaComplete} />
          )}

          {/* Loading / verifying indicator */}
          {!useBackupCode && mfaLoading && (
            <div className="flex items-center justify-center gap-2 text-sm text-primary">
              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Verifying…
            </div>
          )}

          {/* Info text */}
          {!useBackupCode && (
            <p className="text-center text-xs text-muted-foreground">
              Codes refresh every 30 seconds. Make sure your device clock is accurate.
            </p>
          )}

          {/* Toggle TOTP ↔ backup code */}
          <button
            type="button"
            onClick={() => { setUseBackupCode(v => !v); setBackupCodeInput('') }}
            className="w-full text-sm text-primary hover:text-primary/80 font-medium transition-colors text-center"
          >
            {useBackupCode ? '← Use authenticator code instead' : 'Lost your device? Use a backup code →'}
          </button>

          <button
            type="button"
            onClick={() => { setMfaStep(false); setMfaToken(''); setUseBackupCode(false); setBackupCodeInput('') }}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            ← Back to login
          </button>
        </div>
      ) : (
        /* Login form */
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Work Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.ae"
                {...register('email')}
                aria-invalid={!!errors.email}
                className={cn('pl-9', errors.email && 'border-destructive focus-visible:ring-destructive')}
              />
            </div>
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                to="/forgot-password"
                className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                aria-invalid={!!errors.password}
                className={cn(
                  'pl-9 pr-10',
                  errors.password && 'border-destructive focus-visible:ring-destructive',
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full font-semibold mt-2"
            loading={loading}
            rightIcon={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
          >
            Sign In
          </Button>
        </form>
      )} {/* end mfaStep conditional */}

      {!mfaStep && (
        <>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {"New to HRHub? "}
            <Link to="/register" className="text-primary font-semibold hover:underline">
              Create an account
            </Link>
          </p>

          <p className="mt-5 text-center text-[11px] text-muted-foreground/70 leading-relaxed">
            By signing in you agree to our{' '}
            <a href="#" className="text-primary/80 hover:underline">
              Terms
            </a>{' '}
            &amp;{' '}
            <a href="#" className="text-primary/80 hover:underline">
              Privacy Policy
            </a>
          </p>
        </>
      )}
    </AuthLayout>
  )
}
