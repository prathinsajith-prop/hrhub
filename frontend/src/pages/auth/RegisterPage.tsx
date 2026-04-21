import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, ArrowRight, Building2, Globe, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'

const registerSchema = z.object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    company: z.string().min(2, 'Company name must be at least 2 characters'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Must contain an uppercase letter')
        .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string(),
    terms: z.boolean().refine(v => v === true, 'You must accept the terms'),
}).refine(d => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
})
type RegisterForm = z.infer<typeof registerSchema>

const perks = [
    { icon: Building2, title: 'Multi-entity support', desc: 'Manage mainland + free zone entities under one account' },
    { icon: Globe, title: 'WPS ready from day one', desc: 'MOHRE-compliant SIF files generated automatically' },
    { icon: CheckCircle2, title: '14-day free trial', desc: 'Full access, no credit card required' },
]

export function RegisterPage() {
    const navigate = useNavigate()
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [loading, setLoading] = useState(false)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<RegisterForm>({
        resolver: zodResolver(registerSchema),
        defaultValues: { terms: false },
    })

    const termsChecked = watch('terms')

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
        <div className="min-h-screen flex overflow-hidden">

            {/* ── Left dark panel (decorative) ─────────────────────────────── */}
            <div
                className="hidden lg:flex lg:w-[45%] flex-col relative overflow-hidden"
                style={{ background: 'linear-gradient(140deg, hsl(228 39% 7%) 0%, hsl(234 34% 12%) 55%, hsl(221 55% 17%) 100%)' }}
            >
                {/* Glow orbs */}
                <div className="absolute -top-40 -right-20 w-[500px] h-[500px] rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgb(99 102 241 / 0.15) 0%, transparent 65%)' }} />
                <div className="absolute bottom-20 -left-20 w-[400px] h-[400px] rounded-full pointer-events-none"
                    style={{ background: 'radial-gradient(circle, rgb(59 130 246 / 0.1) 0%, transparent 65%)' }} />
                {/* Grid overlay */}
                <div className="absolute inset-0 opacity-[0.025] pointer-events-none"
                    style={{ backgroundImage: 'linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

                {/* Logo */}
                <div className="relative p-10">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-white text-sm"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>HR</div>
                        <div>
                            <p className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>HRHub.ae</p>
                            <p className="text-[11px] text-white/40 tracking-wide">UAE HR & PRO Platform</p>
                        </div>
                    </div>
                </div>

                {/* Hero content */}
                <div className="relative flex-1 flex flex-col justify-center px-10 pb-6">
                    <p className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3">Start your journey</p>
                    <h1 className="text-4xl font-bold text-white leading-tight mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                        HR Operations,<br />
                        <span style={{ background: 'linear-gradient(90deg, #818cf8, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                            Simplified
                        </span>
                    </h1>
                    <p className="text-white/50 text-[15px] leading-relaxed max-w-sm mb-10">
                        Join 500+ UAE companies using HRHub to manage employees, visas, payroll, and compliance in one place.
                    </p>

                    {/* Perks */}
                    <div className="space-y-3">
                        {perks.map(p => (
                            <div key={p.title} className="flex items-start gap-3 rounded-xl p-4"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ background: 'rgb(99 102 241 / 0.2)' }}>
                                    <p.icon className="h-4 w-4 text-indigo-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-white/90">{p.title}</p>
                                    <p className="text-[12px] text-white/45 mt-0.5 leading-relaxed">{p.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative px-10 pb-8">
                    <p className="text-[11px] text-white/25">© 2026 HRHub.ae · ISO 27001 Certified · SOC 2 Type II</p>
                </div>
            </div>

            {/* ── Right form panel ──────────────────────────────────────────── */}
            <div className="flex-1 flex items-center justify-center p-8 bg-background relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at 20% 80%, rgb(99 102 241 / 0.04) 0%, transparent 60%)' }} />

                <div className="relative w-full max-w-sm animate-fade-in">

                    {/* Mobile logo */}
                    <div className="flex items-center gap-2.5 mb-8 lg:hidden">
                        <div className="h-9 w-9 rounded-xl flex items-center justify-center font-bold text-white text-sm"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>HR</div>
                        <p className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>HRHub.ae</p>
                    </div>

                    {/* Heading */}
                    <div className="mb-7">
                        <h2 className="text-2xl font-bold text-foreground mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                            Create your account
                        </h2>
                        <p className="text-sm text-muted-foreground">Set up your workspace in under 2 minutes</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                        {/* Full Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="fullName">Full Name</Label>
                            <Input
                                id="fullName"
                                type="text"
                                autoComplete="name"
                                placeholder="Mohammed Al Rashidi"
                                {...register('fullName')}
                                className={cn(errors.fullName && 'border-destructive focus-visible:ring-destructive')}
                            />
                            {errors.fullName && (
                                <p className="text-xs text-destructive">{errors.fullName.message}</p>
                            )}
                        </div>

                        {/* Work Email */}
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

                        {/* Company */}
                        <div className="space-y-1.5">
                            <Label htmlFor="company">Company Name</Label>
                            <Input
                                id="company"
                                type="text"
                                autoComplete="organization"
                                placeholder="Al Futtaim Group LLC"
                                {...register('company')}
                                className={cn(errors.company && 'border-destructive focus-visible:ring-destructive')}
                            />
                            {errors.company && (
                                <p className="text-xs text-destructive">{errors.company.message}</p>
                            )}
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Min 8 characters"
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

                        {/* Confirm Password */}
                        <div className="space-y-1.5">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    type={showConfirm ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Re-enter password"
                                    {...register('confirmPassword')}
                                    className={cn('pr-10', errors.confirmPassword && 'border-destructive focus-visible:ring-destructive')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    tabIndex={-1}
                                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                                >
                                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {errors.confirmPassword && (
                                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
                            )}
                        </div>

                        {/* Terms */}
                        <div className="flex items-start gap-2.5">
                            <Checkbox
                                id="terms"
                                checked={termsChecked}
                                onCheckedChange={checked => setValue('terms', checked === true, { shouldValidate: true })}
                                className={cn('mt-0.5', errors.terms && 'border-destructive')}
                            />
                            <div>
                                <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                                    I agree to the{' '}
                                    <a href="#" className="text-primary font-medium hover:underline">Terms of Service</a>
                                    {' '}and{' '}
                                    <a href="#" className="text-primary font-medium hover:underline">Privacy Policy</a>
                                </label>
                                {errors.terms && (
                                    <p className="text-xs text-destructive mt-1">{errors.terms.message}</p>
                                )}
                            </div>
                        </div>

                        {/* Submit */}
                        <Button
                            type="submit"
                            className="w-full font-semibold bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white border-0"
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>Create Account <ArrowRight className="h-4 w-4" /></>
                            )}
                        </Button>
                    </form>

                    <Separator className="my-5" />

                    {/* Login link */}
                    <p className="text-center text-sm text-muted-foreground">
                        Already have an account?{' '}
                        <Link to="/login" className="text-primary font-medium hover:underline">
                            Sign in
                        </Link>
                    </p>

                    <p className="mt-3 text-center text-[11px] text-muted-foreground/60">
                        Protected by enterprise-grade encryption.{' '}
                        <a href="#" className="text-primary/80 hover:underline">Learn more</a>
                    </p>
                </div>
            </div>
        </div>
    )
}
