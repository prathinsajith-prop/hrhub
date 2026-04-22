import { listDocuments, getDocument, createDocument, updateDocument, verifyDocument, getExpiringDocuments, softDeleteDocument } from './documents.service.js'
import { generateUploadUrl, generateDownloadUrl, buildS3Key } from '../../plugins/s3.js'
import { templateRoutes } from './templates.routes.js'
import { recordActivity } from '../audit/audit.service.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // Register template routes as sub-plugin
    await fastify.register(templateRoutes)

    fastify.get('/', { ...auth, schema: { tags: ['Documents'] } }, async (request, reply) => {
        const { employeeId, category, status, limit = '20', offset = '0' } = request.query as Record<string, string>
        const result = await listDocuments(request.user.tenantId, { employeeId, category, status, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
    })

    fastify.get('/expiring', { ...auth, schema: { tags: ['Documents'] } }, async (request, reply) => {
        const { days = '90' } = request.query as { days?: string }
        const data = await getExpiringDocuments(request.user.tenantId, Number(days))
        return reply.send({ data })
    })

    fastify.get('/:id', { ...auth, schema: { tags: ['Documents'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const doc = await getDocument(request.user.tenantId, id)
        if (!doc) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Document not found' })
        return reply.send({ data: doc })
    })

    fastify.post('/', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Documents'],
            body: {
                type: 'object',
                required: ['category', 'docType', 'fileName'],
                properties: {
                    employeeId: { type: 'string', format: 'uuid' },
                    category: { type: 'string' },
                    docType: { type: 'string' },
                    fileName: { type: 'string' },
                    s3Key: { type: 'string' },
                    fileSize: { type: 'number' },
                    expiryDate: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const doc = await createDocument(request.user.tenantId, request.user.id, body as never)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'document',
            entityId: doc.id,
            entityName: doc.fileName ?? doc.docType,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: doc })
    })

    fastify.patch('/:id', { ...auth, schema: { tags: ['Documents'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await updateDocument(request.user.tenantId, id, request.body as never)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Document not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'document',
            entityId: id,
            entityName: updated.fileName ?? updated.docType,
            action: 'update',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    fastify.post('/:id/verify', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Documents'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await verifyDocument(request.user.tenantId, id, request.user.id)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Document not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'document',
            entityId: id,
            entityName: updated.fileName ?? updated.docType,
            action: 'approve',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Documents'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const deleted = await softDeleteDocument(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Document not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'document',
            entityId: id,
            action: 'delete',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    // POST /api/v1/documents/upload-url — generate presigned S3 PUT URL
    fastify.post('/upload-url', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Documents'] },
    }, async (request, reply) => {
        const { fileName, contentType, employeeId, category } = request.body as Record<string, string>
        if (!fileName || !contentType) {
            return reply.code(400).send({ message: 'fileName and contentType are required' })
        }
        const folder = employeeId ? `employees/${employeeId}/documents` : 'documents'
        const s3Key = buildS3Key(request.user.tenantId, folder, fileName)
        const uploadUrl = await generateUploadUrl(s3Key, contentType)
        return reply.send({ data: { uploadUrl, s3Key, category } })
    })

    // GET /api/v1/documents/:id/download-url — generate presigned S3 GET URL
    fastify.get('/:id/download-url', { ...auth, schema: { tags: ['Documents'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const doc = await getDocument(request.user.tenantId, id)
        if (!doc) return reply.code(404).send({ message: 'Document not found' })
        if (!doc.s3Key) return reply.code(400).send({ message: 'No file stored for this document' })
        const downloadUrl = await generateDownloadUrl(doc.s3Key)
        return reply.send({ data: { downloadUrl } })
    })
}

