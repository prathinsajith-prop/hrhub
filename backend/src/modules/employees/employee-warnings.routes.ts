import { db } from '../../db/index.js'
import { employeeWarnings, employees } from '../../db/schema/index.js'
import { eq, and, desc } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'
import { generateUploadUrl, buildS3Key, generateDownloadUrl, deleteObject } from '../../plugins/s3.js'
import { z } from 'zod'

const ALLOWED_CONTENT_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const uploadUrlSchema = z.object({
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1),
})

const createWarningSchema = z.object({
    issueDate: z.string().min(1),
    expiryDate: z.string().optional().nullable(),
    reason: z.string().optional().nullable(),
    s3Key: z.string().optional().nullable(),
    fileName: z.string().optional().nullable(),
})

export default async function employeeWarningsRoutes(fastify: any): Promise<void> {
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/employees/:id/warnings
    fastify.get('/:id/warnings', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const rows = await db
            .select()
            .from(employeeWarnings)
            .where(and(
                eq(employeeWarnings.employeeId, id),
                eq(employeeWarnings.tenantId, request.user.tenantId),
            ))
            .orderBy(desc(employeeWarnings.createdAt))
        return reply.send({ data: rows })
    })

    // POST /api/v1/employees/:id/warnings/upload-url — get presigned S3 URL for attachment
    fastify.post('/:id/warnings/upload-url', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }

        const parse = uploadUrlSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const { fileName, contentType } = parse.data

        if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
            return reply.code(415).send({ statusCode: 415, error: 'Unsupported Media Type', message: `File type '${contentType}' is not permitted.` })
        }

        const [emp] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)
        if (!emp) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
        const s3Key = buildS3Key(request.user.tenantId, `employees/${id}/warnings`, safeName)
        const uploadUrl = await generateUploadUrl(s3Key, contentType)

        return reply.send({ data: { uploadUrl, s3Key, fileName } })
    })

    // POST /api/v1/employees/:id/warnings — create warning with optional pre-uploaded attachment
    fastify.post('/:id/warnings', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }

        const parse = createWarningSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const body = parse.data

        if (body.s3Key && !body.s3Key.startsWith(`tenants/${request.user.tenantId}/`)) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'The referenced file does not belong to your organization' })
        }

        const [emp] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)
        if (!emp) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        const [row] = await db.insert(employeeWarnings).values({
            tenantId: request.user.tenantId,
            employeeId: id,
            issueDate: body.issueDate,
            expiryDate: body.expiryDate ?? null,
            reason: body.reason?.trim() ?? null,
            documentS3Key: body.s3Key ?? null,
            documentFileName: body.fileName ?? null,
            createdById: request.user.id,
            createdByName: request.user.name,
        }).returning()

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id,
            actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: id, action: 'update',
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.code(201).send({ data: row })
    })

    // GET /api/v1/employees/:id/warnings/:warnId/download — presigned URL for attachment
    fastify.get('/:id/warnings/:warnId/download', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id, warnId } = request.params as { id: string; warnId: string }
        const [row] = await db
            .select({ documentS3Key: employeeWarnings.documentS3Key, documentFileName: employeeWarnings.documentFileName })
            .from(employeeWarnings)
            .where(and(
                eq(employeeWarnings.id, warnId),
                eq(employeeWarnings.employeeId, id),
                eq(employeeWarnings.tenantId, request.user.tenantId),
            ))
            .limit(1)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Warning not found' })
        if (!row.documentS3Key) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'No document attached' })
        const url = await generateDownloadUrl(row.documentS3Key, 3600, row.documentFileName ?? undefined)
        return reply.send({ url, fileName: row.documentFileName })
    })

    // DELETE /api/v1/employees/:id/warnings/:warnId
    fastify.delete('/:id/warnings/:warnId', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id, warnId } = request.params as { id: string; warnId: string }
        const [row] = await db
            .delete(employeeWarnings)
            .where(and(
                eq(employeeWarnings.id, warnId),
                eq(employeeWarnings.employeeId, id),
                eq(employeeWarnings.tenantId, request.user.tenantId),
            ))
            .returning()
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Warning not found' })

        if (row.documentS3Key) {
            deleteObject(row.documentS3Key).catch(() => {})
        }

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id,
            actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: id, action: 'update',
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.code(204).send()
    })
}
