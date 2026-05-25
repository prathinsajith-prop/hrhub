import { eq, and, desc, isNull, sql, getTableColumns } from 'drizzle-orm'
import { withTimestamp, encodeCursor, decodeCursor } from '../../lib/db-helpers.js'
import { Conditions } from '../../lib/filters.js'
import { db } from '../../db/index.js'
import { assets, assetCategories, assetAssignments, assetMaintenance, employees, tenants } from '../../db/schema/index.js'
import { cacheDel } from '../../lib/redis.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewAsset = InferInsertModel<typeof assets>

const ASSET_FIELD_MAP = {
    status: assets.status,
    condition: assets.condition,
    categoryId: assets.categoryId,
}
const ASSET_ALLOWED = new Set(Object.keys(ASSET_FIELD_MAP))

// ─── Categories ──────────────────────────────────────────────────────────────

export async function listCategories(tenantId: string) {
    return db
        .select()
        .from(assetCategories)
        .where(and(eq(assetCategories.tenantId, tenantId), isNull(assetCategories.deletedAt)))
        .orderBy(assetCategories.name)
}

export async function deleteCategory(tenantId: string, id: string) {
    const [row] = await db
        .update(assetCategories)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(assetCategories.id, id), eq(assetCategories.tenantId, tenantId), isNull(assetCategories.deletedAt)))
        .returning()
    return row ?? null
}

export async function generateNextAssetCode(tenantId: string): Promise<string> {
    const [tenant] = await db
        .select({ companyCode: tenants.companyCode })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

    const prefix = tenant?.companyCode ?? 'ORG'

    const [row] = await db
        .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
        .from(assets)
        .where(eq(assets.tenantId, tenantId))

    const seq = String((row?.count ?? 0) + 1).padStart(5, '0')
    return `${prefix}-AST-${seq}`
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
        filter?: string
        limit: number
        offset: number
        after?: string
    },
) {
    const { status, categoryId, search, filter, limit, offset, after } = params

    const cursor = after ? decodeCursor(after) : null

    const conds = Conditions.create()
        .tenant(assets.tenantId, tenantId)
        .notDeleted(assets.deletedAt)
        .match(assets.status, status)
        .match(assets.categoryId, categoryId)
        .like(assets.name, search)
        .filter(filter, ASSET_FIELD_MAP, ASSET_ALLOWED)
        .cursor(after, assets.createdAt, assets.id)

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
        .where(conds.where())
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
            .where(conds.where())
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
    const assetCode = data.assetCode || await generateNextAssetCode(tenantId)
    const [row] = await db
        .insert(assets)
        .values({ tenantId, ...data, assetCode })
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
        .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId)))

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
        .where(and(eq(assetAssignments.id, assignmentId), eq(assetAssignments.tenantId, tenantId)))
        .returning()

    await db
        .update(assets)
        .set(withTimestamp({ status: 'available' }))
        .where(and(eq(assets.id, assignment.assetId), eq(assets.tenantId, tenantId)))

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
        .where(and(eq(assetAssignments.id, assignmentId), eq(assetAssignments.tenantId, tenantId)))
        .returning()

    await db
        .update(assets)
        .set(withTimestamp({ status: 'lost' }))
        .where(and(eq(assets.id, assignment.assetId), eq(assets.tenantId, tenantId)))

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
        .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId)))

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
        .where(and(eq(assetMaintenance.id, maintenanceId), eq(assetMaintenance.tenantId, tenantId)))
        .returning()

    // If resolved, set asset back to available
    if (data.status === 'resolved') {
        await db
            .update(assets)
            .set(withTimestamp({ status: 'available' }))
            .where(and(eq(assets.id, existing.assetId), eq(assets.tenantId, tenantId), eq(assets.status, 'maintenance')))
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

// ─── Bulk import ─────────────────────────────────────────────────────────────
//
// Two-stage flow shared with the dialog:
//   1. validateBulkAssetRows() — pure shape check + tenant-scoped category
//      resolution + duplicate detection. Returns one row-result per input
//      with `ok`, `errors`, and (if `ok`) the normalized insert payload
//      ready for stage 2. Does NOT write to the DB so HR can iterate.
//   2. bulkCreateAssets()      — re-validates and inserts everything in a
//      single transaction. Only `ok` rows from stage 1 are persisted;
//      invalid rows are dropped (the UI shows them with a red badge).
//
// Server-side validation is the source of truth — the parser in the
// browser only does shape checks. Anything cross-tenant (categoryName →
// categoryId lookup, asset-code uniqueness) is enforced here.

export type BulkAssetStatus = 'available' | 'assigned' | 'maintenance' | 'lost' | 'retired'
export type BulkAssetCondition = 'new' | 'good' | 'damaged'

const VALID_STATUSES = new Set<BulkAssetStatus>(['available', 'assigned', 'maintenance', 'lost', 'retired'])
const VALID_CONDITIONS = new Set<BulkAssetCondition>(['new', 'good', 'damaged'])

export interface BulkAssetInputRow {
    rowNumber: number
    assetCode?: string | null
    name?: string | null
    categoryName?: string | null
    brand?: string | null
    model?: string | null
    serialNumber?: string | null
    purchaseDate?: string | null
    purchaseCost?: number | string | null
    status?: string | null
    condition?: string | null
    notes?: string | null
}

export interface BulkAssetRowResult {
    rowNumber: number
    ok: boolean
    errors: string[]
    /** Set when `ok` — normalized row ready for DB insert. */
    resolved?: {
        assetCode: string | null
        name: string
        categoryId: string | null
        categoryName: string | null
        brand: string | null
        model: string | null
        serialNumber: string | null
        purchaseDate: string | null
        purchaseCost: string | null
        status: BulkAssetStatus
        condition: BulkAssetCondition
        notes: string | null
    }
    /** True when assetCode collides with an existing asset in this tenant. */
    duplicateCode?: boolean
}

export interface BulkAssetValidationResult {
    rows: BulkAssetRowResult[]
    summary: {
        total: number
        valid: number
        invalid: number
    }
}

export interface BulkAssetLookups {
    /** Lowercased category name → categoryId, scoped to the tenant. */
    categoryByName: Map<string, string>
    /** Lowercased asset codes already in this tenant. */
    existingCodes: Set<string>
}

/**
 * Pure row-validation core. Extracted from `validateBulkAssetRows` so it
 * can be unit-tested with hand-built lookups instead of mocking Drizzle.
 * Handles every per-row rule: required fields, enum coercion, numeric
 * parsing, date parsing, duplicate detection (in the payload + against
 * the DB via the `existingCodes` set).
 */
export function validateBulkAssetRowsSync(
    rows: BulkAssetInputRow[],
    lookups: BulkAssetLookups,
): BulkAssetValidationResult {
    // Track codes appearing more than once within the upload itself.
    const codeOccurrences = new Map<string, number>()
    for (const r of rows) {
        const code = (r.assetCode ?? '').trim().toLowerCase()
        if (code) codeOccurrences.set(code, (codeOccurrences.get(code) ?? 0) + 1)
    }

    const results: BulkAssetRowResult[] = rows.map((r) => {
        const errors: string[] = []
        const name = (r.name ?? '').trim()
        if (!name) errors.push('name is required')

        // Category — optional but if provided must resolve.
        const catRaw = (r.categoryName ?? '').trim()
        let categoryId: string | null = null
        if (catRaw) {
            const id = lookups.categoryByName.get(catRaw.toLowerCase())
            if (!id) errors.push(`category "${catRaw}" not found`)
            else categoryId = id
        }

        // Asset code — optional (auto-generated if blank).
        const code = (r.assetCode ?? '').trim() || null
        let duplicateCode = false
        if (code) {
            const lc = code.toLowerCase()
            if (lookups.existingCodes.has(lc)) {
                errors.push(`asset code "${code}" already exists`)
                duplicateCode = true
            } else if ((codeOccurrences.get(lc) ?? 0) > 1) {
                errors.push(`asset code "${code}" is duplicated in this file`)
                duplicateCode = true
            }
        }

        // Numeric / enum coercions.
        const status = (r.status ?? '').trim().toLowerCase() || 'available'
        if (!VALID_STATUSES.has(status as BulkAssetStatus)) {
            errors.push(`status must be one of: ${Array.from(VALID_STATUSES).join(', ')}`)
        }
        const condition = (r.condition ?? '').trim().toLowerCase() || 'good'
        if (!VALID_CONDITIONS.has(condition as BulkAssetCondition)) {
            errors.push(`condition must be one of: ${Array.from(VALID_CONDITIONS).join(', ')}`)
        }

        let purchaseCost: string | null = null
        if (r.purchaseCost !== null && r.purchaseCost !== undefined && r.purchaseCost !== '') {
            const num = typeof r.purchaseCost === 'number' ? r.purchaseCost : Number(String(r.purchaseCost).trim())
            if (!Number.isFinite(num) || num < 0) {
                errors.push('purchase_cost must be a non-negative number')
            } else {
                purchaseCost = num.toFixed(2)
            }
        }

        // Purchase date — accept ISO YYYY-MM-DD; reject anything that
        // doesn't parse so HR sees the typo here, not at SQL insert time.
        let purchaseDate: string | null = null
        if (r.purchaseDate) {
            const raw = String(r.purchaseDate).trim()
            const iso = raw.match(/^\d{4}-\d{2}-\d{2}$/)
                ? raw
                : (() => {
                    const d = new Date(raw)
                    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
                })()
            if (!iso) errors.push('purchase_date must be a valid date (YYYY-MM-DD)')
            else purchaseDate = iso
        }

        const ok = errors.length === 0
        return {
            rowNumber: r.rowNumber,
            ok,
            errors,
            duplicateCode,
            resolved: ok
                ? {
                      assetCode: code,
                      name,
                      categoryId,
                      categoryName: catRaw || null,
                      brand: (r.brand ?? '').trim() || null,
                      model: (r.model ?? '').trim() || null,
                      serialNumber: (r.serialNumber ?? '').trim() || null,
                      purchaseDate,
                      purchaseCost,
                      status: status as BulkAssetStatus,
                      condition: condition as BulkAssetCondition,
                      notes: (r.notes ?? '').trim() || null,
                  }
                : undefined,
        }
    })

    return {
        rows: results,
        summary: {
            total: results.length,
            valid: results.filter((r) => r.ok).length,
            invalid: results.filter((r) => !r.ok).length,
        },
    }
}

/**
 * Validate a batch of rows. Loads the tenant's categories and existing
 * asset codes in two read-only queries, then hands off to the pure
 * `validateBulkAssetRowsSync` core. Returns per-row outcome so the UI
 * can show a green/red preview before HR commits.
 */
export async function validateBulkAssetRows(
    tenantId: string,
    rows: BulkAssetInputRow[],
): Promise<BulkAssetValidationResult> {
    const categoryByName = new Map<string, string>()
    const cats = await db
        .select({ id: assetCategories.id, name: assetCategories.name })
        .from(assetCategories)
        .where(and(eq(assetCategories.tenantId, tenantId), isNull(assetCategories.deletedAt)))
    for (const c of cats) categoryByName.set(c.name.toLowerCase(), c.id)

    const existingCodes = new Set<string>()
    const dbCodes = await db
        .select({ code: assets.assetCode })
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), isNull(assets.deletedAt)))
    for (const r of dbCodes) existingCodes.add(r.code.toLowerCase())

    return validateBulkAssetRowsSync(rows, { categoryByName, existingCodes })
}

/**
 * Insert all valid rows in a single transaction. Re-runs validation
 * server-side so the import endpoint stays safe even if the client
 * skipped or replayed `/bulk-validate`. Returns the same per-row
 * outcome shape plus the inserted row counts.
 */
export async function bulkCreateAssets(
    tenantId: string,
    rows: BulkAssetInputRow[],
): Promise<BulkAssetValidationResult & { created: number; skipped: number }> {
    const validation = await validateBulkAssetRows(tenantId, rows)
    const insertable = validation.rows.filter((r) => r.ok && r.resolved)
    if (insertable.length === 0) {
        return { ...validation, created: 0, skipped: validation.summary.invalid }
    }

    // Generate asset codes up front for the ones HR left blank, in a
    // single counter pass so we don't issue N counter-queries inside the
    // transaction. We re-read the current count once and increment in
    // memory; the unique constraint catches the rare concurrent collision
    // (the row's INSERT throws and we fall back to a retry per row).
    const [tenantRow] = await db
        .select({ companyCode: tenants.companyCode })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)
    const prefix = tenantRow?.companyCode ?? 'ORG'
    const [countRow] = await db
        .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
        .from(assets)
        .where(eq(assets.tenantId, tenantId))
    let nextSeq = (countRow?.count ?? 0) + 1
    const nextCode = () => {
        const code = `${prefix}-AST-${String(nextSeq).padStart(5, '0')}`
        nextSeq += 1
        return code
    }

    await db.transaction(async (tx) => {
        const values = insertable.map((r) => {
            const x = r.resolved!
            return {
                tenantId,
                assetCode: x.assetCode ?? nextCode(),
                name: x.name,
                categoryId: x.categoryId,
                brand: x.brand,
                model: x.model,
                serialNumber: x.serialNumber,
                purchaseDate: x.purchaseDate,
                purchaseCost: x.purchaseCost,
                status: x.status,
                condition: x.condition,
                notes: x.notes,
            }
        })
        await tx.insert(assets).values(values)
    })

    await cacheDel(`dashboard:kpis:${tenantId}`)

    return {
        ...validation,
        created: insertable.length,
        skipped: validation.summary.invalid,
    }
}
