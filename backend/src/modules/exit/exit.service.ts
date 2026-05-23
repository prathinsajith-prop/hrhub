import { db } from '../../db/index.js'
import { exitRequests, employees, leaveRequests, leaveBalances, exitClearanceItems, exitInterviewResponses } from '../../db/schema/index.js'
import { eq, and, sql, desc } from 'drizzle-orm'
import { resolveAvatarUrl, resolveAvatarUrls } from '../../plugins/s3.js'
import { Conditions } from '../../lib/filters.js'
import { resolveEmployeeEarnings } from '../payroll/payroll.service.js'
import {
    getSettings as getOffboardingSettings,
    instantiateClearancesForExit,
    fireWorkflows,
    getExitApprovalReadiness,
} from '../offboardingFlow/offboarding.service.js'
import { log } from '../../lib/logger.js'
import { ServiceError } from '../../lib/errors.js'

const EXIT_FIELD_MAP = {
    exitType: exitRequests.exitType,
    exitDate: exitRequests.exitDate,
    status: exitRequests.status,
}
const EXIT_ALLOWED = new Set(Object.keys(EXIT_FIELD_MAP))

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

    // Resolve compensation from the salary-components catalog first — that's
    // the source of truth payroll already uses. Fall back to the legacy
    // columns only when the employee has no assignments yet (pre-catalog
    // data), keeping the EOSB calculation parity with payslip math.
    const resolved = (await resolveEmployeeEarnings(tenantId, [employeeId])).get(employeeId)
    const legacyBasic = parseFloat(emp.basicSalary ?? '0')
    const legacyTotal = parseFloat(emp.totalSalary ?? emp.basicSalary ?? '0')
    const basicSalary = resolved?.hasBasic ? resolved.basic : legacyBasic
    const resolvedTotal = resolved?.earnings.reduce((s, e) => s + e.amount, 0) ?? 0
    const totalSalaryVal = resolved?.hasBasic && resolvedTotal > 0 ? resolvedTotal : legacyTotal
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
    // Settlement + offboarding-settings + employee.reportingTo are all
    // independent reads — run them concurrently so the create path waits
    // for the slowest one rather than serializing.
    const [settlement, offboardingSettings, empRow] = await Promise.all([
        calculateSettlement(tenantId, body.employeeId, body.exitDate, body.exitType, deductions),
        getOffboardingSettings(tenantId).catch(() => null),
        db.select({ reportingTo: employees.reportingTo }).from(employees)
            .where(and(eq(employees.id, body.employeeId), eq(employees.tenantId, tenantId)))
            .then(rows => rows[0] ?? null),
    ])

    // Resolve default notice period from org Offboarding Flow settings when
    // the caller didn't supply one. The flow can disable notice period
    // entirely; in that case we still record 0 to satisfy NOT NULL.
    let resolvedNotice = body.noticePeriodDays
    if (resolvedNotice == null) {
        if (offboardingSettings?.noticePeriodEnabled) {
            const v = offboardingSettings.noticePeriodValue ?? 30
            resolvedNotice = offboardingSettings.noticePeriodUnit === 'months' ? v * 30 : v
        } else if (offboardingSettings) {
            resolvedNotice = 0
        } else {
            resolvedNotice = 30
        }
    }

    const [req] = await db.insert(exitRequests).values({
        tenantId,
        employeeId: body.employeeId,
        exitType: body.exitType,
        exitDate: body.exitDate,
        lastWorkingDay: body.lastWorkingDay,
        reason: body.reason,
        noticePeriodDays: String(resolvedNotice ?? 30),
        gratuityAmount: String(settlement.gratuityAmount),
        leaveEncashmentAmount: String(settlement.leaveEncashmentAmount),
        unpaidSalaryAmount: String(settlement.unpaidSalaryAmount),
        deductions: String(settlement.deductions),
        totalSettlement: String(settlement.totalSettlement),
        notes: body.notes,
    }).returning()

    // Auto-instantiate clearance items + fire on_request_added workflows. Both
    // are best-effort: any failure here must not block exit creation, so we
    // swallow errors with a warn-level log. The pre-fetched settings is
    // passed through so neither call re-queries the row.
    try {
        await instantiateClearancesForExit(
            tenantId,
            req.id,
            body.lastWorkingDay,
            empRow?.reportingTo ?? null,
            offboardingSettings ?? undefined,
        )
    } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err), exitId: req.id }, 'failed to instantiate clearance items')
    }
    fireWorkflows(tenantId, 'on_request_added', {
        exitRequestId: req.id,
        prefetchedSettings: offboardingSettings ?? undefined,
    }).catch((err) => {
        log.warn({ err: err instanceof Error ? err.message : String(err), exitId: req.id }, 'on_request_added workflow firing failed')
    })

    return { request: req, settlement }
}

export async function getExitRequests(tenantId: string, opts: { limit?: number; offset?: number; status?: string; q?: string; filter?: string } = {}) {
    const { limit = 50, offset = 0, status, q, filter } = opts

    const conds = Conditions.create()
        .tenant(exitRequests.tenantId, tenantId)
        .match(exitRequests.status, status)
        .nameSearch(q, employees.firstName, employees.lastName, employees.employeeNo)
        .filter(filter, EXIT_FIELD_MAP, EXIT_ALLOWED)

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
            // Per-row offboarding-flow progress summary — drives the
            // "Progress" column on the list page and the badge in the
            // detail header.
            clearanceTotal: sql<number>`(SELECT COUNT(*)::int FROM ${exitClearanceItems} WHERE ${exitClearanceItems.exitRequestId} = ${exitRequests.id})`,
            clearanceCompleted: sql<number>`(SELECT COUNT(*)::int FROM ${exitClearanceItems} WHERE ${exitClearanceItems.exitRequestId} = ${exitRequests.id} AND ${exitClearanceItems.status} IN ('completed', 'waived'))`,
            interviewSubmitted: sql<boolean>`EXISTS (SELECT 1 FROM ${exitInterviewResponses} WHERE ${exitInterviewResponses.exitRequestId} = ${exitRequests.id})`,
            total: sql<number>`COUNT(*) OVER()`,
        })
        .from(exitRequests)
        .leftJoin(employees, eq(employees.id, exitRequests.employeeId))
        .where(conds.where())
        .orderBy(desc(exitRequests.createdAt))
        .limit(limit)
        .offset(offset)

    const total = rows[0]?.total ?? 0
    const stripped = rows.map(({ total: _, ...r }) => r)
    const avatarUrls = await resolveAvatarUrls(stripped.map(r => r.employeeAvatarUrl))
    const data = stripped.map((r, i) => ({ ...r, employeeAvatarUrl: avatarUrls[i] }))
    return { data, total, limit, offset, hasMore: offset + limit < total }
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
            clearanceTotal: sql<number>`(SELECT COUNT(*)::int FROM ${exitClearanceItems} WHERE ${exitClearanceItems.exitRequestId} = ${exitRequests.id})`,
            clearanceCompleted: sql<number>`(SELECT COUNT(*)::int FROM ${exitClearanceItems} WHERE ${exitClearanceItems.exitRequestId} = ${exitRequests.id} AND ${exitClearanceItems.status} IN ('completed', 'waived'))`,
            interviewSubmitted: sql<boolean>`EXISTS (SELECT 1 FROM ${exitInterviewResponses} WHERE ${exitInterviewResponses.exitRequestId} = ${exitRequests.id})`,
        })
        .from(exitRequests)
        .leftJoin(employees, eq(employees.id, exitRequests.employeeId))
        .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId)))
    if (!row) return null
    return { ...row, employeeAvatarUrl: await resolveAvatarUrl(row.employeeAvatarUrl) }
}

/**
 * Approve an exit request. Refuses the move when offboarding clearance items
 * are still open, unless the caller passes `override: true` — an HR-only
 * escape hatch logged separately in the audit trail.
 */
export async function approveExit(
    tenantId: string,
    id: string,
    approverId: string,
    opts: { override?: boolean } = {},
) {
    if (!opts.override) {
        const readiness = await getExitApprovalReadiness(tenantId, id)
        if (!readiness.canApprove) {
            const pending = readiness.pendingClearances.map(p => p.name).join(', ')
            throw new ServiceError(
                409,
                'CLEARANCE_PENDING',
                `Cannot approve: ${readiness.pendingClearances.length} clearance item${readiness.pendingClearances.length === 1 ? '' : 's'} still pending (${pending}). Mark them completed first, or use override.`,
            )
        }
    }
    const result = await db.transaction(async (tx) => {
        const [req] = await tx.update(exitRequests)
            .set({ status: 'approved', approvedBy: approverId, updatedAt: new Date() })
            .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId), eq(exitRequests.status, 'pending')))
            .returning()

        if (req) {
            await tx.update(employees)
                .set({ status: 'terminated' })
                .where(and(eq(employees.id, req.employeeId), eq(employees.tenantId, tenantId)))
        }
        return req ?? null
    })
    if (result) {
        fireWorkflows(tenantId, 'on_approved', { exitRequestId: id }).catch((err) => {
            log.warn({ err: err instanceof Error ? err.message : String(err), exitId: id }, 'on_approved workflow firing failed')
        })
    }
    return result
}

export async function rejectExit(tenantId: string, id: string, approverId: string, reason?: string) {
    const [req] = await db.update(exitRequests)
        .set({ status: 'rejected', approvedBy: approverId, notes: reason, updatedAt: new Date() })
        .where(and(eq(exitRequests.id, id), eq(exitRequests.tenantId, tenantId), eq(exitRequests.status, 'pending')))
        .returning()
    if (req) {
        fireWorkflows(tenantId, 'on_rejected', { exitRequestId: id }).catch((err) => {
            log.warn({ err: err instanceof Error ? err.message : String(err), exitId: id }, 'on_rejected workflow firing failed')
        })
    }
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
    if (req) {
        fireWorkflows(tenantId, 'on_settlement_paid', { exitRequestId: id }).catch((err) => {
            log.warn({ err: err instanceof Error ? err.message : String(err), exitId: id }, 'on_settlement_paid workflow firing failed')
        })
    }
    return req ?? null
}
