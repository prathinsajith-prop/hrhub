// @ts-nocheck
import type { FastifyPluginAsync } from 'fastify/types/plugin.js'
import { listDocuments, getDocument, createDocument, updateDocument, verifyDocument, getExpiringDocuments, softDeleteDocument } from './documents.service.js'

const documentsRoutes: FastifyPluginAsync = async (fastify) => {
    const auth = { preHandler: [fastify.authenticate] }

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
        return reply.code(201).send({ data: doc })
    })

    fastify.patch('/:id', { ...auth, schema: { tags: ['Documents'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await updateDocument(request.user.tenantId, id, request.body as never)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Document not found' })
        return reply.send({ data: updated })
    })

    fastify.post('/:id/verify', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Documents'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await verifyDocument(request.user.tenantId, id, request.user.id)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Document not found' })
        return reply.send({ data: updated })
    })

    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Documents'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const deleted = await softDeleteDocument(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Document not found' })
        return reply.code(204).send()
    })
}

export default documentsRoutes
