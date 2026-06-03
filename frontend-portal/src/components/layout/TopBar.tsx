import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { canSwitchToManager } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ModeToggle } from './ModeToggle'
import { NotificationsBell } from './NotificationsBell'
import { HeaderNav } from './HeaderNav'
import { AccountMenu } from './AccountMenu'

const CONTAINER_WIDTHS = 'max-w-6xl xl:max-w-7xl 2xl:max-w-[1536px] 3xl:max-w-[1760px]'

/**
 * Sticky application header — three regions on one row:
 *   [Brand]   [HeaderNav]   [Right cluster: bell · mode toggle · avatar]
 *
 * Compresses on scroll. On mobile, HeaderNav is hidden and the mode-toggle
 * sits in a second row below the header so dept_heads can still find it.
 */
export function TopBar() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const tenant = useAuthStore((s) => s.tenant)
    const canManage = canSwitchToManager(user)
    const scrolled = useScrollPast(8)

    return (
        <header
            className={cn(
                'sticky top-0 z-30 header-blur transition-[box-shadow,border-color] duration-200',
                scrolled
                    ? 'shadow-sm border-b border-border/70'
                    : 'border-b border-border/40',
            )}
        >
            <div
                className={cn(
                    'mx-auto flex items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 transition-[height] duration-200',
                    CONTAINER_WIDTHS,
                    // Taller on md+ to fit the stacked-icon nav comfortably.
                    scrolled ? 'h-16 md:h-[68px]' : 'h-16 md:h-20',
                )}
            >
                <Brand tenantName={tenant?.name ?? t('app.name')} userName={user?.name} />

                <HeaderNav />

                <div className="flex shrink-0 items-center gap-2 sm:gap-1.5">
                    <NotificationsBell />
                    {canManage ? (
                        <>
                            {/* Mobile: compact icon-only switch. Desktop: full
                                pill with label. Same action, presentation
                                adapted to the available room. */}
                            <ModeToggle variant="compact" className="sm:hidden" />
                            <div className="hidden sm:block">
                                <ModeToggle />
                            </div>
                        </>
                    ) : null}
                    <AccountMenu />
                </div>
            </div>
        </header>
    )
}

function Brand({ tenantName, userName }: { tenantName: string; userName?: string }) {
    return (
        <div className="flex shrink-0 items-center gap-2.5 max-w-[240px]">
            <div
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-md shadow-indigo-200/60"
            >
                <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
                <div className="truncate font-display text-sm font-bold leading-tight">
                    {tenantName}
                </div>
                {userName ? (
                    <div className="hidden truncate text-[11px] leading-tight text-muted-foreground sm:block">
                        {userName}
                    </div>
                ) : null}
            </div>
        </div>
    )
}

/** True once the page has been scrolled past `threshold` pixels. Used to
 *  visually settle the header on scroll without a layout shift. */
function useScrollPast(threshold: number): boolean {
    const [scrolled, setScrolled] = useState(() =>
        typeof window !== 'undefined' && window.scrollY > threshold,
    )
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > threshold)
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [threshold])
    return scrolled
}
