import { cn } from '@/lib/utils'
import { ROLE_BADGE_STYLE, ROLE_BADGE_BORDER_ACTIVE } from '@/lib/enums'

export const MULTI_ROLE_OPTIONS = [
    { id: 'hr_manager', label: 'HR Manager' },
    { id: 'pro_officer', label: 'PRO Officer' },
    { id: 'dept_head', label: 'Dept Manager' },
    { id: 'employee', label: 'Employee' },
] as const

export const MULTI_ROLE_OPTIONS_WITH_SUPER = [
    { id: 'super_admin', label: 'Super Admin' },
    ...MULTI_ROLE_OPTIONS,
] as const

interface Props {
    roles: string[]
    onChange: (roles: string[]) => void
    availableRoles?: readonly { id: string; label: string }[]
    disabled?: boolean
}

/**
 * Toggle-button group for multi-role selection.
 * At least one role must remain selected at all times.
 * Super Admin users are rendered as a read-only badge.
 */
export function MultiRoleToggle({
    roles,
    onChange,
    availableRoles = MULTI_ROLE_OPTIONS,
    disabled = false,
}: Props) {
    if (roles.includes('super_admin')) {
        return (
            <span className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                ROLE_BADGE_STYLE['super_admin'],
            )}>
                Super Admin
            </span>
        )
    }

    return (
        <div className="flex flex-wrap gap-1">
            {availableRoles.filter(r => r.id !== 'super_admin').map(r => {
                const isActive = roles.includes(r.id)
                const isLastActive = isActive && roles.length <= 1
                return (
                    <button
                        key={r.id}
                        type="button"
                        disabled={disabled || isLastActive}
                        onClick={() => {
                            if (isActive) {
                                if (!isLastActive) onChange(roles.filter(x => x !== r.id))
                            } else {
                                onChange([...roles, r.id])
                            }
                        }}
                        title={isLastActive ? 'At least one role required' : undefined}
                        className={cn(
                            'text-xs font-medium px-2.5 py-1 rounded-full border-2 transition-colors',
                            isActive
                                ? cn(
                                    ROLE_BADGE_STYLE[r.id] ?? 'bg-slate-100 text-slate-600',
                                    ROLE_BADGE_BORDER_ACTIVE[r.id] ?? 'border-slate-500',
                                    'shadow-sm',
                                )
                                : 'bg-muted/40 text-muted-foreground border-border hover:border-foreground/40 hover:bg-muted/70 hover:text-foreground',
                            (disabled || isLastActive) && 'opacity-60 cursor-not-allowed',
                        )}
                    >
                        {r.label}
                    </button>
                )
            })}
        </div>
    )
}
