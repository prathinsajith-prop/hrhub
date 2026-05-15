import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
    ArrowLeftRight,
    Check,
    Languages,
    LogOut,
    Moon,
    Sparkles,
    Sun,
    User as UserIcon,
    Users as UsersIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'

import { useAuthStore } from '@/store/authStore'
import { useViewModeStore } from '@/store/viewModeStore'
import { canSwitchToManager } from '@/lib/permissions'
import { ROUTES } from '@/lib/routes'
import { cn, initialsOf } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ModeToggle } from './ModeToggle'
import { NotificationsBell } from './NotificationsBell'

const LANGUAGES: { code: 'en' | 'ar'; label: string; native: string }[] = [
    { code: 'en', label: 'English', native: 'EN' },
    { code: 'ar', label: 'العربية', native: 'AR' },
]

export function TopBar() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const user = useAuthStore((s) => s.user)
    const tenant = useAuthStore((s) => s.tenant)
    const logout = useAuthStore((s) => s.logout)
    const { theme, setTheme } = useTheme()
    const mode = useViewModeStore((s) => s.mode)
    const setMode = useViewModeStore((s) => s.setMode)

    const currentLang = (i18n.language?.slice(0, 2) ?? 'en') as 'en' | 'ar'
    const canManage = canSwitchToManager(user)
    const nextMode = mode === 'employee' ? 'manager' : 'employee'

    function switchMode() {
        setMode(nextMode)
        navigate(nextMode === 'manager' ? ROUTES.managerHome : ROUTES.employeeHome)
    }

    return (
        <header className="sticky top-0 z-30 header-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
                {/* ── Brand ──────────────────────────────────────────────── */}
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-md shadow-indigo-200/60">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-display text-sm font-bold leading-tight">
                            {tenant?.name ?? t('app.name')}
                        </div>
                        {user?.name ? (
                            <div className="hidden truncate text-[11px] leading-tight text-muted-foreground sm:block">
                                {user.name}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* ── Mode toggle (centered on sm+, dept_heads only) ───── */}
                <div className="hidden flex-1 justify-center sm:flex">
                    {canManage ? <ModeToggle /> : null}
                </div>
                <div className="flex-1 sm:hidden" aria-hidden />

                {/* ── Right rail: bell + account menu ───────────────────── */}
                <div className="flex items-center gap-1.5">
                    <NotificationsBell />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Account menu"
                                className="relative rounded-full ring-2 ring-transparent transition-all hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-primary/40"
                            >
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={user?.avatarUrl ?? undefined} />
                                    <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-sky-100 text-[11px] font-semibold text-indigo-700 dark:from-indigo-950/60 dark:to-sky-950/40 dark:text-indigo-200">
                                        {initialsOf(user?.name)}
                                    </AvatarFallback>
                                </Avatar>
                                {/* Online indicator */}
                                <span className="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" aria-hidden />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
                            {/* Identity */}
                            <div className="flex items-center gap-3 px-2 py-2">
                                <Avatar className="h-10 w-10">
                                    <AvatarImage src={user?.avatarUrl ?? undefined} />
                                    <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-sky-100 text-xs font-semibold text-indigo-700 dark:from-indigo-950/60 dark:to-sky-950/40 dark:text-indigo-200">
                                        {initialsOf(user?.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold">{user?.name ?? ''}</div>
                                    <div className="truncate text-[11px] text-muted-foreground">{user?.email ?? ''}</div>
                                </div>
                            </div>

                            {/* Mode switch (only for dept_heads; helps on mobile where the
                                center pill is hidden) */}
                            {canManage ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={switchMode} className="gap-2.5 sm:hidden">
                                        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" data-rtl-flip />
                                        <span className="flex-1">Switch to {t(`mode.${nextMode}`)}</span>
                                        {nextMode === 'manager' ? (
                                            <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        ) : (
                                            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                    </DropdownMenuItem>
                                </>
                            ) : null}

                            <DropdownMenuSeparator />

                            {/* Appearance */}
                            <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Appearance
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className="gap-2.5"
                            >
                                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                            </DropdownMenuItem>

                            {/* Language */}
                            <DropdownMenuLabel className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <Languages className="h-3 w-3" /> Language
                            </DropdownMenuLabel>
                            {LANGUAGES.map((l) => (
                                <DropdownMenuItem
                                    key={l.code}
                                    onClick={() => i18n.changeLanguage(l.code)}
                                    className="justify-between gap-2"
                                >
                                    <span className="font-medium">{l.label}</span>
                                    {currentLang === l.code ? (
                                        <Check className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                        <span className="text-[10px] tracking-wider text-muted-foreground">
                                            {l.native}
                                        </span>
                                    )}
                                </DropdownMenuItem>
                            ))}

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={logout}
                                className={cn(
                                    'gap-2.5 text-rose-600 focus:bg-rose-50 focus:text-rose-700',
                                    'dark:text-rose-300 dark:focus:bg-rose-950/40',
                                )}
                            >
                                <LogOut className="h-4 w-4" />
                                <span>{t('auth.signOut')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    )
}
