import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, Sparkles } from 'lucide-react'

import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useViewModeStore } from '@/store/viewModeStore'
import { ROUTES, ADMIN_APP_URL } from '@/lib/routes'
import { canSwitchToManager, canUsePortal, isAdminRoleOnly } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Tenant, User } from '@/types'

interface LoginResponse {
    data: {
        accessToken: string
        refreshToken: string
        user: User
        tenant: Tenant
    }
}

export function LoginPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const login = useAuthStore((s) => s.login)
    const setMode = useViewModeStore((s) => s.setMode)
    const emailRef = useRef<HTMLInputElement>(null)

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [keepSignedIn, setKeepSignedIn] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [capsLock, setCapsLock] = useState(false)

    // Auto-focus the email field on first render — most natural starting point.
    useEffect(() => {
        emailRef.current?.focus()
    }, [])

    // Clear any inline error as soon as the user edits a field. Done in the
    // change handlers (not in a useEffect) so we don't fight react-hooks/set-state-in-effect.
    function onEmailChange(v: string) {
        setEmail(v)
        if (error) setError(null)
    }
    function onPasswordChange(v: string) {
        setPassword(v)
        if (error) setError(null)
    }

    function detectCapsLock(e: KeyboardEvent<HTMLInputElement>) {
        const on = typeof e.getModifierState === 'function' ? e.getModifierState('CapsLock') : false
        setCapsLock(on)
    }

    async function onSubmit(e: FormEvent) {
        e.preventDefault()
        if (submitting) return
        setSubmitting(true)
        setError(null)
        try {
            const res = await api.post<LoginResponse>('/auth/login', { email: email.trim(), password })
            const { user, tenant, accessToken, refreshToken } = res.data

            // HR/super_admin/pro_officer-only accounts belong in the admin app.
            if (isAdminRoleOnly(user) || !canUsePortal(user)) {
                login(user, tenant, accessToken, refreshToken, keepSignedIn)
                navigate(ROUTES.notAuthorized, { replace: true })
                return
            }

            login(user, tenant, accessToken, refreshToken, keepSignedIn)

            // Determine landing mode.
            //  - If the user can manage a team (dept_head), default to MANAGER on every login —
            //    that's their unique privilege and where the most actionable work lives. They
            //    can still flip to Employee mode at any time via the top-bar pill.
            //  - If they can't manage, force Employee mode (in case a stale store had 'manager').
            const canManage = canSwitchToManager(user)
            if (canManage) setMode('manager')
            else setMode('employee')
            navigate(canManage ? ROUTES.managerHome : ROUTES.employeeHome, { replace: true })
        } catch (err) {
            const message =
                err instanceof ApiError
                    ? err.statusCode === 401
                        ? t('auth.invalidCredentials')
                        : err.message
                    : err instanceof Error
                      ? err.message
                      : t('auth.invalidCredentials')
            setError(message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/40 to-sky-50 px-4 py-10 dark:from-slate-950 dark:via-indigo-950/30 dark:to-sky-950/20">
            {/* Background atmosphere */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -left-32 top-10 size-72 rounded-full bg-indigo-300/40 blur-3xl dark:bg-indigo-500/20" />
                <div className="absolute right-[-6rem] top-1/2 size-80 -translate-y-1/2 rounded-full bg-sky-300/40 blur-3xl dark:bg-sky-500/20" />
                <div className="absolute -bottom-20 left-1/2 size-72 -translate-x-1/2 rounded-full bg-fuchsia-200/30 blur-3xl dark:bg-fuchsia-500/10" />
            </div>

            <main className="relative w-full max-w-md page-slide-up">
                {/* Brand mark — sits above the card to feel like an app header */}
                <div className="mb-6 flex items-center justify-center gap-2.5 text-foreground">
                    <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-300/50">
                        <Sparkles className="size-5" />
                    </div>
                    <div>
                        <div className="font-display text-base font-bold leading-tight">{t('app.name')}</div>
                        <div className="text-[11px] leading-tight text-muted-foreground">{t('app.tagline')}</div>
                    </div>
                </div>

                <div className="rounded-3xl border border-white/60 bg-white/80 p-7 shadow-[0_24px_60px_-24px_rgba(99,102,241,0.35)] backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-card/75">
                    <div className="space-y-1.5 text-center">
                        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[26px]">
                            {t('auth.welcomeBack')}
                        </h1>
                        <p className="text-sm text-muted-foreground">{t('auth.welcomeBackSub')}</p>
                    </div>

                    <form className="mt-7 space-y-4" onSubmit={onSubmit} noValidate>
                        {error ? (
                            <div
                                role="alert"
                                aria-live="polite"
                                className="flex items-start gap-2.5 rounded-xl border border-rose-200/60 bg-rose-50/70 px-3.5 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200"
                            >
                                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                                <span>{error}</span>
                            </div>
                        ) : null}

                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-sm font-medium">
                                {t('auth.email')}
                            </Label>
                            <div className="relative">
                                <Mail
                                    className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden
                                />
                                <Input
                                    ref={emailRef}
                                    id="email"
                                    name="email"
                                    type="email"
                                    inputMode="email"
                                    value={email}
                                    onChange={(e) => onEmailChange(e.target.value)}
                                    placeholder="you@company.com"
                                    autoComplete="email"
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    required
                                    aria-invalid={!!error}
                                    className={cn(
                                        'h-12 rounded-xl bg-white/90 ps-10 text-[15px] shadow-sm transition-shadow dark:bg-card/70',
                                        error && 'border-rose-300 focus-visible:ring-rose-300',
                                    )}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password" className="text-sm font-medium">
                                    {t('auth.password')}
                                </Label>
                                <Link
                                    to={ROUTES.forgotPassword}
                                    className="text-xs font-medium text-primary hover:underline"
                                >
                                    {t('auth.forgotLink')}
                                </Link>
                            </div>
                            <div className="relative">
                                <Lock
                                    className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden
                                />
                                <Input
                                    id="password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => onPasswordChange(e.target.value)}
                                    onKeyDown={detectCapsLock}
                                    onKeyUp={detectCapsLock}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    required
                                    aria-invalid={!!error}
                                    className={cn(
                                        'h-12 rounded-xl bg-white/90 ps-10 pe-12 text-[15px] shadow-sm transition-shadow dark:bg-card/70',
                                        error && 'border-rose-300 focus-visible:ring-rose-300',
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    aria-pressed={showPassword}
                                    className="absolute end-0 top-0 flex size-12 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    tabIndex={password ? 0 : -1}
                                >
                                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                            {capsLock ? (
                                <p className="flex items-center gap-1.5 pt-0.5 text-xs text-amber-700 dark:text-amber-300">
                                    <AlertCircle className="size-3.5" aria-hidden />
                                    Caps Lock is on
                                </p>
                            ) : null}
                        </div>

                        <label className="flex cursor-pointer items-center gap-2.5 select-none pt-1 text-sm text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={keepSignedIn}
                                onChange={(e) => setKeepSignedIn(e.target.checked)}
                                className="size-4 rounded border-border accent-primary"
                                aria-label={t('auth.keepSignedIn')}
                            />
                            <span>{t('auth.keepSignedIn')}</span>
                        </label>

                        <Button
                            type="submit"
                            className="h-12 w-full rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-[15px] font-semibold text-white shadow-lg shadow-indigo-300/40 transition-transform hover:from-indigo-600 hover:to-sky-600 hover:shadow-xl active:translate-y-[1px] disabled:translate-y-0"
                            disabled={submitting || email.length === 0 || password.length === 0}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" /> {t('auth.signingIn')}
                                </>
                            ) : (
                                <>
                                    {t('auth.signInButton')}
                                    <ArrowRight className="size-4" data-rtl-flip />
                                </>
                            )}
                        </Button>
                    </form>
                </div>

                <p className="mt-5 text-center text-xs text-muted-foreground">
                    Admin or HR user?{' '}
                    <a href={ADMIN_APP_URL} className="font-medium text-primary hover:underline">
                        Open admin app
                    </a>
                </p>
            </main>
        </div>
    )
}
