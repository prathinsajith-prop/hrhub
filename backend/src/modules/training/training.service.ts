import { eq, and, desc, isNull, sql, getTableColumns } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { trainingRecords, employees } from '../../db/schema/index.js'
import { Conditions } from '../../lib/filters.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewTraining = InferInsertModel<typeof trainingRecords>

const TRAINING_FIELD_MAP = {
    status: trainingRecords.status,
    type: trainingRecords.type,
    startDate: trainingRecords.startDate,
    endDate: trainingRecords.endDate,
}
const TRAINING_ALLOWED = new Set(Object.keys(TRAINING_FIELD_MAP))

export async function listTraining(
    tenantId: string,
    params: {
        employeeId?: string
        status?: string
        type?: string
        search?: string
        filter?: string
        limit: number
        offset: number
    },
) {
    const { employeeId, status, type, search, filter, limit, offset } = params

    // Base: tenant + soft-delete + employee scope — shared by the KPI aggregation.
    const baseConds = Conditions.create()
        .tenant(trainingRecords.tenantId, tenantId)
        .notDeleted(trainingRecords.deletedAt)
        .match(trainingRecords.employeeId, employeeId)

    // Main query adds status / type / search filters on top.
    const mainConds = baseConds.fork()
        .match(trainingRecords.status, status)
        .match(trainingRecords.type, type)
        .search(search, trainingRecords.title)
        .filter(filter, TRAINING_FIELD_MAP, TRAINING_ALLOWED)

    const [rows, [kpi]] = await Promise.all([
        db
            .select({
                ...getTableColumns(trainingRecords),
                employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
                employeeNo: employees.employeeNo,
                employeeDepartment: employees.department,
                total: sql<number>`COUNT(*) OVER()`.as('total'),
            })
            .from(trainingRecords)
            .leftJoin(employees, eq(employees.id, trainingRecords.employeeId))
            .where(mainConds.where())
            .orderBy(desc(trainingRecords.startDate), desc(trainingRecords.createdAt))
            .limit(limit)
            .offset(offset),
        // KPI summary — scoped to employee only (no status/search) so counts reflect all training for that employee
        db
            .select({
                total: sql<number>`COUNT(*)`.as('total'),
                planned: sql<number>`COUNT(*) FILTER (WHERE status = 'planned')`.as('planned'),
                in_progress: sql<number>`COUNT(*) FILTER (WHERE status = 'in_progress')`.as('in_progress'),
                completed: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`.as('completed'),
                totalCost: sql<number>`COALESCE(SUM(CAST(cost AS NUMERIC)), 0)`.as('totalCost'),
            })
            .from(trainingRecords)
            .where(baseConds.where()),
    ])

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0

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
