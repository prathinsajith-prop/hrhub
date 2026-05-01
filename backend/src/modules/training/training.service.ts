import { eq, and, desc, ilike, isNull, sql, getTableColumns } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { trainingRecords, employees } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewTraining = InferInsertModel<typeof trainingRecords>

export async function listTraining(
    tenantId: string,
    params: {
        employeeId?: string
        status?: string
        type?: string
        search?: string
        limit: number
        offset: number
    },
) {
    const { employeeId, status, type, search, limit, offset } = params

    const conditions = [eq(trainingRecords.tenantId, tenantId), isNull(trainingRecords.deletedAt)]
    if (employeeId) conditions.push(eq(trainingRecords.employeeId, employeeId))
    if (status) conditions.push(eq(trainingRecords.status, status as never))
    if (type) conditions.push(eq(trainingRecords.type, type as never))
    if (search) conditions.push(ilike(trainingRecords.title, `%${search}%`))

    const rows = await db
        .select({
            ...getTableColumns(trainingRecords),
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            employeeNo: employees.employeeNo,
            employeeDepartment: employees.department,
            total: sql<number>`COUNT(*) OVER()`.as('total'),
        })
        .from(trainingRecords)
        .leftJoin(employees, eq(employees.id, trainingRecords.employeeId))
        .where(and(...conditions))
        .orderBy(desc(trainingRecords.startDate), desc(trainingRecords.createdAt))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0

    // KPI summary — scoped to the same employee filter so non-HR callers don't see company-wide stats
    const kpiConditions = [eq(trainingRecords.tenantId, tenantId), isNull(trainingRecords.deletedAt)]
    if (employeeId) kpiConditions.push(eq(trainingRecords.employeeId, employeeId))
    const [kpi] = await db
        .select({
            total: sql<number>`COUNT(*)`.as('total'),
            planned: sql<number>`COUNT(*) FILTER (WHERE status = 'planned')`.as('planned'),
            in_progress: sql<number>`COUNT(*) FILTER (WHERE status = 'in_progress')`.as('in_progress'),
            completed: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`.as('completed'),
            totalCost: sql<number>`COALESCE(SUM(CAST(cost AS NUMERIC)), 0)`.as('totalCost'),
        })
        .from(trainingRecords)
        .where(and(...kpiConditions))

    return {
        data: rows.map(r => { const { total: _, ...rest } = r; return rest }),
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
        summary: {
            total: Number(kpi?.total ?? 0),
            planned: Number(kpi?.planned ?? 0),
            inProgress: Number(kpi?.in_progress ?? 0),
            completed: Number(kpi?.completed ?? 0),
            totalCost: Number(kpi?.totalCost ?? 0),
        },
    }
}

export async function getTrainingRecord(tenantId: string, id: string) {
    const [row] = await db
        .select({
            ...getTableColumns(trainingRecords),
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            employeeNo: employees.employeeNo,
            employeeDepartment: employees.department,
        })
        .from(trainingRecords)
        .leftJoin(employees, eq(employees.id, trainingRecords.employeeId))
        .where(and(eq(trainingRecords.tenantId, tenantId), eq(trainingRecords.id, id), isNull(trainingRecords.deletedAt)))
    return row ?? null
}

export async function createTraining(
    tenantId: string,
    data: Omit<NewTraining, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
) {
    const [row] = await db
        .insert(trainingRecords)
        .values({ tenantId, ...data })
        .returning()
    return row
}

export async function updateTraining(
    tenantId: string,
    id: string,
    data: Partial<Omit<NewTraining, 'id' | 'tenantId'>>,
) {
    const [row] = await db
        .update(trainingRecords)
        .set(withTimestamp(data))
        .where(and(eq(trainingRecords.tenantId, tenantId), eq(trainingRecords.id, id), isNull(trainingRecords.deletedAt)))
        .returning()
    return row ?? null
}

export async function deleteTraining(tenantId: string, id: string) {
    const [row] = await db
        .update(trainingRecords)
        .set(withTimestamp({ deletedAt: new Date() }))
        .where(and(eq(trainingRecords.tenantId, tenantId), eq(trainingRecords.id, id), isNull(trainingRecords.deletedAt)))
        .returning()
    return row ?? null
}

export async function getEmployeeTraining(tenantId: string, employeeId: string) {
    return db
        .select()
        .from(trainingRecords)
        .where(
            and(
                eq(trainingRecords.tenantId, tenantId),
                eq(trainingRecords.employeeId, employeeId),
                isNull(trainingRecords.deletedAt),
            ),
        )
        .orderBy(desc(trainingRecords.startDate))
}
