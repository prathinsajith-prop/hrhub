import { eq, and, count, desc, gte, lte, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { payrollRuns, payslips, employees } from '../../db/schema/index.js'
import { leaveRequests } from '../../db/schema/leave.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewPayrollRun = InferInsertModel<typeof payrollRuns>

export async function listPayrollRuns(tenantId: string, params: { year?: number; limit: number; offset: number }) {
    const { year, limit, offset } = params
    const conditions = [eq(payrollRuns.tenantId, tenantId)]
    if (year) conditions.push(eq(payrollRuns.year, year))

    const [{ total }] = await db.select({ total: count() }).from(payrollRuns).where(and(...conditions))

    const data = await db.select().from(payrollRuns)
        .where(and(...conditions))
        .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
        .limit(limit).offset(offset)

    return { data, total: Number(total), limit, offset, hasMore: offset + limit < Number(total) }
}

export async function getPayrollRun(tenantId: string, id: string) {
    const [row] = await db.select().from(payrollRuns)
        .where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, tenantId)))
        .limit(1)
    return row ?? null
}

export async function createPayrollRun(tenantId: string, data: Omit<NewPayrollRun, 'tenantId' | 'id'>) {
    const [row] = await db.insert(payrollRuns).values({ ...data, tenantId }).returning()
    return row
}

export async function updatePayrollRun(tenantId: string, id: string, data: Partial<NewPayrollRun>) {
    const [row] = await db.update(payrollRuns)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function getPayslips(tenantId: string, payrollRunId: string) {
    return db.select().from(payslips)
        .where(and(eq(payslips.payrollRunId, payrollRunId), eq(payslips.tenantId, tenantId)))
}

// ─── Payroll Calculation Engine (Tasks 7.1–7.4) ────────────────────────────
// UAE Labour Law rules applied:
//   Gross = basic + housing + transport + other allowances
//   Unpaid leave deduction = (daily rate) × days taken
//   Sick half-pay deduction = (daily rate × 0.5) × sick days over 15
//   Net = Gross − deductions

export async function runPayroll(tenantId: string, payrollRunId: string): Promise<boolean> {
    const run = await getPayrollRun(tenantId, payrollRunId)
    if (!run || run.status !== 'draft') return false

    // Mark as processing immediately
    await db.update(payrollRuns)
        .set({ status: 'processing', updatedAt: new Date() } as any)
        .where(eq(payrollRuns.id, payrollRunId))

    // Fetch all active + probation employees for tenant
    const activeEmps = await db.select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        basicSalary: employees.basicSalary,
        housingAllowance: employees.housingAllowance,
        transportAllowance: employees.transportAllowance,
        otherAllowances: employees.otherAllowances,
    }).from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            inArray(employees.status, ['active', 'probation']),
        ))

    if (activeEmps.length === 0) {
        // Revert to draft if no employees
        await db.update(payrollRuns)
            .set({ status: 'draft', updatedAt: new Date() } as any)
            .where(eq(payrollRuns.id, payrollRunId))
        return false
    }

    // Date range for the payroll month
    const daysInMonth = new Date(run.year, run.month, 0).getDate()
    const monthStart = `${run.year}-${String(run.month).padStart(2, '0')}-01`
    const monthEnd = `${run.year}-${String(run.month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // Fetch approved leave for all these employees in this month
    const empIds = activeEmps.map(e => e.id)
    const leaveRows = await db.select({
        employeeId: leaveRequests.employeeId,
        leaveType: leaveRequests.leaveType,
        days: leaveRequests.days,
    }).from(leaveRequests)
        .where(and(
            eq(leaveRequests.tenantId, tenantId),
            eq(leaveRequests.status, 'approved'),
            gte(leaveRequests.startDate, monthStart),
            lte(leaveRequests.startDate, monthEnd),
            inArray(leaveRequests.employeeId, empIds),
        ))

    // Group leave by employeeId
    const leaveByEmp = new Map<string, { unpaid: number; sickOver15: number }>()
    for (const l of leaveRows) {
        const existing = leaveByEmp.get(l.employeeId) ?? { unpaid: 0, sickOver15: 0 }
        if (l.leaveType === 'unpaid') {
            existing.unpaid += l.days ?? 0
        } else if (l.leaveType === 'sick') {
            // First 15 days full pay (no deduction), days 16–45 half-pay
            const sickDays = l.days ?? 0
            existing.sickOver15 += Math.max(0, sickDays - 15)
        }
        leaveByEmp.set(l.employeeId, existing)
    }

    // Calculate payslips
    let totalGross = 0
    let totalDeductions = 0
    let totalNet = 0

    const payslipValues: InferInsertModel<typeof payslips>[] = activeEmps.map(emp => {
        const basic = Number(emp.basicSalary ?? 0)
        const housing = Number(emp.housingAllowance ?? 0)
        const transport = Number(emp.transportAllowance ?? 0)
        const other = Number(emp.otherAllowances ?? 0)
        const gross = basic + housing + transport + other

        const dailyRate = basic / 30
        const leave = leaveByEmp.get(emp.id)
        const unpaidDeduction = (leave?.unpaid ?? 0) * dailyRate
        const sickHalfPayDeduction = (leave?.sickOver15 ?? 0) * dailyRate * 0.5
        const deductions = unpaidDeduction + sickHalfPayDeduction
        const net = Math.max(0, gross - deductions)

        totalGross += gross
        totalDeductions += deductions
        totalNet += net

        return {
            payrollRunId,
            employeeId: emp.id,
            tenantId,
            basicSalary: String(basic.toFixed(2)),
            housingAllowance: String(housing.toFixed(2)),
            transportAllowance: String(transport.toFixed(2)),
            otherAllowances: String(other.toFixed(2)),
            grossSalary: String(gross.toFixed(2)),
            deductions: String(deductions.toFixed(2)),
            netSalary: String(net.toFixed(2)),
            daysWorked: daysInMonth - (leave?.unpaid ?? 0),
            overtime: '0',
            commission: '0',
        }
    })

    // Delete any existing payslips for this run (idempotent)
    await db.delete(payslips).where(eq(payslips.payrollRunId, payrollRunId))

    // Insert all payslips in one batch
    await db.insert(payslips).values(payslipValues)

    // Update payroll run totals + status
    await db.update(payrollRuns)
        .set({
            status: 'approved',
            totalEmployees: activeEmps.length,
            totalGross: String(totalGross.toFixed(2)),
            totalDeductions: String(totalDeductions.toFixed(2)),
            totalNet: String(totalNet.toFixed(2)),
            processedDate: new Date().toISOString().split('T')[0],
            updatedAt: new Date(),
        } as any)
        .where(eq(payrollRuns.id, payrollRunId))

    return true
}

export async function getPayslipsWithEmployees(tenantId: string, payrollRunId: string) {
    const slips = await db.select({
        id: payslips.id,
        employeeId: payslips.employeeId,
        basicSalary: payslips.basicSalary,
        housingAllowance: payslips.housingAllowance,
        transportAllowance: payslips.transportAllowance,
        otherAllowances: payslips.otherAllowances,
        grossSalary: payslips.grossSalary,
        deductions: payslips.deductions,
        netSalary: payslips.netSalary,
        daysWorked: payslips.daysWorked,
        overtime: payslips.overtime,
        commission: payslips.commission,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeNo: employees.employeeNo,
        department: employees.department,
        designation: employees.designation,
        iban: employees.iban,
        bankName: employees.bankName,
    }).from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .where(and(eq(payslips.payrollRunId, payrollRunId), eq(payslips.tenantId, tenantId)))

    return slips.map(s => ({
        ...s,
        fullName: `${s.firstName} ${s.lastName}`,
    }))
}

/**
 * UAE Labour Law gratuity calculation.
 * - 21 days basic salary per year (first 5 years)
 * - 30 days basic salary per year (after 5 years)
 * - Capped at 2 years total salary
 */
export function calculateGratuity(basicSalary: number, yearsOfService: number): number {
    const dailyRate = basicSalary / 30
    let gratuity = 0

    if (yearsOfService <= 5) {
        gratuity = dailyRate * 21 * yearsOfService
    } else {
        gratuity = dailyRate * 21 * 5 + dailyRate * 30 * (yearsOfService - 5)
    }

    // Cap at 2 years total salary
    const cap = basicSalary * 24
    return Math.min(gratuity, cap)
}

/**
 * Generate UAE WPS (Wage Protection System) SIF (Salary Information File).
 * Format: pipe-delimited with EDR, EMP, TRL record types per MOHRE specification.
 * Returns the SIF file content as a string.
 */
export async function generateWpsSif(tenantId: string, payrollRunId: string): Promise<{ content: string; filename: string } | null> {
    const run = await getPayrollRun(tenantId, payrollRunId)
    if (!run) return null

    const slips = await getPayslips(tenantId, payrollRunId)
    if (slips.length === 0) return null

    // Fetch employee details for each payslip
    const empIds = slips.map(s => s.employeeId)
    const empRows = await db
        .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            employeeNo: employees.employeeNo,
            iban: employees.iban,
            bankName: employees.bankName,
            labourCardNumber: employees.labourCardNumber,
        })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false)))

    const empMap = new Map(empRows.map(e => [e.id, e]))

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']

    // Payment date: last day of payroll month
    const lastDay = new Date(run.year, run.month, 0)
    const payDateStr = `${String(lastDay.getDate()).padStart(2, '0')}/${String(run.month).padStart(2, '0')}/${run.year}`

    const totalSalary = Number(run.totalNet).toFixed(2)
    const lines: string[] = []

    // EDR — Employer Detail Record
    lines.push([
        'EDR',
        tenantId.slice(0, 8).toUpperCase(),   // Employer routing code (placeholder)
        '0000000000',                          // Employer bank account (placeholder — set in real deployment)
        String(run.year),
        String(run.month).padStart(2, '0'),
        String(slips.length),
        totalSalary,
        'AED',
        tenantId.slice(0, 8).toUpperCase(),   // MOL establishment ID
        payDateStr,
        'TRF',                                 // Payment type: Transfer
    ].join('|'))

    // EMP records — one per payslip
    for (const slip of slips) {
        const emp = empMap.get(slip.employeeId)
        const name = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'
        const iban = emp?.iban ?? '0000000000000000000000000000'   // placeholder if no IBAN
        const labourId = emp?.labourCardNumber ?? slip.employeeId.slice(0, 12)
        const netSalary = Number(slip.netSalary).toFixed(2)
        const basicSalary = Number(slip.basicSalary).toFixed(2)
        const allowances = (Number(slip.grossSalary) - Number(slip.basicSalary)).toFixed(2)

        lines.push([
            'EMP',
            '000000',                          // Routing code (agent bank)
            iban,                              // Account number / IBAN
            '0000',                            // Agent bank code (placeholder)
            name.toUpperCase().slice(0, 50),   // Employee name (max 50 chars)
            labourId,                          // MOL Labour Card / Employee ID
            '',                                // Mobile (optional)
            `01/${String(run.month).padStart(2, '0')}/${run.year}`,   // Start date
            payDateStr,                        // End date
            String(slip.daysWorked ?? 30),     // Days worked
            allowances,                        // Variable salary (allowances)
            basicSalary,                       // Fixed salary (basic)
            netSalary,                         // Total salary net
            'AED',
        ].join('|'))
    }

    // TRL — Trailer Record
    lines.push([
        'TRL',
        String(slips.length),
        totalSalary,
    ].join('|'))

    const content = lines.join('\n')
    const filename = `WPS_SIF_${run.year}_${String(run.month).padStart(2, '0')}_${tenantId.slice(0, 6)}.sif`

    return { content, filename }
}

export async function getPayslipById(tenantId: string, payslipId: string) {
    const [slip] = await db.select({
        id: payslips.id,
        payrollRunId: payslips.payrollRunId,
        employeeId: payslips.employeeId,
        month: payrollRuns.month,
        year: payrollRuns.year,
        basicSalary: payslips.basicSalary,
        housingAllowance: payslips.housingAllowance,
        transportAllowance: payslips.transportAllowance,
        otherAllowances: payslips.otherAllowances,
        grossSalary: payslips.grossSalary,
        deductions: payslips.deductions,
        netSalary: payslips.netSalary,
        daysWorked: payslips.daysWorked,
        totalDeductions: payslips.deductions,
        // Employee fields
        employeeName: employees.firstName,
        employeeNo: employees.employeeNo,
        designation: employees.designation,
        department: employees.department,
        bankName: employees.bankName,
        iban: employees.iban,
    }).from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
        .where(and(eq(payslips.id, payslipId), eq(payslips.tenantId, tenantId)))
        .limit(1)

    if (!slip) return null

    // Get tenant name
    const { tenants } = await import('../../db/schema/index.js')
    const empRow = await db.select({ tenantId: employees.tenantId })
        .from(employees).where(eq(employees.id, slip.employeeId)).limit(1)
    let tenantName = 'Company'
    let tradeLicenseNo: string | undefined
    if (empRow[0]) {
        const [tenant] = await db.select({ name: tenants.name, tradeLicenseNo: tenants.tradeLicenseNo })
            .from(tenants).where(eq(tenants.id, empRow[0].tenantId)).limit(1)
        if (tenant) { tenantName = tenant.name; tradeLicenseNo = tenant.tradeLicenseNo }
    }

    // Reconstruct fullName from firstName (column aliased as employeeName)
    const firstName = slip.employeeName ?? ''
    return { ...slip, employeeName: `${firstName}`, tenantName, tradeLicenseNo }
}

