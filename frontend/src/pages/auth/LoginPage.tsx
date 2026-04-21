import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ArrowRight, Users, FileCheck, Shield, Zap } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AuthLayout } from '@/components/layout/AuthLayout'

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

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: 'admin@hrhub.ae', password: 'Admin@12345' },
  })

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
        toast.error('Login failed', json?.message ?? 'Invalid credentials')
        return
      }
      const { user, tenant, accessToken, refreshToken } = json.data
      login(user, tenant, accessToken, refreshToken)
      toast.success(`Welcome back, ${user.name}!`, 'Redirecting to your dashboard.')
      navigate('/dashboard')
    } catch {
      toast.error('Login failed', 'Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

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
                className="rounded-xl p-4 bg-sidebar-accent/60 border border-sidebar-border"
              >
                <p className="text-2xl font-bold text-sidebar-accent-foreground font-display">
                  {s.value}
                </p>
                <p className="text-[11px] text-sidebar-foreground/60 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-3 rounded-xl p-3.5 bg-sidebar-accent/40 border border-sidebar-border"
              >
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/15 text-primary">
                  <f.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-sidebar-accent-foreground">{f.title}</p>
                  <p className="text-[11px] text-sidebar-foreground/60 mt-0.5 leading-relaxed">
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
        <h2 className="text-2xl font-bold text-foreground mb-1.5 font-display">
          Welcome back
        </h2>
        <p className="text-sm text-muted-foreground">
          Sign in to your workspace to continue.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Work Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.ae"
            {...register('email')}
            aria-invalid={!!errors.email}
            className={cn(errors.email && 'border-destructive focus-visible:ring-destructive')}
          />
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
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              aria-invalid={!!errors.password}
              className={cn(
                'pr-10',
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
          className="w-full font-semibold"
          loading={loading}
          rightIcon={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
        >
          Sign In
        </Button>
      </form>

      <Separator className="my-5" />

      <div className="rounded-xl p-4 bg-primary/5 border border-primary/15">
        <p className="text-[11px] font-semibold text-primary mb-2 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Demo Credentials
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <span className="text-[11px] text-muted-foreground">Email</span>
          <span className="text-[11px] font-mono font-semibold text-foreground">
            admin@hrhub.ae
          </span>
          <span className="text-[11px] text-muted-foreground">Password</span>
          <span className="text-[11px] font-mono font-semibold text-foreground">
            Admin@12345
          </span>
        </div>
      </div>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        {"Don't have an account? "}
        <Link to="/register" className="text-primary font-medium hover:underline">
          Create account
        </Link>
      </p>

      <p className="mt-3 text-center text-[11px] text-muted-foreground/70">
        By signing in you agree to our{' '}
        <a href="#" className="text-primary/80 hover:underline">
          Terms
        </a>{' '}
        &amp;{' '}
        <a href="#" className="text-primary/80 hover:underline">
          Privacy Policy
        </a>
      </p>
    </AuthLayout>
  )
}
