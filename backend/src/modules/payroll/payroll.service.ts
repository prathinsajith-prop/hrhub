import { eq, and, count, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { payrollRuns, payslips } from '../../db/schema/index.js'
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
