import type { ReactNode } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import type { Permission } from '@/lib/permissions'
import type { UserRole } from '@/types'

interface PermissionGateProps {
    /** Render children only when the user has this permission. */
    permission?: Permission
    /** Render children only when the user's role is one of these. */
    roles?: UserRole[]
    /** Render children only when the user's role level is ≥ this role. */
    minRole?: UserRole
    /** Rendered when access is denied. Defaults to nothing. */
    fallback?: ReactNode
    children: ReactNode
}

/**
 * Conditionally renders children based on the current user's permissions.
 *
 * Examples:
 *   <PermissionGate permission="manage_employees">
 *     <Button>Create Employee</Button>
 *   </PermissionGate>
 *
 *   <PermissionGate minRole="hr_manager" fallback={<p>Restricted</p>}>
 *     <AdminPanel />
 *   </PermissionGate>
 *
 *   <PermissionGate roles={['super_admin', 'hr_manager']}>
 *     <DeleteButton />
 *   </PermissionGate>
 */
export function PermissionGate({
    permission,
    roles,
    minRole,
    fallback = null,
    children,
}: PermissionGateProps) {
    const { can, hasRole, hasMinRole } = usePermissions()

    let allowed = true

    if (permission !== undefined) {
        allowed = allowed && can(permission)
    }
    if (roles !== undefined && roles.length > 0) {
        allowed = allowed && hasRole(...roles)
    }
    if (minRole !== undefined) {
        allowed = allowed && hasMinRole(minRole)
    }

    return allowed ? <>{children}</> : <>{fallback}</>
}
