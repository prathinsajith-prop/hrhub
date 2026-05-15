import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { User, Users } from 'lucide-react'

import { useViewModeStore } from '@/store/viewModeStore'
import { useAuthStore } from '@/store/authStore'
import { canSwitchToManager } from '@/lib/permissions'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * Two-state segmented pill: Employee | Manager. Only rendered for users
 * whose roles include `dept_head` — plain employees see no toggle.
 */
export function ModeToggle() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const navigate = useNavigate()
    const mode = useViewModeStore((s) => s.mode)
    const setMode = useViewModeStore((s) => s.setMode)

    if (!canSwitchToManager(user)) return null

    function pick(next: 'employee' | 'manager') {
        if (next === mode) return
        setMode(next)
        navigate(next === 'manager' ? ROUTES.managerHome : ROUTES.employeeHome)
    }

    return (
        <div
            role="group"
            aria-label="Switch view"
            className="inline-flex items-center rounded-full border border-border bg-card/85 p-1 shadow-sm backdrop-blur-sm"
        >
            <ToggleButton
                active={mode === 'employee'}
                onClick={() => pick('employee')}
                icon={<User className="h-3.5 w-3.5" aria-hidden />}
                label={t('mode.employee')}
            />
            <ToggleButton
                active={mode === 'manager'}
                onClick={() => pick('manager')}
                icon={<Users className="h-3.5 w-3.5" aria-hidden />}
                label={t('mode.manager')}
            />
        </div>
    )
}

function ToggleButton({
    active,
    onClick,
    icon,
    label,
}: {
    active: boolean
    onClick: () => void
    icon: React.ReactNode
    label: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active
                    ? 'bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-md shadow-indigo-300/40'
                    : 'text-muted-foreground hover:text-foreground',
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    )
}
