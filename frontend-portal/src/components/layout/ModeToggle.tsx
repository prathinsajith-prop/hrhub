import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, User, Users } from 'lucide-react'

import { useViewModeStore } from '@/store/viewModeStore'
import { useAuthStore } from '@/store/authStore'
import { canSwitchToManager } from '@/lib/permissions'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * Single-button toggle: shows ONLY the target mode (where you can switch to).
 * Plain employees see nothing. Dept_heads in Employee view see "→ Manager",
 * Dept_heads in Manager view see "→ Employee".
 */
export function ModeToggle({ className }: { className?: string }) {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const navigate = useNavigate()
    const mode = useViewModeStore((s) => s.mode)
    const setMode = useViewModeStore((s) => s.setMode)

    if (!canSwitchToManager(user)) return null

    const target = mode === 'employee' ? 'manager' : 'employee'
    const TargetIcon = target === 'manager' ? Users : User
    const targetLabel = t(`mode.${target}`)

    function switchMode() {
        setMode(target)
        navigate(target === 'manager' ? ROUTES.managerHome : ROUTES.employeeHome)
    }

    return (
        <button
            type="button"
            onClick={switchMode}
            aria-label={`Switch to ${targetLabel} view`}
            title={`Switch to ${targetLabel} view`}
            className={cn(
                'group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-300/40 transition-all hover:shadow-lg hover:shadow-indigo-300/60 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                className,
            )}
        >
            <ArrowLeftRight className="h-3 w-3 opacity-80" aria-hidden data-rtl-flip />
            <TargetIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="tracking-wide">{targetLabel}</span>
        </button>
    )
}
