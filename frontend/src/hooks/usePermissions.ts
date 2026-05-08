import { useAuthStore } from '@/store/authStore'
import {
  hasPermissionForRoles,
  canAccessRouteForRoles,
  hasMinRole as _hasMinRole,
  getRoleLevel,
  ALL_PERMISSIONS,
  type Permission,
  type RouteKey,
} from '@/lib/permissions'
import type { UserRole } from '@/types'

export function usePermissions() {
  const role = useAuthStore((s) => s.user?.role) as UserRole | undefined
  const rawRoles = useAuthStore((s) => s.user?.roles)

  const roles: UserRole[] = (rawRoles && rawRoles.length > 0 ? rawRoles : role ? [role] : []) as UserRole[]

  function can(permission: Permission): boolean {
    if (roles.length === 0) return false
    return hasPermissionForRoles(roles, permission)
  }

  function canAccess(routeKey: RouteKey): boolean {
    if (roles.length === 0) return false
    return canAccessRouteForRoles(roles, routeKey)
  }

  function hasRole(...checkRoles: UserRole[]): boolean {
    if (roles.length === 0) return false
    return checkRoles.some(r => roles.includes(r))
  }

  function hasMinRole(minRole: UserRole): boolean {
    if (!role) return false
    return _hasMinRole(role, minRole)
  }

  const roleLevel = role ? getRoleLevel(role) : 0

  const permissions = ALL_PERMISSIONS.reduce<Record<Permission, boolean>>(
    (acc, p) => {
      acc[p] = can(p)
      return acc
    },
    {} as Record<Permission, boolean>,
  )

  return { can, canAccess, hasRole, hasMinRole, roleLevel, permissions, role }
}
