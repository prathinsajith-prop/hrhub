import { eq, and, desc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { visaCosts, employees } from '../../db/schema/index.js'

export type CostCategory = 'govt_fee' | 'medical' | 'typing' | 'translation' | 'other'

export interface CreateCostInput {
    visaApplicationId?: string
    employeeId: string
    category: CostCategory
    description?: string
    amount: number
    currency?: string
    paidDate: string
    receiptRef?: string
    createdBy?: string
}

export async function listVisaCosts(tenantId: string, visaApplicationId: string) {
    return db
        .select({
            id: visaCosts.id,
            visaApplicationId: visaCosts.visaApplicationId,
            employeeId: visaCosts.employeeId,
            category: visaCosts.category,
            description: visaCosts.description,
            amount: visaCosts.amount,
            currency: visaCosts.currency,
            paidDate: visaCosts.paidDate,
            receiptRef: visaCosts.receiptRef,
            createdAt: visaCosts.createdAt,
        })
        .from(visaCosts)
        .where(and(
            eq(visaCosts.tenantId, tenantId),
            eq(visaCosts.visaApplicationId, visaApplicationId),
        ))
        .orderBy(desc(visaCosts.paidDate), desc(visaCosts.createdAt))
}

export async function addVisaCost(tenantId: string, input: CreateCostInput) {
    const [row] = await db
        .insert(visaCosts)
        .values({
            tenantId,
            visaApplicationId: input.visaApplicationId ?? null,
            employeeId: input.employeeId,
            category: input.category,
            description: input.description ?? null,
            amount: String(input.amount),
            currency: input.currency ?? 'AED',
            paidDate: input.paidDate,
            receiptRef: input.receiptRef ?? null,
            createdBy: input.createdBy ?? null,
        })
        .returning()
    return row
}

export async function deleteVisaCost(tenantId: string, costId: string) {
    const [row] = await db
        .delete(visaCosts)
        .where(and(eq(visaCosts.id, costId), eq(visaCosts.tenantId, tenantId)))
        .returning({ id: visaCosts.id })
    return row ?? null
}

export async function getPROCostReport(tenantId: string) {
    const currentYear = new Date().getFullYear()
    const yearStart = `${currentYear}-01-01`

    const [allCosts, byCategoryRows, byMonthRows] = await Promise.all([
        // All costs YTD with employee name
        db
            .select({
                id: visaCosts.id,
                visaApplicationId: visaCosts.visaApplicationId,
                employeeId: visaCosts.employeeId,
                employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
                category: visaCosts.category,
                description: visaCosts.description,
                amount: visaCosts.amount,
                currency: visaCosts.currency,
                paidDate: visaCosts.paidDate,
                receiptRef: visaCosts.receiptRef,
                createdAt: visaCosts.createdAt,
            })
            .from(visaCosts)
            .leftJoin(employees, eq(visaCosts.employeeId, employees.id))
            .where(and(
                eq(visaCosts.tenantId, tenantId),
                sql`${visaCosts.paidDate} >= ${yearStart}`,
            ))
            .orderBy(desc(visaCosts.paidDate)),

        // By category totals
        db
            .select({
                category: visaCosts.category,
                total: sql<string>`sum(${visaCosts.amount}::numeric)`,
                count: sql<string>`count(*)`,
            })
            .from(visaCosts)
            .where(and(
                eq(visaCosts.tenantId, tenantId),
                sql`${visaCosts.paidDate} >= ${yearStart}`,
            ))
            .groupBy(visaCosts.category)
            .orderBy(sql`sum(${visaCosts.amount}::numeric) desc`),

        // By month totals
        db
            .select({
                month: sql<string>`to_char(${visaCosts.paidDate}, 'Mon YYYY')`,
                monthSort: sql<string>`to_char(${visaCosts.paidDate}, 'YYYY-MM')`,
                total: sql<string>`sum(${visaCosts.amount}::numeric)`,
                count: sql<string>`count(*)`,
            })
            .from(visaCosts)
            .where(and(
                eq(visaCosts.tenantId, tenantId),
                sql`${visaCosts.paidDate} >= ${yearStart}`,
            ))
            .groupBy(sql`to_char(${visaCosts.paidDate}, 'Mon YYYY')`, sql`to_char(${visaCosts.paidDate}, 'YYYY-MM')`)
            .orderBy(sql`to_char(${visaCosts.paidDate}, 'YYYY-MM')`),
    ])

    // Group costs by employee
    const employeeMap = new Map<string, {
        employeeId: string
        employeeName: string
        total: number
        count: number
        costs: typeof allCosts
    }>()

    for (const c of allCosts) {
        const existing = employeeMap.get(c.employeeId)
        const amount = Number(c.amount)
        if (existing) {
            existing.total += amount
            existing.count += 1
            existing.costs.push(c)
        } else {
            employeeMap.set(c.employeeId, {
                employeeId: c.employeeId,
                employeeName: c.employeeName ?? 'Unknown',
                total: amount,
                count: 1,
                costs: [c],
            })
        }
    }

    const byEmployee = Array.from(employeeMap.values())
        .sort((a, b) => b.total - a.total)
        .map(e => ({
            ...e,
            costs: e.costs.map(c => ({ ...c, amount: Number(c.amount) })),
        }))

    const ytdTotal = allCosts.reduce((s, c) => s + Number(c.amount), 0)
    const avgPerEmployee = byEmployee.length > 0 ? ytdTotal / byEmployee.length : 0

    return {
        ytdTotal,
        avgPerEmployee,
        totalTransactions: allCosts.length,
        byCategory: byCategoryRows.map(r => ({
            label: r.category,
            total: Number(r.total ?? 0),
            count: Number(r.count ?? 0),
        })),
        byMonth: byMonthRows.map(r => ({
            period: r.month,
            total: Number(r.total ?? 0),
            count: Number(r.count ?? 0),
        })),
        byEmployee,
        recentCosts: allCosts.slice(0, 20).map(c => ({ ...c, amount: Number(c.amount) })),
    }
}
