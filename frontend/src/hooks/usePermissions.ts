import { useAuthStore } from '@/store/authStore'
import {
  hasPermission,
  canAccessRoute,
  type Permission,
  type RouteKey,
} from '@/lib/permissions'
import type { UserRole } from '@/types'

/**
 * Central permission hook.
 *
 * Usage:
 *   const { can, canAccess, hasRole, role } = usePermissions()
 *
 *   can('manage_employees')           → true/false
 *   canAccess('payroll')              → true/false
 *   hasRole('hr_manager', 'super_admin') → true if user is either
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

  function hasRole(...roles: UserRole[]): boolean {
    if (!role) return false
    return roles.includes(role)
  }

  return { can, canAccess, hasRole, role }
}
