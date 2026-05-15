import type { User, UserRole } from '@/types'

export function getRoles(user: User | null | undefined): UserRole[] {
    if (!user) return []
    const all = (user.roles && user.roles.length > 0 ? user.roles : [user.role]) as UserRole[]
    return all
}

/** Portal access: anyone with `employee` or `dept_head` role. HR/admin/PRO are blocked. */
export function canUsePortal(user: User | null | undefined): boolean {
    const roles = getRoles(user)
    return roles.includes('employee') || roles.includes('dept_head')
}

/** Manager mode requires dept_head. */
export function canSwitchToManager(user: User | null | undefined): boolean {
    return getRoles(user).includes('dept_head')
}

/** True for roles that belong to the admin app instead. */
export function isAdminRoleOnly(user: User | null | undefined): boolean {
    const roles = getRoles(user)
    const adminRoles: UserRole[] = ['hr_manager', 'super_admin', 'pro_officer']
    const hasAdmin = roles.some((r) => adminRoles.includes(r))
    const hasPortal = roles.includes('employee') || roles.includes('dept_head')
    return hasAdmin && !hasPortal
}
