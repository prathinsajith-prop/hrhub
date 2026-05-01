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
} from './assets.service.js'
import { db } from '../../db/index.js'
import { employees, tenants } from '../../db/schema/index.js'
import { eq, and, sql } from 'drizzle-orm'
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
            limit?: string
            offset?: string
            after?: string
        }
        const result = await listAssets(request.user.tenantId, {
            status: qs.status,
            categoryId: qs.categoryId,
            search: qs.search,
            limit: Math.min(Number(qs.limit ?? 25), 100),
            offset: Number(qs.offset ?? 0),
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
        const { format = 'csv', status, categoryId } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const { data } = await listAssets(request.user.tenantId, { status, categoryId, limit: 10000, offset: 0 }) as any
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
}
