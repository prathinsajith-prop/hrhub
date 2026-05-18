import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck, Sparkles } from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import { ROUTES } from '@/lib/routes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ResetPasswordPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const token = useMemo(() => params.get('token') ?? '', [params])

    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    async function onSubmit(e: FormEvent) {
        e.preventDefault()
        if (submitting) return
        if (!token) {
            toast.error(t('auth.missingToken'))
            return
        }
        if (password.length < 8) {
            toast.error(t('auth.passwordTooShort'))
            return
        }
        if (password !== confirm) {
            toast.error(t('auth.passwordsDontMatch'))
            return
        }
        setSubmitting(true)
        try {
            await api.post('/auth/reset-password', { token, password })
            toast.success(t('auth.resetSuccess'))
            navigate(ROUTES.login, { replace: true })
        } catch (err) {
            const message =
                err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('errors.saveFailed')
            toast.error(message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/40 to-sky-50 px-4 py-10 dark:from-slate-950 dark:via-indigo-950/30 dark:to-sky-950/20">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -left-32 top-10 size-72 rounded-full bg-indigo-300/40 blur-3xl dark:bg-indigo-500/20" />
                <div className="absolute right-[-6rem] top-1/2 size-80 -translate-y-1/2 rounded-full bg-sky-300/40 blur-3xl dark:bg-sky-500/20" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="rounded-3xl border border-white/60 bg-white/70 p-8 shadow-2xl shadow-indigo-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-card/70">
                    <div className="mb-6 flex items-center gap-2">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-300/50">
                            <Sparkles className="size-5" />
                        </div>
                        <div>
                            <div className="font-display text-lg font-bold leading-none">{t('app.name')}</div>
                            <div className="text-xs text-muted-foreground">{t('app.tagline')}</div>
                        </div>
                    </div>

                    <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                        <ShieldCheck className="size-6" />
                    </div>
                    <h1 className="font-display text-2xl font-semibold tracking-tight">{t('auth.resetTitle')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t('auth.resetSub')}</p>

                    {!token ? (
                        <p className="mt-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            {t('auth.missingToken')}
                        </p>
                    ) : (
                        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                            <div className="space-y-1.5">
                                <Label htmlFor="password">{t('auth.newPassword')}</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                        minLength={8}
                                        className="h-11 bg-white/80 pe-11 dark:bg-card/60"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        aria-pressed={showPassword}
                                        className="absolute end-0 top-0 flex size-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
                                    >
                                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="confirm">{t('auth.confirmPassword')}</Label>
                                <Input
                                    id="confirm"
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                    className="h-11 bg-white/80 dark:bg-card/60"
                                />
                            </div>

                            <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
                                {submitting ? (
                                    <>
                                        <Loader2 className="size-4 animate-spin" /> {t('auth.resetSubmitting')}
                                    </>
                                ) : (
                                    t('auth.resetSubmit')
                                )}
                            </Button>
                        </form>
                    )}

                    <div className="mt-6 text-center text-sm">
                        <Link
                            to={ROUTES.login}
                            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                            <ArrowLeft className="size-3.5" /> {t('auth.backToLogin')}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
