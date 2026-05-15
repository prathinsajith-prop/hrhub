import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, User, Users } from 'lucide-react'

import { useViewModeStore } from '@/store/viewModeStore'
import { useAuthStore } from '@/store/authStore'
import { canSwitchToManager } from '@/lib/permissions'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * Refined "viewing-as" pill — shows the current view with a subtle switch affordance.
 * Plain employees (no dept_head role) see nothing. Clicking flips to the other view.
 */
export function ModeToggle({ className }: { className?: string }) {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const navigate = useNavigate()
    const mode = useViewModeStore((s) => s.mode)
    const setMode = useViewModeStore((s) => s.setMode)

    if (!canSwitchToManager(user)) return null

    const next = mode === 'employee' ? 'manager' : 'employee'
    const CurrentIcon = mode === 'manager' ? Users : User
    const currentLabel = t(`mode.${mode}`)
    const nextLabel = t(`mode.${next}`)

    function switchMode() {
        setMode(next)
        navigate(next === 'manager' ? ROUTES.managerHome : ROUTES.employeeHome)
    }

    return (
        <button
            type="button"
            onClick={switchMode}
            title={`Switch to ${nextLabel} view`}
            aria-label={`Currently viewing as ${currentLabel}. Switch to ${nextLabel} view.`}
            className={cn(
                'group inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-1 py-1 text-xs shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:bg-card hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                className,
            )}
        >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 px-2.5 py-1 text-white">
                <CurrentIcon className="h-3 w-3" aria-hidden />
                <span className="font-semibold tracking-wide">{currentLabel}</span>
            </span>
            <span className="flex items-center gap-1 pe-2 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                <ArrowLeftRight className="h-3 w-3" aria-hidden data-rtl-flip />
                <span>{nextLabel}</span>
            </span>
        </button>
    )
}
