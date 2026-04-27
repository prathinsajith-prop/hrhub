import { useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'

const schema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string().min(8, 'Please confirm your new password'),
}).refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
})
type FormValues = z.infer<typeof schema>

function strengthScore(pw: string): { score: number; label: string; color: string } {
    let s = 0
    if (pw.length >= 8) s++
    if (pw.length >= 12) s++
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
    if (/\d/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    const score = Math.min(s, 4)
    const map = [
        { label: 'Too short', color: 'bg-muted' },
        { label: 'Weak', color: 'bg-destructive' },
        { label: 'Fair', color: 'bg-warning' },
        { label: 'Good', color: 'bg-info' },
        { label: 'Strong', color: 'bg-success' },
    ]
    return { score, ...map[score] }
}

export function ResetPasswordPage() {
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const token = params.get('token') ?? ''
    const [showPw, setShowPw] = useState(false)
    const [loading, setLoading] = useState(false)
    const [done, setDone] = useState(false)

    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(schema),
    })
    // eslint-disable-next-line react-hooks/incompatible-library
    const pw = watch('password') ?? ''
    const strength = useMemo(() => strengthScore(pw), [pw])

    const onSubmit = async (values: FormValues) => {
        if (!token) {
            toast.error('Missing token', 'This reset link is invalid. Please request a new one.')
            return
        }
        setLoading(true)
        try {
            await api.post('/auth/reset-password', { token, password: values.password })
            setDone(true)
            toast.success('Password reset', 'You can now sign in with your new password.')
            setTimeout(() => navigate('/login'), 1800)
        } catch (e: unknown) {
            toast.error('Reset failed', (e instanceof Error ? e.message : null) ?? 'Link may be expired. Please request a new one.')
        } finally {
            setLoading(false)
        }
    }

    if (!token) {
        return (
            <AuthLayout
                heroEyebrow="Account Recovery"
                heroTitle={<>Reset link missing</>}
                heroSubtitle="The page you opened does not contain a valid reset token."
            >
                <div className="text-center space-y-5">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-destructive/10 text-destructive mx-auto">
                        <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-foreground font-display">Invalid reset link</h2>
                        <p className="text-sm text-muted-foreground mt-1.5">
                            The token is missing or malformed. Please request a new password reset.
                        </p>
                    </div>
                    <Link to="/forgot-password">
                        <Button className="w-full gap-2">Request new link <ArrowRight className="h-4 w-4" /></Button>
                    </Link>
                </div>
            </AuthLayout>
        )
    }

    return (
        <AuthLayout
            heroEyebrow="Account Recovery"
            heroTitle={<>Set a new<br />secure password.</>}
            heroSubtitle="Choose a strong password you haven't used before. Once reset, all existing sessions on other devices will be signed out."
            heroContent={
                <ul className="space-y-2 text-sm text-sidebar-foreground/80 max-w-sm">
                    {[
                        '8+ characters with mixed case',
                        'At least one number or symbol',
                        'Avoid reusing previous passwords',
                        'Stored using bcrypt with per-user salts',
                    ].map(t => (
                        <li key={t} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                            <span>{t}</span>
                        </li>
                    ))}
                </ul>
            }
        >
            {done ? (
                <div className="text-center space-y-5">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-success/10 text-success mx-auto">
                        <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-foreground font-display">Password updated</h2>
                        <p className="text-sm text-muted-foreground mt-1.5">
                            Redirecting you to sign in…
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mb-6">
                        <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary mb-4">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <h2 className="text-2xl font-bold text-foreground font-display tracking-tight">Choose a new password</h2>
                        <p className="text-sm text-muted-foreground mt-1.5">
                            Make it strong — at least 8 characters with a mix of letters, numbers, and symbols.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="password">New password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPw ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Minimum 8 characters"
                                    {...register('password')}
                                    aria-invalid={!!errors.password}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw(v => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                    aria-label={showPw ? 'Hide password' : 'Show password'}
                                >
                                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {pw && (
                                <div className="space-y-1 pt-1">
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4].map(i => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    'h-1 flex-1 rounded-full transition-colors',
                                                    i <= strength.score ? strength.color : 'bg-muted',
                                                )}
                                            />
                                        ))}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">Strength: <span className="font-medium text-foreground">{strength.label}</span></p>
                                </div>
                            )}
                            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="confirm">Confirm new password</Label>
                            <Input
                                id="confirm"
                                type={showPw ? 'text' : 'password'}
                                autoComplete="new-password"
                                placeholder="Re-enter password"
                                {...register('confirm')}
                                aria-invalid={!!errors.confirm}
                            />
                            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
                        </div>

                        <Button type="submit" className="w-full gap-2" disabled={loading}>
                            {loading ? 'Updating…' : (<>Reset password <ArrowRight className="h-4 w-4" /></>)}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link
                            to="/login"
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            Cancel and return to sign in
                        </Link>
                    </div>
                </>
            )}
        </AuthLayout>
    )
}

export default ResetPasswordPage
