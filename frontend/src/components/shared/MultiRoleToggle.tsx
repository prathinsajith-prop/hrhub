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
 *
 * Every assignable role renders as its own chip:
 *  • filled with the role's brand colour when assigned
 *  • muted / dashed outline when unassigned (click to assign)
 *
 * At least one role must remain selected at all times — the last
 * assigned chip is disabled with a "At least one role required"
 * tooltip so a misclick can't strand a user with zero permissions.
 *
 * Previously this component bailed out with a read-only "Super Admin"
 * badge whenever the target carried that role — which meant the modal
 * showed *only* one chip and HR could neither add nor remove anything.
 * That short-circuit is gone: super_admin is now just another chip
 * for callers that have the right to manage it. Whether super_admin
 * appears at all is gated upstream by the caller passing the right
 * `availableRoles` array (see `MULTI_ROLE_OPTIONS_WITH_SUPER`); the
 * `isLastActive` rule keeps even a sole super_admin chip from being
 * accidentally removed.
 */
export function MultiRoleToggle({
    roles,
    onChange,
    availableRoles = MULTI_ROLE_OPTIONS,
    disabled = false,
}: Props) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {availableRoles.map(r => {
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
                        title={
                            isLastActive
                                ? 'At least one role required'
                                : isActive
                                    ? `Remove ${r.label}`
                                    : `Assign ${r.label}`
                        }
                        className={cn(
                            'text-xs font-medium px-2.5 py-1 rounded-full border-2 transition-all',
                            isActive
                                ? cn(
                                    ROLE_BADGE_STYLE[r.id] ?? 'bg-slate-100 text-slate-600',
                                    ROLE_BADGE_BORDER_ACTIVE[r.id] ?? 'border-slate-500',
                                    'shadow-sm',
                                    !isLastActive && 'hover:opacity-80',
                                )
                                // Unassigned: dashed outline so it visually
                                // reads as "tap to add" — not just a faded
                                // version of an assigned chip.
                                : 'bg-transparent text-muted-foreground border-dashed border-border hover:border-foreground/40 hover:bg-muted/40 hover:text-foreground',
                            (disabled || isLastActive) && 'opacity-70 cursor-not-allowed',
                        )}
                    >
                        {r.label}
                    </button>
                )
            })}
        </div>
    )
}
