import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LogOut, Moon, Sun, User } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useAuthStore } from '@/store/authStore'
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

const AVATAR_FALLBACK = 'bg-gradient-to-br from-indigo-100 to-sky-100 text-indigo-700 dark:from-indigo-950/60 dark:to-sky-950/40 dark:text-indigo-200'

/**
 * Avatar trigger + dropdown menu (profile / theme / sign-out). Extracted from
 * TopBar so the header file can focus purely on layout.
 */
export function AccountMenu() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const user = useAuthStore((s) => s.user)
    const logout = useAuthStore((s) => s.logout)
    const { theme, setTheme } = useTheme()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={t('nav.profile')}
                    className="relative rounded-full ring-2 ring-transparent transition-all hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-primary/40"
                >
                    <Avatar className="size-9">
                        <AvatarImage src={user?.avatarUrl ?? undefined} />
                        <AvatarFallback className={cn(AVATAR_FALLBACK, 'text-[11px] font-semibold')}>
                            {initialsOf(user?.name)}
                        </AvatarFallback>
                    </Avatar>
                    <span
                        aria-hidden
                        className="absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-background bg-emerald-500"
                    />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
                {/* Identity header */}
                <div className="flex items-center gap-3 p-2">
                    <Avatar className="size-10">
                        <AvatarImage src={user?.avatarUrl ?? undefined} />
                        <AvatarFallback className={cn(AVATAR_FALLBACK, 'text-xs font-semibold')}>
                            {initialsOf(user?.name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{user?.name ?? ''}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{user?.email ?? ''}</div>
                    </div>
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuItem onSelect={() => navigate(ROUTES.employeeProfile)} className="gap-2.5">
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
    )
}
