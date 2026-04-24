import { eq, and, desc, ilike, isNull, sql, getTableColumns, or, lt, count } from 'drizzle-orm'
import { withTimestamp, encodeCursor, decodeCursor } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { assets, assetCategories, assetAssignments, assetMaintenance, employees } from '../../db/schema/index.js'
import { cacheDel } from '../../lib/redis.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewAsset = InferInsertModel<typeof assets>
type NewAssignment = InferInsertModel<typeof assetAssignments>
type NewMaintenance = InferInsertModel<typeof assetMaintenance>

// ─── Categories ──────────────────────────────────────────────────────────────

export async function listCategories(tenantId: string) {
    return db
        .select()
        .from(assetCategories)
        .where(eq(assetCategories.tenantId, tenantId))
        .orderBy(assetCategories.name)
}

export async function createCategory(tenantId: string, data: { name: string; description?: string }) {
    const [row] = await db
        .insert(assetCategories)
        .values({ tenantId, name: data.name, description: data.description ?? null })
        .returning()
    return row
}

// ─── Assets ──────────────────────────────────────────────────────────────────

export async function listAssets(
    tenantId: string,
    params: {
        status?: string
        categoryId?: string
        search?: string
        limit: number
        offset: number
        after?: string
    },
) {
    const { status, categoryId, search, limit, offset, after } = params

    const conditions = [eq(assets.tenantId, tenantId), isNull(assets.deletedAt)]
    if (status) conditions.push(eq(assets.status, status as never))
    if (categoryId) conditions.push(eq(assets.categoryId, categoryId))
    if (search) conditions.push(ilike(assets.name, `%${search}%`))

    const cursor = after ? decodeCursor(after) : null
    if (cursor) {
        const cursorDate = new Date(cursor.c)
        conditions.push(
            or(
                lt(assets.createdAt, cursorDate),
                and(eq(assets.createdAt, cursorDate), lt(assets.id, cursor.i))
            )!
        )
    }

    const pageSize = limit + 1
    const rows = await db
        .select({
            ...getTableColumns(assets),
            categoryName: assetCategories.name,
            // Current assignment employee info
            assignedEmployeeId: sql<string | null>`(
                SELECT aa.employee_id::text FROM asset_assignments aa
                WHERE aa.asset_id = ${assets.id} AND aa.status = 'assigned'
                LIMIT 1
            )`,
            assignedEmployeeName: sql<string | null>`(
                SELECT e.first_name || ' ' || e.last_name FROM asset_assignments aa
                JOIN employees e ON e.id = aa.employee_id
                WHERE aa.asset_id = ${assets.id} AND aa.status = 'assigned'
                LIMIT 1
            )`,
            assignedEmployeeNo: sql<string | null>`(
                SELECT e.employee_no FROM asset_assignments aa
                JOIN employees e ON e.id = aa.employee_id
                WHERE aa.asset_id = ${assets.id} AND aa.status = 'assigned'
                LIMIT 1
            )`,
        })
        .from(assets)
        .leftJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
        .where(and(...conditions))
        .orderBy(desc(assets.createdAt), desc(assets.id))
        .limit(cursor ? pageSize : limit)
        .offset(cursor ? 0 : offset)

    const hasMore = cursor ? rows.length > limit : false
    const pageRows = cursor ? rows.slice(0, limit) : rows
    const lastRow = pageRows.at(-1)
    const nextCursor =
        cursor && hasMore && lastRow
            ? encodeCursor(lastRow.createdAt, lastRow.id)
            : undefined

    let total = 0
    if (!cursor) {
        const [countRow] = await db
            .select({ count: sql<number>`COUNT(*)`.as('count') })
            .from(assets)
            .where(and(...conditions))
        total = Number(countRow?.count ?? 0)
    }

    // KPI summary counts
    const [kpi] = await db
        .select({
            total: sql<number>`COUNT(*)`.as('total'),
            available: sql<number>`COUNT(*) FILTER (WHERE status = 'available')`.as('available'),
            assigned: sql<number>`COUNT(*) FILTER (WHERE status = 'assigned')`.as('assigned'),
            maintenance: sql<number>`COUNT(*) FILTER (WHERE status = 'maintenance')`.as('maintenance'),
        })
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), isNull(assets.deletedAt)))

    return {
        data: pageRows,
        total: cursor ? undefined : total,
        nextCursor,
        hasMore: cursor ? hasMore : undefined,
        limit,
        offset: cursor ? undefined : offset,
        summary: {
            total: Number(kpi?.total ?? 0),
            available: Number(kpi?.available ?? 0),
            assigned: Number(kpi?.assigned ?? 0),
            maintenance: Number(kpi?.maintenance ?? 0),
        },
    }
}

export async function getAsset(tenantId: string, id: string) {
    const [row] = await db
        .select({
            ...getTableColumns(assets),
            categoryName: assetCategories.name,
        })
        .from(assets)
        .leftJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
        .where(and(eq(assets.tenantId, tenantId), eq(assets.id, id), isNull(assets.deletedAt)))
    return row ?? null
}

export async function createAsset(tenantId: string, data: Omit<NewAsset, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'>) {
    const [row] = await db
        .insert(assets)
        .values({ tenantId, ...data })
        .returning()
    await cacheDel(`dashboard:kpis:${tenantId}`)
    return row
}

export async function updateAsset(tenantId: string, id: string, data: Partial<Omit<NewAsset, 'id' | 'tenantId'>>) {
    const [row] = await db
        .update(assets)
        .set(withTimestamp(data))
        .where(and(eq(assets.tenantId, tenantId), eq(assets.id, id), isNull(assets.deletedAt)))
        .returning()
    return row ?? null
}

export async function softDeleteAsset(tenantId: string, id: string) {
    const [row] = await db
        .update(assets)
        .set(withTimestamp({ deletedAt: new Date() }))
        .where(and(eq(assets.tenantId, tenantId), eq(assets.id, id), isNull(assets.deletedAt)))
        .returning()
    if (row) await cacheDel(`dashboard:kpis:${tenantId}`)
    return row ?? null
}

// ─── Assignments ─────────────────────────────────────────────────────────────

export async function assignAsset(
    tenantId: string,
    assetId: string,
    data: {
        employeeId: string
        assignedBy: string
        assignedDate: string
        expectedReturnDate?: string
        notes?: string
    },
) {
    // Verify asset is available
    const [asset] = await db
        .select()
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), eq(assets.id, assetId), isNull(assets.deletedAt)))
    if (!asset) throw Object.assign(new Error('Asset not found'), { statusCode: 404 })
    if (asset.status !== 'available')
        throw Object.assign(new Error(`Asset is not available (current status: ${asset.status})`), { statusCode: 409 })

    const [assignment] = await db
        .insert(assetAssignments)
        .values({
            tenantId,
            assetId,
            employeeId: data.employeeId,
            assignedBy: data.assignedBy,
            assignedDate: data.assignedDate,
            expectedReturnDate: data.expectedReturnDate ?? null,
            notes: data.notes ?? null,
            status: 'assigned',
        })
        .returning()

    await db
        .update(assets)
        .set(withTimestamp({ status: 'assigned' }))
        .where(eq(assets.id, assetId))

    await cacheDel(`dashboard:kpis:${tenantId}`)
    return assignment
}

export async function returnAsset(
    tenantId: string,
    assignmentId: string,
    data: { actualReturnDate?: string; notes?: string },
) {
    const [assignment] = await db
        .select()
        .from(assetAssignments)
        .where(and(eq(assetAssignments.tenantId, tenantId), eq(assetAssignments.id, assignmentId)))

    if (!assignment) throw Object.assign(new Error('Assignment not found'), { statusCode: 404 })
    if (assignment.status !== 'assigned')
        throw Object.assign(new Error('Assignment is not in assigned status'), { statusCode: 409 })

    const returnDate = data.actualReturnDate ?? new Date().toISOString().slice(0, 10)

    const [updated] = await db
        .update(assetAssignments)
        .set(withTimestamp({ status: 'returned', actualReturnDate: returnDate, notes: data.notes ?? assignment.notes }))
        .where(eq(assetAssignments.id, assignmentId))
        .returning()

    await db
        .update(assets)
        .set(withTimestamp({ status: 'available' }))
        .where(eq(assets.id, assignment.assetId))

    await cacheDel(`dashboard:kpis:${tenantId}`)
    return updated
}

export async function markAssetLost(tenantId: string, assignmentId: string) {
    const [assignment] = await db
        .select()
        .from(assetAssignments)
        .where(and(eq(assetAssignments.tenantId, tenantId), eq(assetAssignments.id, assignmentId)))

    if (!assignment) throw Object.assign(new Error('Assignment not found'), { statusCode: 404 })
    if (assignment.status !== 'assigned')
        throw Object.assign(new Error('Assignment is not in assigned status'), { statusCode: 409 })

    const [updated] = await db
        .update(assetAssignments)
        .set(withTimestamp({ status: 'lost' }))
        .where(eq(assetAssignments.id, assignmentId))
        .returning()

    await db
        .update(assets)
        .set(withTimestamp({ status: 'lost' }))
        .where(eq(assets.id, assignment.assetId))

    await cacheDel(`dashboard:kpis:${tenantId}`)
    return updated
}

export async function getEmployeeAssets(tenantId: string, employeeId: string) {
    return db
        .select({
            ...getTableColumns(assetAssignments),
            assetCode: assets.assetCode,
            assetName: assets.name,
            assetBrand: assets.brand,
            assetModel: assets.model,
            assetSerialNumber: assets.serialNumber,
            assetCondition: assets.condition,
            categoryName: assetCategories.name,
        })
        .from(assetAssignments)
        .leftJoin(assets, eq(assets.id, assetAssignments.assetId))
        .leftJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
        .where(
            and(
                eq(assetAssignments.tenantId, tenantId),
                eq(assetAssignments.employeeId, employeeId),
                eq(assetAssignments.status, 'assigned'),
            ),
        )
        .orderBy(desc(assetAssignments.assignedDate))
}

export async function getAssetAssignmentHistory(tenantId: string, assetId: string) {
    return db
        .select({
            ...getTableColumns(assetAssignments),
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            employeeNo: employees.employeeNo,
            employeeDepartment: employees.department,
        })
        .from(assetAssignments)
        .leftJoin(employees, eq(employees.id, assetAssignments.employeeId))
        .where(and(eq(assetAssignments.tenantId, tenantId), eq(assetAssignments.assetId, assetId)))
        .orderBy(desc(assetAssignments.createdAt))
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

export async function createMaintenanceRecord(
    tenantId: string,
    assetId: string,
    data: { reportedBy: string; issueDescription: string; notes?: string },
) {
    const [asset] = await db
        .select()
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), eq(assets.id, assetId), isNull(assets.deletedAt)))
    if (!asset) throw Object.assign(new Error('Asset not found'), { statusCode: 404 })

    const [record] = await db
        .insert(assetMaintenance)
        .values({
            tenantId,
            assetId,
            reportedBy: data.reportedBy,
            issueDescription: data.issueDescription,
            notes: data.notes ?? null,
            status: 'open',
        })
        .returning()

    await db
        .update(assets)
        .set(withTimestamp({ status: 'maintenance' }))
        .where(eq(assets.id, assetId))

    await cacheDel(`dashboard:kpis:${tenantId}`)
    return record
}

export async function updateMaintenanceRecord(
    tenantId: string,
    maintenanceId: string,
    data: { status?: 'open' | 'in_progress' | 'resolved'; cost?: string; notes?: string },
) {
    const [existing] = await db
        .select()
        .from(assetMaintenance)
        .where(and(eq(assetMaintenance.tenantId, tenantId), eq(assetMaintenance.id, maintenanceId)))
    if (!existing) throw Object.assign(new Error('Maintenance record not found'), { statusCode: 404 })

    const updates: Record<string, unknown> = {}
    if (data.status) updates.status = data.status
    if (data.cost !== undefined) updates.cost = data.cost
    if (data.notes !== undefined) updates.notes = data.notes
    if (data.status === 'resolved') updates.resolvedAt = new Date()

    const [updated] = await db
        .update(assetMaintenance)
        .set(withTimestamp(updates))
        .where(eq(assetMaintenance.id, maintenanceId))
        .returning()

    // If resolved, set asset back to available
    if (data.status === 'resolved') {
        await db
            .update(assets)
            .set(withTimestamp({ status: 'available' }))
            .where(and(eq(assets.id, existing.assetId), eq(assets.status, 'maintenance')))
        await cacheDel(`dashboard:kpis:${tenantId}`)
    }

    return updated
}

export async function listMaintenanceRecords(tenantId: string, assetId: string) {
    return db
        .select()
        .from(assetMaintenance)
        .where(and(eq(assetMaintenance.tenantId, tenantId), eq(assetMaintenance.assetId, assetId)))
        .orderBy(desc(assetMaintenance.createdAt))
}
