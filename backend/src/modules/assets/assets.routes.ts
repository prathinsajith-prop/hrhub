import * as XLSX from 'xlsx'
import { recordActivity } from '../audit/audit.service.js'
import {
    listAssets,
    getAsset,
    createAsset,
    updateAsset,
    softDeleteAsset,
    assignAsset,
    returnAsset,
    markAssetLost,
    getEmployeeAssets,
    getAssetAssignmentHistory,
    createMaintenanceRecord,
    updateMaintenanceRecord,
    listMaintenanceRecords,
    listCategories,
    createCategory,
    deleteCategory,
    validateBulkAssetRows,
    bulkCreateAssets,
    type BulkAssetInputRow,
} from './assets.service.js'
import { db } from '../../db/index.js'
import { employees, tenants, assetCategories } from '../../db/schema/index.js'
import { eq, and, sql, isNull } from 'drizzle-orm'
import { generateReportPdf } from '../../lib/pdf.js'

export default async function assetsRoutes(fastify: any): Promise<void> {
    // ─── Categories ──────────────────────────────────────────────────────────

    fastify.get('/categories', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const categories = await listCategories(request.user.tenantId)
        return reply.send({ data: categories })
    })

    fastify.post('/categories', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const body = request.body as { name: string; description?: string }
        const category = await createCategory(request.user.tenantId, body)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'asset_category',
            entityId: category.id,
            entityName: category.name,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: category })
    })

    fastify.delete('/categories/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await deleteCategory(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Category not found' })
        return reply.code(204).send()
    })

    // ─── List & Create Assets ─────────────────────────────────────────────────

    fastify.get('/', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const qs = request.query as {
            status?: string
            categoryId?: string
            search?: string
            filter?: string
            limit?: string
            offset?: string
            after?: string
        }
        const result = await listAssets(request.user.tenantId, {
            status: qs.status,
            categoryId: qs.categoryId,
            search: qs.search,
            filter: qs.filter,
            limit: Math.min(Math.max(1, Number(qs.limit ?? 25)), 100),
            offset: Math.max(0, Number(qs.offset ?? 0)),
            after: qs.after,
        })
        return reply.send(result)
    })

    fastify.post('/', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const asset = await createAsset(request.user.tenantId, body as never)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'asset',
            entityId: asset.id,
            entityName: asset.name,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: asset })
    })

    // ─── Employee Assets (must be before /:id) ────────────────────────────────

    fastify.get('/assignments/employee/:employeeId', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { employeeId } = request.params as { employeeId: string }
        const user = request.user

        // Elevated roles can see any employee's assets
        const isElevated = ['hr_manager', 'dept_head', 'super_admin'].includes(user.role)
        if (!isElevated) {
            // Employees can only see their own assets — match via email on employee record
            const [empRecord] = await db
                .select()
                .from(employees)
                .where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, employeeId), eq(sql`lower(${employees.email})`, user.email.toLowerCase())))
            if (!empRecord) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied' })
            }
        }

        const data = await getEmployeeAssets(user.tenantId, employeeId)
        return reply.send({ data })
    })

    // ─── Single Asset ─────────────────────────────────────────────────────────

    fastify.get('/:id', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const asset = await getAsset(request.user.tenantId, id)
        if (!asset) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Asset not found' })
        return reply.send({ data: asset })
    })

    fastify.patch('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const b = request.body as Record<string, unknown>
        const updated = await updateAsset(request.user.tenantId, id, {
            ...(b.name !== undefined && { name: b.name as string }),
            ...(b.assetCode !== undefined && { assetCode: b.assetCode as string }),
            ...(b.categoryId !== undefined && { categoryId: b.categoryId as string }),
            ...(b.brand !== undefined && { brand: b.brand as string }),
            ...(b.model !== undefined && { model: b.model as string }),
            ...(b.serialNumber !== undefined && { serialNumber: b.serialNumber as string }),
            ...(b.purchaseDate !== undefined && { purchaseDate: b.purchaseDate as string }),
            ...(b.purchaseCost !== undefined && { purchaseCost: b.purchaseCost as string }),
            ...(b.status !== undefined && { status: b.status as never }),
            ...(b.condition !== undefined && { condition: b.condition as never }),
            ...(b.notes !== undefined && { notes: b.notes as string }),
        })
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Asset not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'asset',
            entityId: updated.id,
            entityName: updated.name,
            action: 'update',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const deleted = await softDeleteAsset(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Asset not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'asset',
            entityId: deleted.id,
            entityName: deleted.name,
            action: 'delete',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    // ─── Assign Asset ─────────────────────────────────────────────────────────

    fastify.post('/:id/assign', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const body = request.body as {
            employeeId: string
            assignedDate?: string
            expectedReturnDate?: string
            notes?: string
        }

        const assignment = await assignAsset(request.user.tenantId, id, {
            employeeId: body.employeeId,
            assignedBy: request.user.id,
            assignedDate: body.assignedDate ?? new Date().toISOString().slice(0, 10),
            expectedReturnDate: body.expectedReturnDate,
            notes: body.notes,
        })

        // Fetch asset name for audit log
        const asset = await getAsset(request.user.tenantId, id)

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'asset_assignment',
            entityId: assignment.id,
            entityName: asset?.name ?? id,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        if (body.employeeId) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: body.employeeId,
                entityName: asset?.name ?? id,
                action: 'create',
                metadata: {
                    kind: 'asset',
                    subKind: 'assign',
                    assetId: id,
                    assetName: asset?.name ?? null,
                    assignmentId: assignment.id,
                    assignedDate: body.assignedDate ?? null,
                    expectedReturnDate: body.expectedReturnDate ?? null,
                },
                ipAddress: (request as any).ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }

        return reply.code(201).send({ data: assignment })
    })

    // ─── Return Asset ─────────────────────────────────────────────────────────

    fastify.post('/assignments/:assignmentId/return', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { assignmentId } = request.params as { assignmentId: string }
        const body = request.body as { actualReturnDate?: string; notes?: string }

        const updated = await returnAsset(request.user.tenantId, assignmentId, body)
        const returnAssetName = updated.assetId ? (await getAsset(request.user.tenantId, updated.assetId))?.name ?? null : null

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'asset_assignment',
            entityId: updated.id,
            entityName: returnAssetName ?? updated.assetId,
            action: 'update',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        if ((updated as any).employeeId) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: (updated as any).employeeId,
                entityName: returnAssetName ?? updated.assetId,
                action: 'update',
                metadata: {
                    kind: 'asset',
                    subKind: 'return',
                    assignmentId,
                    assetId: updated.assetId,
                    actualReturnDate: body.actualReturnDate ?? null,
                },
                ipAddress: (request as any).ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }

        return reply.send({ data: updated })
    })

    // ─── Mark Lost ────────────────────────────────────────────────────────────

    fastify.post('/assignments/:assignmentId/lost', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { assignmentId } = request.params as { assignmentId: string }
        const updated = await markAssetLost(request.user.tenantId, assignmentId)

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'asset_assignment',
            entityId: updated.id,
            entityName: updated.assetId,
            action: 'update',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.send({ data: updated })
    })

    // ─── Assignment History ───────────────────────────────────────────────────

    fastify.get('/:id/history', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const history = await getAssetAssignmentHistory(request.user.tenantId, id)
        return reply.send({ data: history })
    })

    // ─── Maintenance ──────────────────────────────────────────────────────────

    fastify.get('/:id/maintenance', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const records = await listMaintenanceRecords(request.user.tenantId, id)
        return reply.send({ data: records })
    })

    fastify.post('/:id/maintenance', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const body = request.body as { issueDescription: string; notes?: string }

        const record = await createMaintenanceRecord(request.user.tenantId, id, {
            reportedBy: request.user.id,
            issueDescription: body.issueDescription,
            notes: body.notes,
        })

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'asset_maintenance',
            entityId: record.id,
            entityName: id,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.code(201).send({ data: record })
    })

    fastify.patch('/maintenance/:maintenanceId', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request, reply) => {
        const { maintenanceId } = request.params as { maintenanceId: string }
        const body = request.body as { status?: 'open' | 'in_progress' | 'resolved'; cost?: string; notes?: string }

        const updated = await updateMaintenanceRecord(request.user.tenantId, maintenanceId, body)

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'asset_maintenance',
            entityId: updated.id,
            entityName: updated.assetId,
            action: 'update',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.send({ data: updated })
    })

    // GET /api/v1/assets/export?format=csv|pdf
    fastify.get('/export', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Assets'] },
    }, async (request: any, reply: any) => {
        const { format = 'csv', status, categoryId, filter } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const { data } = await listAssets(request.user.tenantId, { status, categoryId, filter, limit: 10000, offset: 0 }) as any
        const rows = (data ?? []) as any[]
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Asset Inventory Report',
                companyName: tenantRow?.name ?? '',
                columns: [
                    { header: 'Asset Code', key: 'assetCode', width: 90 },
                    { header: 'Name', key: 'name', width: 130 },
                    { header: 'Category', key: 'categoryName', width: 90 },
                    { header: 'Serial No', key: 'serialNumber', width: 100 },
                    { header: 'Status', key: 'status', width: 70 },
                    { header: 'Assigned To', key: 'assignedToName', width: 120 },
                    { header: 'Purchase Value', key: 'purchaseValue', width: 90, align: 'right', currency: true },
                    { header: 'Purchase Date', key: 'purchaseDate' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="assets-report-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Asset Code', 'Name', 'Category', 'Serial No', 'Status', 'Assigned To', 'Purchase Value (AED)', 'Purchase Date']
        const lines = [headers.join(',')]
        for (const r of rows) {
            lines.push([r.assetCode, r.name, r.categoryName ?? '', r.serialNumber ?? '', r.status, r.assignedToName ?? '', r.purchaseValue ?? '', r.purchaseDate ?? ''].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="assets-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })

    // ─── Bulk import ─────────────────────────────────────────────────────────
    //
    // Three-step UX (mirrors the payroll bulk-adjustment dialog):
    //   1. GET  /bulk-template      → HR downloads an .xlsx with the column
    //                                 contract + (optionally) the tenant's
    //                                 categories listed in a separate sheet.
    //   2. POST /bulk-validate      → HR uploads the file, the parser sends
    //                                 normalized rows, the server returns a
    //                                 per-row preview (green / red) WITHOUT
    //                                 writing anything.
    //   3. POST /bulk               → only after the preview looks good, HR
    //                                 commits. The server re-runs validation
    //                                 and inserts all good rows in a single
    //                                 transaction.
    // Skipping step 2 is allowed but the UI calls it before enabling Save.

    const hrOnlyAssets = {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }

    // GET /bulk-template — download a starter .xlsx.
    //
    // Sheet 1 ("Assets"): the column contract + one synthetic example row
    // showing the expected shape (status / condition come from the enums
    // listed in the schema). HR types over the example with their real
    // assets.
    // Sheet 2 ("Categories"): a read-only reference of the tenant's
    // category names. The `category_name` column on sheet 1 has to match
    // one of these exactly (case-insensitive) — listing them here saves a
    // tab-out to the Categories page.
    fastify.get('/bulk-template', { ...hrOnlyAssets, schema: { tags: ['Assets'] } }, async (request: any, reply: any) => {
        const header = [
            'asset_code',
            'name',
            'category_name',
            'brand',
            'model',
            'serial_number',
            'purchase_date',
            'purchase_cost',
            'status',
            'condition',
            'notes',
        ]
        // Example row makes the column shape obvious without forcing HR to
        // hunt for docs. The category_name field intentionally references
        // a value that might not exist in this tenant — the validator will
        // flag it so HR sees that lookups happen against their own list.
        const sample = [
            '',                              // assetCode auto-generated when blank
            'MacBook Pro 14"',
            'Laptops',
            'Apple',
            'M3 Pro',
            'C02XXXXXXXXX',
            '2024-01-15',
            8500,
            'available',
            'new',
            'Issued to new hire',
        ]
        const wb = XLSX.utils.book_new()

        const assetSheet = XLSX.utils.aoa_to_sheet([header, sample])
        assetSheet['!cols'] = [
            { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
            { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 32 },
        ]
        XLSX.utils.book_append_sheet(wb, assetSheet, 'Assets')

        // Categories reference sheet — tenant-scoped.
        const cats = await db
            .select({ name: assetCategories.name })
            .from(assetCategories)
            .where(and(eq(assetCategories.tenantId, request.user.tenantId), isNull(assetCategories.deletedAt)))
            .orderBy(assetCategories.name)
        const catSheet = XLSX.utils.aoa_to_sheet([
            ['Available category names — use one of these exactly (case-insensitive) in the category_name column.'],
            [],
            ...cats.map((c) => [c.name]),
            ...(cats.length === 0
                ? [['(No categories yet — create them under Assets → Categories first, or leave the column blank.)']]
                : []),
        ])
        catSheet['!cols'] = [{ wch: 80 }]
        XLSX.utils.book_append_sheet(wb, catSheet, 'Categories')

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', `attachment; filename="assets-bulk-template.xlsx"`)
            .send(buf)
    })

    // POST /bulk-validate — preview without persisting. Body: { rows: [...] }.
    // Cap matches payroll's bulk-validate ceiling so HR can't accidentally
    // hammer the server with a 10 000-row sheet.
    fastify.post('/bulk-validate', { ...hrOnlyAssets, schema: { tags: ['Assets'] } }, async (request: any, reply: any) => {
        const body = request.body as Record<string, unknown>
        const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : []
        if (rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must contain at least one entry' })
        }
        if (rows.length > 500) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'maximum 500 rows per import' })
        }
        const normalized: BulkAssetInputRow[] = rows.map((r, i) => ({
            rowNumber: Number(r.rowNumber) || i + 1,
            assetCode: r.assetCode != null ? String(r.assetCode) : null,
            name: r.name != null ? String(r.name) : null,
            categoryName: r.categoryName != null ? String(r.categoryName) : null,
            brand: r.brand != null ? String(r.brand) : null,
            model: r.model != null ? String(r.model) : null,
            serialNumber: r.serialNumber != null ? String(r.serialNumber) : null,
            purchaseDate: r.purchaseDate != null ? String(r.purchaseDate) : null,
            purchaseCost: (r.purchaseCost as number | string | null | undefined) ?? null,
            status: r.status != null ? String(r.status) : null,
            condition: r.condition != null ? String(r.condition) : null,
            notes: r.notes != null ? String(r.notes) : null,
        }))
        const result = await validateBulkAssetRows(request.user.tenantId, normalized)
        return reply.send(result)
    })

    // POST /bulk — commit. Same row shape as /bulk-validate. Re-validates
    // server-side, drops invalid rows silently (the UI told HR about them
    // in step 2), inserts valid rows in one transaction, and posts a single
    // audit event capturing the batch size.
    fastify.post('/bulk', { ...hrOnlyAssets, schema: { tags: ['Assets'] } }, async (request: any, reply: any) => {
        const body = request.body as Record<string, unknown>
        const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : []
        if (rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must contain at least one entry' })
        }
        if (rows.length > 500) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'maximum 500 rows per import' })
        }
        const normalized: BulkAssetInputRow[] = rows.map((r, i) => ({
            rowNumber: Number(r.rowNumber) || i + 1,
            assetCode: r.assetCode != null ? String(r.assetCode) : null,
            name: r.name != null ? String(r.name) : null,
            categoryName: r.categoryName != null ? String(r.categoryName) : null,
            brand: r.brand != null ? String(r.brand) : null,
            model: r.model != null ? String(r.model) : null,
            serialNumber: r.serialNumber != null ? String(r.serialNumber) : null,
            purchaseDate: r.purchaseDate != null ? String(r.purchaseDate) : null,
            purchaseCost: (r.purchaseCost as number | string | null | undefined) ?? null,
            status: r.status != null ? String(r.status) : null,
            condition: r.condition != null ? String(r.condition) : null,
            notes: r.notes != null ? String(r.notes) : null,
        }))
        const result = await bulkCreateAssets(request.user.tenantId, normalized)
        if (result.created > 0) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'asset',
                entityId: null,
                entityName: `bulk import: ${result.created} asset(s)`,
                action: 'create',
                ipAddress: (request as any).ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.code(201).send(result)
    })
}
