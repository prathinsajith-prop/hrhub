import { eq, and, desc, isNull, sql, getTableColumns } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { employeeLoans, employees, users } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewLoan = InferInsertModel<typeof employeeLoans>

export async function listLoans(
    tenantId: string,
    params: {
        employeeId?: string
        status?: string
        limit: number
        offset: number
    },
) {
    const { employeeId, status, limit, offset } = params

    const conditions = [eq(employeeLoans.tenantId, tenantId), isNull(employeeLoans.deletedAt)]
    if (employeeId) conditions.push(eq(employeeLoans.employeeId, employeeId))
    if (status) conditions.push(eq(employeeLoans.status, status as never))

    const rows = await db
        .select({
            ...getTableColumns(employeeLoans),
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            employeeNo: employees.employeeNo,
            employeeDepartment: employees.department,
            approverName: sql<string | null>`${users.name}`,
            total: sql<number>`COUNT(*) OVER()`.as('total'),
        })
        .from(employeeLoans)
        .leftJoin(employees, eq(employees.id, employeeLoans.employeeId))
        .leftJoin(users, eq(users.id, employeeLoans.approvedBy))
        .where(and(...conditions))
        .orderBy(desc(employeeLoans.createdAt))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0

    // KPI summary
    const [kpi] = await db
        .select({
            total: sql<number>`COUNT(*)`.as('total'),
            pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`.as('pending'),
            active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`.as('active'),
            totalDisbursed: sql<number>`COALESCE(SUM(CAST(amount AS NUMERIC)) FILTER (WHERE status IN ('active', 'completed')), 0)`.as('totalDisbursed'),
            totalOutstanding: sql<number>`COALESCE(SUM(CAST(remaining_balance AS NUMERIC)) FILTER (WHERE status = 'active'), 0)`.as('totalOutstanding'),
        })
        .from(employeeLoans)
        .where(and(
            eq(employeeLoans.tenantId, tenantId),
            isNull(employeeLoans.deletedAt),
            ...(employeeId ? [eq(employeeLoans.employeeId, employeeId)] : []),
        ))

    return {
        data: rows.map(r => { const { total: _, ...rest } = r; return rest }),
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
        summary: {
            total: Number(kpi?.total ?? 0),
            pending: Number(kpi?.pending ?? 0),
            active: Number(kpi?.active ?? 0),
            totalDisbursed: Number(kpi?.totalDisbursed ?? 0),
            totalOutstanding: Number(kpi?.totalOutstanding ?? 0),
        },
    }
}

export async function getLoan(tenantId: string, id: string) {
    const [row] = await db
        .select({
            ...getTableColumns(employeeLoans),
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            employeeNo: employees.employeeNo,
            employeeDepartment: employees.department,
            approverName: sql<string | null>`${users.name}`,
        })
        .from(employeeLoans)
        .leftJoin(employees, eq(employees.id, employeeLoans.employeeId))
        .leftJoin(users, eq(users.id, employeeLoans.approvedBy))
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
    return row ?? null
}

export async function deleteLoan(tenantId: string, id: string) {
    const [row] = await db
        .update(employeeLoans)
        .set(withTimestamp({ deletedAt: new Date() }))
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
        .returning()
    return row ?? null
}

export async function createLoan(
    tenantId: string,
    data: Omit<NewLoan, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
) {
    // Compute derived fields
    const amount = parseFloat(String(data.amount))
    const monthly = parseFloat(String(data.monthlyDeduction))
    const totalInstallments = monthly > 0 ? Math.ceil(amount / monthly) : null

    const [row] = await db
        .insert(employeeLoans)
        .values({
            tenantId,
            ...data,
            remainingBalance: String(amount),
            totalInstallments,
            paidInstallments: 0,
            status: 'pending',
        })
        .returning()
    return row
}

export async function approveLoan(
    tenantId: string,
    id: string,
    approverId: string,
    startDate?: string,
) {
    const [existing] = await db
        .select()
        .from(employeeLoans)
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
    if (!existing) throw Object.assign(new Error('Loan not found'), { statusCode: 404 })
    if (existing.status !== 'pending')
        throw Object.assign(new Error('Only pending loans can be approved'), { statusCode: 409 })

    const [updated] = await db
        .update(employeeLoans)
        .set(withTimestamp({
            status: 'active',
            approvedBy: approverId,
            approvedAt: new Date(),
            startDate: startDate ?? new Date().toISOString().slice(0, 10),
        }))
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
        .returning()
    return updated
}

export async function rejectLoan(tenantId: string, id: string, notes?: string) {
    const [existing] = await db
        .select()
        .from(employeeLoans)
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
    if (!existing) throw Object.assign(new Error('Loan not found'), { statusCode: 404 })
    if (existing.status !== 'pending')
        throw Object.assign(new Error('Only pending loans can be rejected'), { statusCode: 409 })

    const [updated] = await db
        .update(employeeLoans)
        .set(withTimestamp({ status: 'rejected', notes: notes ?? existing.notes }))
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
        .returning()
    return updated
}

export async function recordLoanPayment(tenantId: string, id: string) {
    return db.transaction(async (tx) => {
        const [existing] = await tx
            .select()
            .from(employeeLoans)
            .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
            .for('update')
        if (!existing) throw Object.assign(new Error('Loan not found'), { statusCode: 404 })
        if (existing.status !== 'active')
            throw Object.assign(new Error('Loan is not active'), { statusCode: 409 })

        const monthly = parseFloat(String(existing.monthlyDeduction))
        const current = parseFloat(String(existing.remainingBalance ?? existing.amount))
        const newBalance = Math.max(0, current - monthly)
        const newPaid = (existing.paidInstallments ?? 0) + 1
        const newStatus = newBalance === 0 ? 'completed' : 'active'

        const [updated] = await tx
            .update(employeeLoans)
            .set(withTimestamp({
                paidInstallments: newPaid,
                remainingBalance: String(newBalance),
                status: newStatus,
            }))
            .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
            .returning()
        return updated ?? null
    })
}

export async function getEmployeeActiveLoans(tenantId: string, employeeId: string) {
    return db
        .select()
        .from(employeeLoans)
        .where(
            and(
                eq(employeeLoans.tenantId, tenantId),
                eq(employeeLoans.employeeId, employeeId),
                eq(employeeLoans.status, 'active'),
                isNull(employeeLoans.deletedAt),
            ),
        )
        .orderBy(desc(employeeLoans.createdAt))
}

export async function getEmployeeAllLoans(tenantId: string, employeeId: string) {
    return db
        .select()
        .from(employeeLoans)
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.employeeId, employeeId), isNull(employeeLoans.deletedAt)))
        .orderBy(desc(employeeLoans.createdAt))
}
