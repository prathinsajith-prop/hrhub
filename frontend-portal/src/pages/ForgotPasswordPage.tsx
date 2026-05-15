import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, Loader2, Mail, Sparkles } from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import { ROUTES } from '@/lib/routes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotPasswordPage() {
    const { t } = useTranslation()
    const [email, setEmail] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [sent, setSent] = useState(false)

    async function onSubmit(e: FormEvent) {
        e.preventDefault()
        if (submitting) return
        setSubmitting(true)
        try {
            await api.post('/auth/forgot-password', { email })
            setSent(true)
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
                <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-indigo-300/40 blur-3xl dark:bg-indigo-500/20" />
                <div className="absolute right-[-6rem] top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-sky-300/40 blur-3xl dark:bg-sky-500/20" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="rounded-3xl border border-white/60 bg-white/70 p-8 shadow-2xl shadow-indigo-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-card/70">
                    <div className="mb-6 flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-300/50">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="font-display text-lg font-bold leading-none">{t('app.name')}</div>
                            <div className="text-xs text-muted-foreground">{t('app.tagline')}</div>
                        </div>
                    </div>

                    {sent ? (
                        <div className="space-y-5 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="h-7 w-7" />
                            </div>
                            <div>
                                <h1 className="font-display text-xl font-semibold tracking-tight">
                                    {t('auth.forgotSentTitle')}
                                </h1>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {t('auth.forgotSentBody', { email })}
                                </p>
                            </div>
                            <Button asChild variant="outline" className="w-full">
                                <Link to={ROUTES.login}>
                                    <ArrowLeft className="h-4 w-4" /> {t('auth.backToLogin')}
                                </Link>
                            </Button>
                        </div>
                    ) : (
                        <>
                            <h1 className="font-display text-2xl font-semibold tracking-tight">
                                {t('auth.forgotTitle')}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">{t('auth.forgotSub')}</p>

                            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                                <div className="space-y-1.5">
                                    <Label htmlFor="email">{t('auth.email')}</Label>
                                    <div className="relative">
                                        <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            autoComplete="email"
                                            required
                                            className="h-11 bg-white/80 ps-9 dark:bg-card/60"
                                        />
                                    </div>
                                </div>

                                <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
                                    {submitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" /> {t('auth.forgotSubmitting')}
                                        </>
                                    ) : (
                                        t('auth.forgotSubmit')
                                    )}
                                </Button>
                            </form>

                            <div className="mt-6 text-center text-sm">
                                <Link
                                    to={ROUTES.login}
                                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" /> {t('auth.backToLogin')}
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
