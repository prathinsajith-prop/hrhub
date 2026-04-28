import { db } from '../../db/index.js'
import { exitRequests, employees, leaveRequests } from '../../db/schema/index.js'
import { eq, and, sql } from 'drizzle-orm'

// UAE Labour Law gratuity calculation
function calculateGratuity(basicSalary: number, yearsOfService: number, exitType: string): number {
    if (yearsOfService < 1) return 0

    // Termination by employer: full gratuity
    // Resignation: partial gratuity (50% for 1-3y, 75% for 3-5y, 100% for 5y+)
    const dailyWage = basicSalary / 30
    const base = yearsOfService <= 5
        ? dailyWage * 21 * yearsOfService
        : (dailyWage * 21 * 5) + (dailyWage * 30 * (yearsOfService - 5))
    // Cap at 2 years salary
    const gratuity = Math.min(base, basicSalary * 24)

    if (exitType === 'resignation') {
        if (yearsOfService < 3) return gratuity * 0.5
        if (yearsOfService < 5) return gratuity * 0.75
    }

    return gratuity
}

export async function calculateSettlement(tenantId: string, employeeId: string, exitDate: string, exitType: string) {
    const [emp] = await db.select().from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))

    if (!emp) throw Object.assign(new Error('Employee not found'), { statusCode: 404 })

    const basicSalary = parseFloat(emp.basicSalary ?? '0')
    const joinDate = new Date(emp.joinDate)
    const exit = new Date(exitDate)
    const yearsOfService = (exit.getTime() - joinDate.getTime()) / (365.25 * 24 * 3600 * 1000)

    const gratuityAmount = calculateGratuity(basicSalary, yearsOfService, exitType)

    // Leave encashment — count approved unused annual leave (simplified: 30 days/year entitlement)
    const usedLeaveDays = await db.select({ total: sql<number>`coalesce(sum(days), 0)` })
        .from(leaveRequests)
        .where(and(
            eq(leaveRequests.tenantId, tenantId),
            eq(leaveRequests.employeeId, employeeId),
            eq(leaveRequests.leaveType, 'annual'),
            eq(leaveRequests.status, 'approved')
        ))

    const totalEntitledDays = Math.floor(yearsOfService * 30)
    const usedDays = Number(usedLeaveDays[0]?.total ?? 0)
    const unusedDays = Math.max(0, totalEntitledDays - usedDays)
    const dailyWage = basicSalary / 30
    const leaveEncashmentAmount = unusedDays * dailyWage

    // Unpaid salary for current month (days worked until exit)
    const daysInMonth = new Date(exit.getFullYear(), exit.getMonth() + 1, 0).getDate()
    const daysWorked = exit.getDate()
    const unpaidSalaryAmount = (parseFloat(emp.totalSalary ?? emp.basicSalary ?? '0') / daysInMonth) * daysWorked

    const totalSettlement = gratuityAmount + leaveEncashmentAmount + unpaidSalaryAmount

    return {
        employeeId,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        basicSalary,
        totalSalary: parseFloat(emp.totalSalary ?? emp.basicSalary ?? '0'),
        yearsOfService: Math.round(yearsOfService * 100) / 100,
        joinDate: emp.joinDate,
        exitDate,
        exitType,
        gratuityAmount: Math.round(gratuityAmount * 100) / 100,
        leaveEncashmentAmount: Math.round(leaveEncashmentAmount * 100) / 100,
        unpaidSalaryAmount: Math.round(unpaidSalaryAmount * 100) / 100,
        unusedLeaveDays: unusedDays,
        deductions: 0,
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
}) {
    const settlement = await calculateSettlement(tenantId, body.employeeId, body.exitDate, body.exitType)

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
        totalSettlement: String(settlement.totalSettlement),
        notes: body.notes,
    }).returning()

    return { request: req, settlement }
}

export async function getExitRequests(tenantId: string) {
    return db.select().from(exitRequests).where(eq(exitRequests.tenantId, tenantId))
}

export async function getExitRequest(tenantId: string, id: string) {
    const [req] = await db.select().from(exitRequests)
        .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId)))
    return req ?? null
}

export async function approveExit(tenantId: string, id: string, approverId: string) {
    const [req] = await db.update(exitRequests)
        .set({ status: 'approved', approvedBy: approverId, updatedAt: new Date() })
        .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId)))
        .returning()

    // Update employee status to terminated
    if (req) {
        await db.update(employees)
            .set({ status: 'terminated' })
            .where(and(eq(employees.id, req.employeeId), eq(employees.tenantId, tenantId)))
    }
    return req
}

export async function markSettlementPaid(tenantId: string, id: string) {
    const [req] = await db.update(exitRequests)
        .set({ settlementPaid: true, settlementPaidDate: new Date().toISOString().split('T')[0], status: 'completed', updatedAt: new Date() })
        .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId)))
        .returning()
    return req
}
