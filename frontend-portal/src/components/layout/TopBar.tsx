import { useTranslation } from 'react-i18next'
import { LogOut, Moon, Sparkles, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useAuthStore } from '@/store/authStore'
import { canSwitchToManager } from '@/lib/permissions'
import { initialsOf } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { LanguageToggle } from './LanguageToggle'
import { ModeToggle } from './ModeToggle'
import { NotificationsBell } from './NotificationsBell'

export function TopBar() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const tenant = useAuthStore((s) => s.tenant)
    const logout = useAuthStore((s) => s.logout)
    const { theme, setTheme } = useTheme()
    const showModeToggle = canSwitchToManager(user)

    return (
        <header className="sticky top-0 z-30 header-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-md shadow-indigo-200/60">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-display text-sm font-bold leading-tight">
                            {tenant?.name ?? t('app.name')}
                        </div>
                        <div className="truncate text-[11px] leading-tight text-muted-foreground">
                            {user?.name ?? ''}
                        </div>
                    </div>
                </div>

                {/* Mode toggle — centered, always visible for dept_heads on every screen size */}
                {showModeToggle ? (
                    <div className="hidden flex-1 justify-center sm:flex">
                        <ModeToggle />
                    </div>
                ) : (
                    <div className="flex-1" aria-hidden />
                )}

                <div className="flex items-center gap-1.5">
                    <NotificationsBell />
                    <LanguageToggle />
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Toggle theme"
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    >
                        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </Button>
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-[11px] font-semibold">{initialsOf(user?.name)}</AvatarFallback>
                    </Avatar>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('auth.signOut')}
                        onClick={logout}
                    >
                        <LogOut className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* On mobile (<sm) the centered toggle would overflow next to the logo,
                so it gets its own dedicated row beneath the top bar. */}
            {showModeToggle ? (
                <div className="border-t border-border/60 bg-background/50 px-4 py-2 backdrop-blur-md sm:hidden flex justify-center">
                    <ModeToggle />
                </div>
            ) : null}
        </header>
    )
}
