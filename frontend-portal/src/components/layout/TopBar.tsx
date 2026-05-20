import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LogOut, Moon, Sparkles, Sun, User } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useAuthStore } from '@/store/authStore'
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

export function TopBar() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const user = useAuthStore((s) => s.user)
    const tenant = useAuthStore((s) => s.tenant)
    const logout = useAuthStore((s) => s.logout)
    const { theme, setTheme } = useTheme()

    const canManage = canSwitchToManager(user)

    // Track scroll past the first ~8px so the header can drop its border and
    // sit cleanly over the page when at the top, then snap a subtle border
    // and shadow on scroll. Cheap listener (passive, scoped to window).
    const [scrolled, setScrolled] = useState(false)
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8)
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <header
            className={cn(
                'sticky top-0 z-30 header-blur transition-[box-shadow,border-color,background-color] duration-200',
                scrolled
                    ? 'shadow-sm border-b border-border/70'
                    : 'border-b border-transparent',
            )}
        >
            <div
                className={cn(
                    'mx-auto flex max-w-6xl items-center gap-3 px-4 transition-[height] duration-200 sm:px-6',
                    // Slight compression on scroll so the header feels lighter
                    // and gives more space to page content.
                    scrolled ? 'h-12' : 'h-14',
                )}
            >
                {/* ── Brand ──────────────────────────────────────────────── */}
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-md shadow-indigo-200/60">
                        <Sparkles className="size-4" />
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

                {/* ── Spacer ─────────────────────────────────────────────── */}
                <div className="flex-1" aria-hidden />

                {/* ── Right rail: bell · mode toggle · account menu ──────
                    Mode toggle sits inline just to the left of the avatar so
                    `dept_head` users can flip context without leaving the
                    header's right cluster. Hidden on mobile (the toggle has
                    its own discoverable row below the header instead — see
                    the sm:hidden block at the bottom of this file). */}
                <div className="flex items-center gap-1.5">
                    <NotificationsBell />

                    {canManage ? (
                        <div className="hidden sm:block">
                            <ModeToggle />
                        </div>
                    ) : null}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label="Account menu"
                                className="relative rounded-full ring-2 ring-transparent transition-all hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-primary/40"
                            >
                                <Avatar className="size-9">
                                    <AvatarImage src={user?.avatarUrl ?? undefined} />
                                    <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-sky-100 text-[11px] font-semibold text-indigo-700 dark:from-indigo-950/60 dark:to-sky-950/40 dark:text-indigo-200">
                                        {initialsOf(user?.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span
                                    className="absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-background bg-emerald-500"
                                    aria-hidden
                                />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
                            <div className="flex items-center gap-3 p-2">
                                <Avatar className="size-10">
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

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                                onSelect={() => navigate(ROUTES.employeeProfile)}
                                className="gap-2.5"
                            >
                                <User className="size-4" />
                                <span>{t('nav.profile')}</span>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Appearance
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className="gap-2.5"
                            >
                                {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                            </DropdownMenuItem>

                            {/* Language switching moved to Profile → Settings — single home for it. */}

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={logout}
                                className={cn(
                                    'gap-2.5 text-rose-600 focus:bg-rose-50 focus:text-rose-700',
                                    'dark:text-rose-300 dark:focus:bg-rose-950/40',
                                )}
                            >
                                <LogOut className="size-4" />
                                <span>{t('auth.signOut')}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Mobile mode toggle — visible row below the header for dept_heads.
                Restored because hiding it inside the avatar menu made it undiscoverable
                — users couldn't find how to flip into Manager view. */}
            {canManage ? (
                <div className="flex justify-center border-t border-border/60 bg-background/50 px-4 py-2 backdrop-blur-md sm:hidden">
                    <ModeToggle />
                </div>
            ) : null}
        </header>
    )
}
