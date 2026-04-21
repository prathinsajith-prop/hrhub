import { eq, and, count, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { payrollRuns, payslips, employees } from '../../db/schema/index.js'
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
