import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ArrowRight, Users, FileCheck, Shield, Zap, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type LoginForm = z.infer<typeof loginSchema>

const stats = [
  { value: '12,000+', label: 'Active Employees' },
  { value: '98%', label: 'WPS Compliance' },
  { value: '60%', label: 'Faster PRO Processing' },
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
    <div className="min-h-screen flex overflow-hidden">

      {/* ── Left dark panel (decorative) ─────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[55%] flex-col relative overflow-hidden"
        style={{ background: 'linear-gradient(140deg, hsl(228 39% 7%) 0%, hsl(234 34% 12%) 55%, hsl(221 55% 17%) 100%)' }}
      >
        {/* Glow orbs */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgb(59 130 246 / 0.12) 0%, transparent 65%)' }} />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgb(139 92 246 / 0.1) 0%, transparent 65%)' }} />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

        {/* Logo */}
        <div className="relative p-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-white text-sm"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>HR</div>
            <div>
              <p className="text-lg font-bold text-white font-display">HRHub.ae</p>
              <p className="text-[11px] text-white/40 tracking-wide">UAE HR & PRO Platform</p>
            </div>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative flex-1 flex flex-col justify-center px-10 pb-6">
          <p className="text-xs font-semibold text-blue-400 tracking-widest uppercase mb-3">Built for UAE Businesses</p>
          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-4">
            The Smartest Way<br />to{' '}
            <span style={{ background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Manage People
            </span>
          </h1>
          <p className="text-white/50 text-[15px] leading-relaxed max-w-md mb-10">
            Automate visa processing, payroll, and compliance — purpose-built for UAE mainland and free zone companies.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {stats.map(s => (
              <div key={s.label} className="rounded-xl p-4"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-2xl font-bold text-white font-display">{s.value}</p>
                <p className="text-[11px] text-white/45 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-2 gap-3">
            {features.map(f => (
              <div key={f.title} className="flex items-start gap-3 rounded-xl p-3.5"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'rgb(59 130 246 / 0.15)' }}>
                  <f.icon className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/90">{f.title}</p>
                  <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative px-10 pb-8">
          <p className="text-[11px] text-white/25">© 2026 HRHub.ae · Trusted by 500+ UAE companies · ISO 27001</p>
        </div>
      </div>

      {/* ── Right form panel ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 80% 20%, rgb(59 130 246 / 0.04) 0%, transparent 60%)' }} />

        <div className="relative w-full max-w-sm animate-fade-in">

          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center font-bold text-white text-sm"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>HR</div>
            <p className="text-xl font-bold text-foreground font-display">HRHub.ae</p>
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h2 className="text-2xl font-bold text-foreground mb-1.5">
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground">Sign in to your workspace to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.ae"
                {...register('email')}
                className={cn(errors.email && 'border-destructive focus-visible:ring-destructive')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                  className={cn('pr-10', errors.password && 'border-destructive focus-visible:ring-destructive')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
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

            {/* Submit */}
            <Button
              type="submit"
              className="w-full font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white border-0"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          </form>

          <Separator className="my-5" />

          {/* Demo credentials */}
          <div className="rounded-xl p-4 bg-primary/5 border border-primary/15">
            <p className="text-[11px] font-semibold text-primary mb-2 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              Demo Credentials
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-[11px] text-muted-foreground">Email</span>
              <span className="text-[11px] font-mono font-semibold text-foreground">admin@hrhub.ae</span>
              <span className="text-[11px] text-muted-foreground">Password</span>
              <span className="text-[11px] font-mono font-semibold text-foreground">Admin@12345</span>
            </div>
          </div>

          {/* Register link */}
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="text-primary font-medium hover:underline">
              Create account
            </Link>
          </p>

          <p className="mt-3 text-center text-[11px] text-muted-foreground/60">
            By signing in you agree to our{' '}
            <a href="#" className="text-primary/80 hover:underline">Terms</a>{' '}&{' '}
            <a href="#" className="text-primary/80 hover:underline">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  )
}
