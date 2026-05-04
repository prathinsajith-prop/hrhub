import { db } from '../../db/index.js'
import { employeeWarnings, employees } from '../../db/schema/index.js'
import { eq, and, desc } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'
import { uploadObject, buildS3Key, generateDownloadUrl, deleteObject } from '../../plugins/s3.js'

const ALLOWED_MIME: Record<string, Buffer[]> = {
    'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])],
    'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
    'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [Buffer.from([0x50, 0x4B, 0x03, 0x04])],
}

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

    // POST /api/v1/employees/:id/warnings — multipart (file optional)
    fastify.post('/:id/warnings', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }

        const [emp] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)
        if (!emp) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        const parts = request.parts()
        const fields: Record<string, string> = {}
        let fileMeta: { fileName: string; s3Key: string } | null = null

        for await (const part of parts) {
            if (part.type === 'file') {
                const chunks: Buffer[] = []
                for await (const chunk of part.file) chunks.push(chunk as Buffer)
                const buffer = Buffer.concat(chunks)

                if (buffer.length === 0) continue

                const declared = part.mimetype || 'application/octet-stream'
                const signatures = ALLOWED_MIME[declared]
                if (!signatures) return reply.code(415).send({ statusCode: 415, error: 'Unsupported Media Type', message: `File type '${declared}' is not permitted.` })
                const matchesMagic = signatures.some(sig => buffer.slice(0, sig.length).equals(sig))
                if (!matchesMagic) return reply.code(415).send({ statusCode: 415, error: 'Unsupported Media Type', message: 'File content does not match its declared type.' })

                const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
                const s3Key = buildS3Key(request.user.tenantId, `employees/${id}/warnings`, safeName)
                try {
                    await uploadObject(s3Key, buffer, declared)
                } catch (err) {
                    request.log.error({ err }, 'S3 upload failed')
                    return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'File storage service is unavailable.' })
                }
                fileMeta = { fileName: part.filename, s3Key }
            } else {
                fields[part.fieldname] = part.value as string
            }
        }

        if (!fields.issueDate) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'issueDate is required' })

        const [row] = await db.insert(employeeWarnings).values({
            tenantId: request.user.tenantId,
            employeeId: id,
            issueDate: fields.issueDate,
            expiryDate: fields.expiryDate || null,
            reason: fields.reason?.trim() || null,
            documentS3Key: fileMeta?.s3Key ?? null,
            documentFileName: fileMeta?.fileName ?? null,
            createdById: request.user.id,
            createdByName: request.user.name,
        }).returning()

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id,
            actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: id, action: 'update',
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => {})

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
        const url = await generateDownloadUrl(row.documentS3Key)
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
        }).catch(() => {})

        return reply.code(204).send()
    })
}
