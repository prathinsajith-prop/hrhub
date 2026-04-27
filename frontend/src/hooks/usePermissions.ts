import { useAuthStore } from '@/store/authStore'
import {
  hasPermission,
  canAccessRoute,
  hasMinRole as _hasMinRole,
  getRoleLevel,
  ALL_PERMISSIONS,
  type Permission,
  type RouteKey,
} from '@/lib/permissions'
import type { UserRole } from '@/types'

/**
 * Central permission hook.
 *
 * Usage:
 *   const { can, canAccess, hasRole, hasMinRole, roleLevel, permissions, role } = usePermissions()
 *
 *   can('manage_employees')              → true/false
 *   canAccess('payroll')                 → true/false
 *   hasRole('hr_manager', 'super_admin') → true if user is either
 *   hasMinRole('hr_manager')             → true if user is hr_manager or above
 *   roleLevel                            → numeric level of current role
 *   permissions                          → Record<Permission, boolean> for all permissions
 */
export function usePermissions() {
  const role = useAuthStore((s) => s.user?.role) as UserRole | undefined

  function can(permission: Permission): boolean {
    if (!role) return false
    return hasPermission(role, permission)
  }

  function canAccess(routeKey: RouteKey): boolean {
    if (!role) return false
    return canAccessRoute(role, routeKey)
  }

  /** True if the user's role exactly matches any of the listed roles. */
  function hasRole(...roles: UserRole[]): boolean {
    if (!role) return false
    return roles.includes(role)
  }

  /** True if the user's role level is ≥ the required role level. */
  function hasMinRole(minRole: UserRole): boolean {
    if (!role) return false
    return _hasMinRole(role, minRole)
  }

  const roleLevel = role ? getRoleLevel(role) : 0

  /** All permissions as a boolean map — useful for conditional rendering. */
  const permissions = ALL_PERMISSIONS.reduce<Record<Permission, boolean>>(
    (acc, p) => {
      acc[p] = can(p)
      return acc
    },
    {} as Record<Permission, boolean>,
  )

  return { can, canAccess, hasRole, hasMinRole, roleLevel, permissions, role }
}
