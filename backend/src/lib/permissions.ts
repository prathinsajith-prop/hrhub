/**
 * Role hierarchy + permission map for the App Management module.
 * Layers cleanly on top of the existing HRHub roles (super_admin, hr_manager,
 * pro_officer, dept_head, employee) without changing the JWT shape or any
 * existing authorisation checks. Pure functions only — safe to import from
 * any layer (server, worker, tests).
 */

export type MemberRole = 'super_admin' | 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee'

export type Permission =
    | 'view_org'
    | 'manage_org'
    | 'manage_team'
    | 'invite_member'
    | 'remove_member'
    | 'change_role'
    | 'manage_apps'
    | 'manage_billing'

/** Higher number = higher privilege. Used for `hasRole(actor, required)`. */
export const ROLE_HIERARCHY: Record<MemberRole, number> = {
    employee: 1,
    dept_head: 2,
    pro_officer: 3,
    hr_manager: 4,
    super_admin: 5,
}

const ROLE_PERMISSIONS: Record<MemberRole, Permission[]> = {
    super_admin: [
        'view_org', 'manage_org', 'manage_team', 'invite_member',
        'remove_member', 'change_role', 'manage_apps', 'manage_billing',
    ],
    hr_manager: [
        'view_org', 'manage_team', 'invite_member', 'remove_member', 'change_role',
    ],
    pro_officer: ['view_org'],
    dept_head: ['view_org'],
    employee: ['view_org'],
}

export function hasRole(actor: MemberRole, required: MemberRole): boolean {
    return (ROLE_HIERARCHY[actor] ?? 0) >= (ROLE_HIERARCHY[required] ?? 0)
}

export function hasPermission(role: MemberRole, perm: Permission): boolean {
    return ROLE_PERMISSIONS[role]?.includes(perm) ?? false
}

export function getPermissions(role: MemberRole): Permission[] {
    return [...(ROLE_PERMISSIONS[role] ?? [])]
}

/**
 * Permission matrix exposed to clients via /tenants/current so the UI can
 * gate buttons without hard-coding the role list.
 */
export function buildPermissionMap(role: MemberRole): Record<Permission, boolean> {
    const granted = new Set(ROLE_PERMISSIONS[role] ?? [])
    const all: Permission[] = [
        'view_org', 'manage_org', 'manage_team', 'invite_member',
        'remove_member', 'change_role', 'manage_apps', 'manage_billing',
    ]
    return Object.fromEntries(all.map((p) => [p, granted.has(p)])) as Record<Permission, boolean>
}
