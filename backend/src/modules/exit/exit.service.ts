import { db } from '../../db/index.js'
import { exitRequests, employees, leaveRequests, leaveBalances } from '../../db/schema/index.js'
import { eq, and, sql, desc } from 'drizzle-orm'

/**
 * UAE Gratuity — Federal Decree-Law No. 33 of 2021 (in force Feb 2, 2022).
 * Full entitlement regardless of exit reason:
 *   - 21 working days basic salary per year (first 5 years)
 *   - 30 working days basic salary per year (beyond 5 years)
 *   - Capped at 2 years (24 months) basic salary
 *   - Zero if service < 1 year
 */
export function calculateGratuity(basicSalary: number, yearsOfService: number): number {
    if (yearsOfService < 1) return 0
    const dailyWage = basicSalary / 30
    const base = yearsOfService <= 5
        ? dailyWage * 21 * yearsOfService
        : (dailyWage * 21 * 5) + (dailyWage * 30 * (yearsOfService - 5))
    return Math.min(base, basicSalary * 24)
}

export async function calculateSettlement(
    tenantId: string,
    employeeId: string,
    exitDate: string,
    exitType: string,
    deductions = 0,
) {
    const [emp] = await db.select().from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))

    if (!emp) throw Object.assign(new Error('Employee not found'), { statusCode: 404 })

    const basicSalary = parseFloat(emp.basicSalary ?? '0')
    const totalSalaryVal = parseFloat(emp.totalSalary ?? emp.basicSalary ?? '0')
    const joinDate = new Date(emp.joinDate)
    const exit = new Date(exitDate)
    const yearsOfService = (exit.getTime() - joinDate.getTime()) / (365.25 * 24 * 3600 * 1000)

    const gratuityAmount = calculateGratuity(basicSalary, yearsOfService)

    // Leave encashment — prefer leave_balances (has accruals + carry-forward + adjustments).
    // Fall back to raw request count if no balance row exists.
    const year = exit.getFullYear()
    const [balanceRow] = await db.select().from(leaveBalances).where(and(
        eq(leaveBalances.tenantId, tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.leaveType, 'annual'),
        eq(leaveBalances.year, year),
    ))

    let unusedDays: number
    if (balanceRow) {
        const accrued = parseFloat(String(balanceRow.accrued ?? 0))
        const carried = parseFloat(String(balanceRow.carriedForward ?? 0))
        const adj = parseFloat(String(balanceRow.adjustment ?? 0))
        const taken = parseFloat(String(balanceRow.taken ?? 0))
        unusedDays = Math.max(0, accrued + carried + adj - taken)
    } else {
        // Fallback: all-time entitlement vs approved requests
        const [{ total: usedTotal }] = await db.select({ total: sql<number>`coalesce(sum(days), 0)` })
            .from(leaveRequests)
            .where(and(
                eq(leaveRequests.tenantId, tenantId),
                eq(leaveRequests.employeeId, employeeId),
                eq(leaveRequests.leaveType, 'annual'),
                eq(leaveRequests.status, 'approved'),
            ))
        const totalEntitled = Math.floor(yearsOfService * 30)
        unusedDays = Math.max(0, totalEntitled - Number(usedTotal))
    }

    const dailyWage = basicSalary / 30
    const leaveEncashmentAmount = unusedDays * dailyWage

    // Unpaid salary — prorate total salary for days worked in the exit month
    const daysInMonth = new Date(exit.getFullYear(), exit.getMonth() + 1, 0).getDate()
    const daysWorked = exit.getDate()
    const unpaidSalaryAmount = (totalSalaryVal / daysInMonth) * daysWorked

    const totalSettlement = Math.max(0, gratuityAmount + leaveEncashmentAmount + unpaidSalaryAmount - deductions)

    return {
        employeeId,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        basicSalary,
        totalSalary: totalSalaryVal,
        yearsOfService: Math.round(yearsOfService * 100) / 100,
        joinDate: emp.joinDate,
        exitDate,
        exitType,
        gratuityAmount: Math.round(gratuityAmount * 100) / 100,
        leaveEncashmentAmount: Math.round(leaveEncashmentAmount * 100) / 100,
        unpaidSalaryAmount: Math.round(unpaidSalaryAmount * 100) / 100,
        unusedLeaveDays: Math.round(unusedDays * 10) / 10,
        deductions: Math.round(deductions * 100) / 100,
        totalSettlement: Math.round(totalSettlement * 100) / 100,
    }
}

export async function initiateExit(tenantId: string, body: {
    employeeId: string
    exitType: 'resignation' | 'termination' | 'contract_end' | 'retirement'
    exitDate: string
    lastWorkingDay: string
    noticePeriodDays?: number
    reason?: string
    notes?: string
    deductions?: number
}) {
    const deductions = Number(body.deductions ?? 0)
    const settlement = await calculateSettlement(tenantId, body.employeeId, body.exitDate, body.exitType, deductions)

    const [req] = await db.insert(exitRequests).values({
        tenantId,
        employeeId: body.employeeId,
        exitType: body.exitType,
        exitDate: body.exitDate,
        lastWorkingDay: body.lastWorkingDay,
        reason: body.reason,
        noticePeriodDays: String(body.noticePeriodDays ?? 30),
        gratuityAmount: String(settlement.gratuityAmount),
        leaveEncashmentAmount: String(settlement.leaveEncashmentAmount),
        unpaidSalaryAmount: String(settlement.unpaidSalaryAmount),
        deductions: String(settlement.deductions),
        totalSettlement: String(settlement.totalSettlement),
        notes: body.notes,
    }).returning()

    return { request: req, settlement }
}

export async function getExitRequests(tenantId: string) {
    const rows = await db
        .select({
            id: exitRequests.id,
            tenantId: exitRequests.tenantId,
            employeeId: exitRequests.employeeId,
            exitType: exitRequests.exitType,
            exitDate: exitRequests.exitDate,
            lastWorkingDay: exitRequests.lastWorkingDay,
            reason: exitRequests.reason,
            noticePeriodDays: exitRequests.noticePeriodDays,
            status: exitRequests.status,
            gratuityAmount: exitRequests.gratuityAmount,
            leaveEncashmentAmount: exitRequests.leaveEncashmentAmount,
            unpaidSalaryAmount: exitRequests.unpaidSalaryAmount,
            deductions: exitRequests.deductions,
            totalSettlement: exitRequests.totalSettlement,
            settlementPaid: exitRequests.settlementPaid,
            settlementPaidDate: exitRequests.settlementPaidDate,
            approvedBy: exitRequests.approvedBy,
            notes: exitRequests.notes,
            createdAt: exitRequests.createdAt,
            updatedAt: exitRequests.updatedAt,
            employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '')`,
            employeeNo: employees.employeeNo,
            employeeDesignation: employees.designation,
            employeeDepartment: employees.department,
            employeeAvatarUrl: employees.avatarUrl,
        })
        .from(exitRequests)
        .leftJoin(employees, eq(employees.id, exitRequests.employeeId))
        .where(eq(exitRequests.tenantId, tenantId))
        .orderBy(desc(exitRequests.createdAt))
    return rows
}

export async function getExitRequest(tenantId: string, id: string) {
    const [row] = await db
        .select({
            id: exitRequests.id,
            tenantId: exitRequests.tenantId,
            employeeId: exitRequests.employeeId,
            exitType: exitRequests.exitType,
            exitDate: exitRequests.exitDate,
            lastWorkingDay: exitRequests.lastWorkingDay,
            reason: exitRequests.reason,
            noticePeriodDays: exitRequests.noticePeriodDays,
            status: exitRequests.status,
            gratuityAmount: exitRequests.gratuityAmount,
            leaveEncashmentAmount: exitRequests.leaveEncashmentAmount,
            unpaidSalaryAmount: exitRequests.unpaidSalaryAmount,
            deductions: exitRequests.deductions,
            totalSettlement: exitRequests.totalSettlement,
            settlementPaid: exitRequests.settlementPaid,
            settlementPaidDate: exitRequests.settlementPaidDate,
            approvedBy: exitRequests.approvedBy,
            notes: exitRequests.notes,
            createdAt: exitRequests.createdAt,
            updatedAt: exitRequests.updatedAt,
            employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '')`,
            employeeNo: employees.employeeNo,
            employeeDesignation: employees.designation,
            employeeDepartment: employees.department,
            employeeAvatarUrl: employees.avatarUrl,
        })
        .from(exitRequests)
        .leftJoin(employees, eq(employees.id, exitRequests.employeeId))
        .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId)))
    return row ?? null
}

export async function approveExit(tenantId: string, id: string, approverId: string) {
    const [req] = await db.update(exitRequests)
        .set({ status: 'approved', approvedBy: approverId, updatedAt: new Date() })
        .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId), eq(exitRequests.status, 'pending')))
        .returning()

    if (req) {
        await db.update(employees)
            .set({ status: 'terminated' })
            .where(and(eq(employees.id, req.employeeId), eq(employees.tenantId, tenantId)))
    }
    return req ?? null
}

export async function rejectExit(tenantId: string, id: string, approverId: string, reason?: string) {
    const [req] = await db.update(exitRequests)
        .set({ status: 'rejected', approvedBy: approverId, notes: reason, updatedAt: new Date() })
        .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId), eq(exitRequests.status, 'pending')))
        .returning()
    return req ?? null
}

export async function markSettlementPaid(tenantId: string, id: string) {
    const [req] = await db.update(exitRequests)
        .set({
            settlementPaid: true,
            settlementPaidDate: new Date().toISOString().split('T')[0],
            status: 'completed',
            updatedAt: new Date(),
        })
        .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId), eq(exitRequests.status, 'approved')))
        .returning()
    return req ?? null
}
