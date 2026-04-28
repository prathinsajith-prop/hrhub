/**
 * Unit tests for the pure permission/role helper functions.
 * No DB, no HTTP — pure logic only.
 */
import { describe, it, expect } from 'vitest'
import {
    hasRole,
    hasPermission,
    getPermissions,
    buildPermissionMap,
    ROLE_HIERARCHY,
} from '../lib/permissions.js'
import type { MemberRole, Permission } from '../lib/permissions.js'

describe('ROLE_HIERARCHY', () => {
    it('super_admin has the highest level', () => {
        const levels = Object.values(ROLE_HIERARCHY)
        expect(ROLE_HIERARCHY.super_admin).toBe(Math.max(...levels))
    })

    it('employee has the lowest level', () => {
        const levels = Object.values(ROLE_HIERARCHY)
        expect(ROLE_HIERARCHY.employee).toBe(Math.min(...levels))
    })

    it('all five roles have unique levels', () => {
        const levels = Object.values(ROLE_HIERARCHY)
        expect(new Set(levels).size).toBe(levels.length)
    })
})

describe('hasRole', () => {
    it('returns true when actor equals the required role', () => {
        expect(hasRole('hr_manager', 'hr_manager')).toBe(true)
    })

    it('returns true when actor is above the required role', () => {
        expect(hasRole('super_admin', 'hr_manager')).toBe(true)
        expect(hasRole('hr_manager', 'employee')).toBe(true)
    })

    it('returns false when actor is below the required role', () => {
        expect(hasRole('employee', 'hr_manager')).toBe(false)
        expect(hasRole('dept_head', 'super_admin')).toBe(false)
    })

    it('all roles satisfy their own level', () => {
        const roles: MemberRole[] = ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee']
        roles.forEach((r) => expect(hasRole(r, r)).toBe(true))
    })
})

describe('hasPermission', () => {
    it('super_admin has manage_billing', () => {
        expect(hasPermission('super_admin', 'manage_billing')).toBe(true)
    })

    it('employee does not have manage_billing', () => {
        expect(hasPermission('employee', 'manage_billing')).toBe(false)
    })

    it('hr_manager can invite_member but cannot manage_billing', () => {
        expect(hasPermission('hr_manager', 'invite_member')).toBe(true)
        expect(hasPermission('hr_manager', 'manage_billing')).toBe(false)
    })

    it('all roles can view_org', () => {
        const roles: MemberRole[] = ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee']
        roles.forEach((r) => expect(hasPermission(r, 'view_org')).toBe(true))
    })
})

describe('getPermissions', () => {
    it('returns an array for every role', () => {
        const roles: MemberRole[] = ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee']
        roles.forEach((r) => expect(Array.isArray(getPermissions(r))).toBe(true))
    })

    it('returns a copy — mutations do not affect subsequent calls', () => {
        const p1 = getPermissions('hr_manager')
        p1.push('manage_billing' as Permission)
        const p2 = getPermissions('hr_manager')
        expect(p2).not.toContain('manage_billing')
    })

    it('super_admin has more permissions than employee', () => {
        expect(getPermissions('super_admin').length).toBeGreaterThan(getPermissions('employee').length)
    })
})

describe('buildPermissionMap', () => {
    it('returns a boolean value for every permission key', () => {
        const map = buildPermissionMap('hr_manager')
        Object.values(map).forEach((v) => expect(typeof v).toBe('boolean'))
    })

    it('super_admin has all permissions set to true', () => {
        const map = buildPermissionMap('super_admin')
        expect(Object.values(map).every(Boolean)).toBe(true)
    })

    it('employee has only view_org set to true', () => {
        const map = buildPermissionMap('employee')
        expect(map.view_org).toBe(true)
        expect(map.manage_billing).toBe(false)
        expect(map.manage_team).toBe(false)
    })

    it('includes all eight permission keys', () => {
        const map = buildPermissionMap('super_admin')
        const expected: Permission[] = [
            'view_org', 'manage_org', 'manage_team', 'invite_member',
            'remove_member', 'change_role', 'manage_apps', 'manage_billing',
        ]
        expected.forEach((p) => expect(p in map).toBe(true))
    })
})
