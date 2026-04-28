/**
 * Unit tests for the frontend permissions helpers.
 * Pure logic — no React, no network.
 */
import { describe, it, expect } from 'vitest'
import {
    hasMinRole,
    getRoleLevel,
    hasPermission,
    canAccessRoute,
    ALL_ROLES,
} from '@/lib/permissions'

describe('ROLE_HIERARCHY / getRoleLevel', () => {
    it('super_admin is the highest level', () => {
        const levels = ALL_ROLES.map(getRoleLevel)
        expect(getRoleLevel('super_admin')).toBe(Math.max(...levels))
    })

    it('employee is the lowest level', () => {
        const levels = ALL_ROLES.map(getRoleLevel)
        expect(getRoleLevel('employee')).toBe(Math.min(...levels))
    })

    it('all five roles have distinct levels', () => {
        const levels = ALL_ROLES.map(getRoleLevel)
        expect(new Set(levels).size).toBe(ALL_ROLES.length)
    })
})

describe('hasMinRole', () => {
    it('returns true when role equals the minimum', () => {
        ALL_ROLES.forEach((r) => expect(hasMinRole(r, r)).toBe(true))
    })

    it('super_admin satisfies every role minimum', () => {
        ALL_ROLES.forEach((r) => expect(hasMinRole('super_admin', r)).toBe(true))
    })

    it('employee does not satisfy hr_manager minimum', () => {
        expect(hasMinRole('employee', 'hr_manager')).toBe(false)
    })

    it('hr_manager does not satisfy super_admin minimum', () => {
        expect(hasMinRole('hr_manager', 'super_admin')).toBe(false)
    })

    it('dept_head satisfies employee and dept_head but not hr_manager', () => {
        expect(hasMinRole('dept_head', 'employee')).toBe(true)
        expect(hasMinRole('dept_head', 'dept_head')).toBe(true)
        expect(hasMinRole('dept_head', 'hr_manager')).toBe(false)
    })
})

describe('hasPermission', () => {
    it('super_admin has manage_employees', () => {
        expect(hasPermission('super_admin', 'manage_employees')).toBe(true)
    })

    it('employee does not have manage_employees', () => {
        expect(hasPermission('employee', 'manage_employees')).toBe(false)
    })

    it('all roles have view_own_leave', () => {
        ALL_ROLES.forEach((r) => expect(hasPermission(r, 'view_own_leave')).toBe(true))
    })

    it('only super_admin and hr_manager can manage_payroll', () => {
        expect(hasPermission('super_admin', 'manage_payroll')).toBe(true)
        expect(hasPermission('hr_manager', 'manage_payroll')).toBe(true)
        expect(hasPermission('pro_officer', 'manage_payroll')).toBe(false)
        expect(hasPermission('dept_head', 'manage_payroll')).toBe(false)
        expect(hasPermission('employee', 'manage_payroll')).toBe(false)
    })

    it('dept_head can approve_leave but not manage_leave', () => {
        expect(hasPermission('dept_head', 'approve_leave')).toBe(true)
        expect(hasPermission('dept_head', 'manage_leave')).toBe(false)
    })
})

describe('canAccessRoute', () => {
    it('all roles can access dashboard', () => {
        ALL_ROLES.forEach((r) => expect(canAccessRoute(r, 'dashboard')).toBe(true))
    })

    it('only super_admin and hr_manager can access payroll', () => {
        expect(canAccessRoute('super_admin', 'payroll')).toBe(true)
        expect(canAccessRoute('hr_manager', 'payroll')).toBe(true)
        expect(canAccessRoute('pro_officer', 'payroll')).toBe(false)
        expect(canAccessRoute('dept_head', 'payroll')).toBe(false)
        expect(canAccessRoute('employee', 'payroll')).toBe(false)
    })

    it('employee cannot access audit log', () => {
        expect(canAccessRoute('employee', 'audit')).toBe(false)
    })

    it('all roles can access my/leave (self-service)', () => {
        ALL_ROLES.forEach((r) => expect(canAccessRoute(r, 'my/leave')).toBe(true))
    })

    it('pro_officer can access visa but not payroll', () => {
        expect(canAccessRoute('pro_officer', 'visa')).toBe(true)
        expect(canAccessRoute('pro_officer', 'payroll')).toBe(false)
    })
})
