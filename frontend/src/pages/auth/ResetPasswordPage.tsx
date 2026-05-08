import { useState, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
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

function strengthScore(pw: string, labels: { tooShort: string; weak: string; fair: string; good: string; strong: string }): { score: number; label: string; color: string } {
    let s = 0
    if (pw.length >= 8) s++
    if (pw.length >= 12) s++
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
    if (/\d/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    const score = Math.min(s, 4)
    const map = [
        { label: labels.tooShort, color: 'bg-muted' },
        { label: labels.weak, color: 'bg-destructive' },
        { label: labels.fair, color: 'bg-warning' },
        { label: labels.good, color: 'bg-info' },
        { label: labels.strong, color: 'bg-success' },
    ]
    return { score, ...map[score] }
}

export function ResetPasswordPage() {
    const { t } = useTranslation()
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
    const strengthLabels = useMemo(() => ({
        tooShort: t('auth.strengthTooShort'),
        weak: t('auth.strengthWeak'),
        fair: t('auth.strengthFair'),
        good: t('auth.strengthGood'),
        strong: t('auth.strengthStrong'),
    }), [t])
    const strength = useMemo(() => strengthScore(pw, strengthLabels), [pw, strengthLabels])

    const onSubmit = async (values: FormValues) => {
        if (!token) {
            toast.error(t('auth.missingToken'), t('auth.missingTokenMsg'))
            return
        }
        setLoading(true)
        try {
            await api.post('/auth/reset-password', { token, password: values.password })
            setDone(true)
            toast.success(t('auth.passwordResetTitle'), t('auth.passwordResetMsg'))
            setTimeout(() => navigate('/login'), 1800)
        } catch (e: unknown) {
            toast.error(t('auth.resetFailed'), (e instanceof Error ? e.message : null) ?? t('auth.resetFailedMsg'))
        } finally {
            setLoading(false)
        }
    }

    if (!token) {
        return (
            <AuthLayout
                heroEyebrow={t('auth.forgotHeroEyebrow')}
                heroTitle={<>{t('auth.resetMissingTitle')}</>}
                heroSubtitle={t('auth.resetMissingSubtitle')}
            >
                <div className="text-center space-y-5">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-destructive/10 text-destructive mx-auto">
                        <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold text-foreground font-display">{t('auth.invalidResetLink')}</h2>
                        <p className="text-sm text-muted-foreground mt-1.5">
                            {t('auth.invalidResetLinkDesc')}
                        </p>
                    </div>
                    <Link to="/forgot-password">
                        <Button className="w-full gap-2">{t('auth.requestNewLink')} <ArrowRight className="h-4 w-4" /></Button>
                    </Link>
                </div>
            </AuthLayout>
        )
    }

    return (
        <AuthLayout
            heroEyebrow={t('auth.forgotHeroEyebrow')}
            heroTitle={<>{t('auth.resetHeroTitle1')}<br />{t('auth.resetHeroTitle2')}</>}
            heroSubtitle={t('auth.resetHeroSubtitle')}
            heroContent={
                <ul className="space-y-2 text-sm text-sidebar-foreground/80 max-w-sm">
                    {[
                        t('auth.resetTip1'),
                        t('auth.resetTip2'),
                        t('auth.resetTip3'),
                        t('auth.resetTip4'),
                    ].map(tip => (
                        <li key={tip} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                            <span>{tip}</span>
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
                        <h2 className="text-2xl font-semibold text-foreground font-display">{t('auth.passwordUpdatedTitle')}</h2>
                        <p className="text-sm text-muted-foreground mt-1.5">
                            {t('auth.passwordUpdatedRedirect')}
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mb-6">
                        <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary mb-4">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <h2 className="text-2xl font-semibold text-foreground font-display tracking-tight">{t('auth.chooseNewPassword')}</h2>
                        <p className="text-sm text-muted-foreground mt-1.5">
                            {t('auth.chooseNewPasswordSubtitle')}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="password">{t('auth.newPasswordLabel')}</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPw ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder={t('auth.minimumChars')}
                                    {...register('password')}
                                    aria-invalid={!!errors.password}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPw(v => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                                    aria-label={showPw ? t('auth.hidePassword') : t('auth.showPassword')}
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
                                    <p className="text-[11px] text-muted-foreground">{t('auth.strength')}: <span className="font-medium text-foreground">{strength.label}</span></p>
                                </div>
                            )}
                            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="confirm">{t('auth.confirmNewPassword')}</Label>
                            <Input
                                id="confirm"
                                type={showPw ? 'text' : 'password'}
                                autoComplete="new-password"
                                placeholder={t('auth.reEnterPassword')}
                                {...register('confirm')}
                                aria-invalid={!!errors.confirm}
                            />
                            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
                        </div>

                        <Button type="submit" className="w-full gap-2" disabled={loading}>
                            {loading ? t('auth.updating') : (<>{t('auth.resetPasswordAction')} <ArrowRight className="h-4 w-4" /></>)}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link
                            to="/login"
                            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            {t('auth.cancelReturn')}
                        </Link>
                    </div>
                </>
            )}
        </AuthLayout>
    )
}

export default ResetPasswordPage
