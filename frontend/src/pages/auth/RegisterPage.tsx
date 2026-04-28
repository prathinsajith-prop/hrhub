import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ArrowRight, ArrowLeft, Building2, Globe, CheckCircle2, Check, User, Briefcase, Phone } from 'lucide-react'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { INDUSTRY_OPTIONS, COMPANY_SIZE_OPTIONS } from '@/lib/options'

// ─── Schema ─────────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    // Step 1 — account
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string(),
    // Step 2 — organization
    company: z.string().min(2, 'Company name must be at least 2 characters'),
    industry: z.string().min(1, 'Please select your industry'),
    companySize: z.string().min(1, 'Please select your company size'),
    jurisdiction: z.enum(['mainland', 'freezone'], { message: 'Please select your business type' }),
    tradeLicenseNo: z.string().optional(),
    phone: z.string().optional(),
    terms: z.boolean().refine((v) => v === true, 'You must accept the terms'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type RegisterForm = z.infer<typeof registerSchema>
const STEP_1_FIELDS: (keyof RegisterForm)[] = ['fullName', 'email', 'password', 'confirmPassword']

// ─── Static data ─────────────────────────────────────────────────────────────

const perks = [
  {
    icon: Building2,
    title: 'Multi-entity support',
    desc: 'Manage mainland + free zone entities under one account',
  },
  {
    icon: Globe,
    title: 'WPS ready from day one',
    desc: 'MOHRE-compliant SIF files generated automatically',
  },
  {
    icon: CheckCircle2,
    title: '14-day free trial',
    desc: 'Full access, no credit card required',
  },
]

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 }) {
  const steps = [
    { num: 1, label: 'Your account' },
    { num: 2, label: 'Organization' },
  ]
  return (
    <div className="flex items-center mb-7">
      {steps.map((s, i) => {
        const isComplete = step > s.num
        const isActive = step === s.num
        return (
          <div key={s.num} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors border-2',
                  isComplete && 'bg-primary border-primary text-primary-foreground',
                  isActive && 'bg-primary/10 border-primary text-primary',
                  !isComplete && !isActive && 'bg-muted border-muted-foreground/30 text-muted-foreground',
                )}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : s.num}
              </div>
              <span
                className={cn(
                  'text-xs font-medium transition-colors',
                  isActive && 'text-foreground',
                  isComplete && 'text-primary',
                  !isActive && !isComplete && 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('flex-1 h-px mx-3 transition-colors', step > 1 ? 'bg-primary/40' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    setFocus,
    getFieldState,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { terms: false },
    mode: 'onBlur',
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const [termsChecked, industry, companySize, jurisdiction] = watch(['terms', 'industry', 'companySize', 'jurisdiction'])

  const goToStep2 = async () => {
    const valid = await trigger(STEP_1_FIELDS)
    if (valid) {
      setStep(2)
    } else {
      // Focus the first invalid field so the user sees it immediately
      const firstInvalid = STEP_1_FIELDS.find((f) => getFieldState(f).invalid)
      if (firstInvalid) setFocus(firstInvalid)
    }
  }

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.fullName,
          email: data.email,
          password: data.password,
          company: data.company,
          industry: data.industry,
          jurisdiction: data.jurisdiction,
          companySize: data.companySize,
          tradeLicenseNo: data.tradeLicenseNo || undefined,
          phone: data.phone || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error('Registration failed', json?.message ?? 'Could not create account')
        return
      }
      toast.success('Account created!', 'Please sign in to get started.')
      navigate('/login')
    } catch {
      toast.error('Registration failed', 'Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      heroEyebrow="Start your journey"
      heroTitle={
        <>
          HR operations,
          <br />
          simplified.
        </>
      }
      heroSubtitle="Join 500+ UAE companies using HRHub to manage employees, visas, payroll, and compliance in one place."
      heroContent={
        <div className="space-y-3">
          {perks.map((p) => (
            <div
              key={p.title}
              className="flex items-start gap-3 rounded-xl p-4 bg-sidebar-accent/40 border border-sidebar-border"
            >
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/15 text-primary">
                <p.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-sidebar-accent-foreground">{p.title}</p>
                <p className="text-[12px] text-sidebar-foreground/60 mt-0.5 leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      }
    >
      <StepIndicator step={step} />

      {/* Step heading */}
      <div className="mb-6">
        {step === 1 ? (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground font-display">Your account</h2>
            </div>
            <p className="text-sm text-muted-foreground">Create your personal login credentials.</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground font-display">Your organization</h2>
            </div>
            <p className="text-sm text-muted-foreground">Tell us about your company so we can set up your workspace correctly.</p>
          </>
        )}
      </div>

      {/* ── Step 1 — Account ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              autoFocus
              placeholder="Mohammed Al Rashidi"
              {...register('fullName')}
              aria-invalid={!!errors.fullName}
              className={cn(errors.fullName && 'border-destructive focus-visible:ring-destructive')}
            />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>

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
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Min 8 characters"
                {...register('password')}
                aria-invalid={!!errors.password}
                className={cn('pr-10', errors.password && 'border-destructive focus-visible:ring-destructive')}
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
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter password"
                {...register('confirmPassword')}
                aria-invalid={!!errors.confirmPassword}
                className={cn('pr-10', errors.confirmPassword && 'border-destructive focus-visible:ring-destructive')}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>

          <Button
            type="button"
            className="w-full font-semibold"
            onClick={goToStep2}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            Continue
          </Button>
        </div>
      )}

      {/* ── Step 2 — Organization ─────────────────────────────────────── */}
      {step === 2 && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

          {/* Company name */}
          <div className="space-y-1.5">
            <Label htmlFor="company">Company Name</Label>
            <Input
              id="company"
              type="text"
              autoComplete="organization"
              autoFocus
              placeholder="Al Futtaim Group LLC"
              {...register('company')}
              aria-invalid={!!errors.company}
              className={cn(errors.company && 'border-destructive focus-visible:ring-destructive')}
            />
            {errors.company && <p className="text-xs text-destructive">{errors.company.message}</p>}
          </div>

          {/* Industry + Company size — 2-col grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Select
                value={industry}
                onValueChange={(v) => setValue('industry', v, { shouldValidate: true })}
              >
                <SelectTrigger className={cn(errors.industry && 'border-destructive focus:ring-destructive')}>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.industry && <p className="text-xs text-destructive">{errors.industry.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Company Size</Label>
              <Select
                value={companySize}
                onValueChange={(v) => setValue('companySize', v, { shouldValidate: true })}
              >
                <SelectTrigger className={cn(errors.companySize && 'border-destructive focus:ring-destructive')}>
                  <SelectValue placeholder="Team size" />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_SIZE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.companySize && <p className="text-xs text-destructive">{errors.companySize.message}</p>}
            </div>
          </div>

          {/* Business type / jurisdiction */}
          <div className="space-y-1.5">
            <Label>Business Type</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { value: 'mainland', label: 'Mainland (LLC)', desc: 'DED / Federal licence' },
                { value: 'freezone', label: 'Free Zone', desc: 'JAFZA, DIFC, ADGM & others' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue('jurisdiction', opt.value, { shouldValidate: true })}
                  className={cn(
                    'text-left rounded-lg border-2 p-3 transition-all',
                    jurisdiction === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40',
                    errors.jurisdiction && !jurisdiction && 'border-destructive',
                  )}
                >
                  <p className={cn('text-sm font-semibold', jurisdiction === opt.value ? 'text-primary' : 'text-foreground')}>
                    {opt.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
            {errors.jurisdiction && <p className="text-xs text-destructive">{errors.jurisdiction.message}</p>}
          </div>

          {/* Trade license + Phone — optional 2-col */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tradeLicenseNo">
                Trade License No
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="tradeLicenseNo"
                type="text"
                placeholder="CN-1234567"
                {...register('tradeLicenseNo')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">
                Company Phone
                <span className="ml-1 text-[10px] font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none">
                  +971
                </span>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="50 123 4567"
                  {...register('phone')}
                  className="pl-11"
                />
                <Phone className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              </div>
            </div>
          </div>

          {/* Account summary */}
          <div className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Account owner</p>
            <p className="text-sm font-medium text-foreground">{watch('fullName') || '—'}</p>
            <p className="text-xs text-muted-foreground">{watch('email') || '—'}</p>
          </div>

          {/* Terms */}
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="terms"
              checked={termsChecked}
              onCheckedChange={(checked) => setValue('terms', checked === true, { shouldValidate: true })}
              className={cn('mt-0.5', errors.terms && 'border-destructive')}
            />
            <div>
              <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                I agree to the{' '}
                <a href="#" className="text-primary font-medium hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-primary font-medium hover:underline">Privacy Policy</a>
              </label>
              {errors.terms && <p className="text-xs text-destructive mt-1">{errors.terms.message}</p>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => setStep(1)}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Back
            </Button>
            <Button
              type="submit"
              className="flex-1 font-semibold"
              loading={loading}
              rightIcon={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
            >
              Create Account
            </Button>
          </div>
        </form>
      )}

      <Separator className="my-5" />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
      </p>

      <p className="mt-3 text-center text-[11px] text-muted-foreground/70">
        Protected by enterprise-grade encryption.{' '}
        <a href="#" className="text-primary/80 hover:underline">Learn more</a>
      </p>
    </AuthLayout>
  )
}
