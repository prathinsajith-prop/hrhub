import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { randomUUID } from 'crypto'
import { listDocuments, getDocument, createDocument, updateDocument, verifyDocument, getExpiringDocuments, softDeleteDocument } from './documents.service.js'

export default async function(fastify: any): Promise<void> {
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

    // POST /api/v1/documents/upload — multipart file upload
    fastify.post('/upload', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Documents'] },
    }, async (request, reply) => {
        const uploadsDir = join(process.cwd(), 'uploads')
        if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true })

        const parts = request.parts()
        let fileBuffer: Buffer | null = null
        let originalName = 'document'
        const fields: Record<string, string> = {}

        for await (const part of parts) {
            if (part.type === 'file') {
                originalName = part.filename ?? 'document'
                const chunks: Buffer[] = []
                for await (const chunk of part.file) {
                    chunks.push(chunk as Buffer)
                }
                fileBuffer = Buffer.concat(chunks)
            } else {
                fields[part.fieldname] = part.value as string
            }
        }

        if (!fileBuffer) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No file uploaded' })
        }

        // Save file with a unique name to prevent collisions
        const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin'
        const storedName = `${randomUUID()}.${ext}`
        const filePath = join(uploadsDir, storedName)
        await pipeline(
            (async function* () { yield fileBuffer! })(),
            createWriteStream(filePath),
        )

        const doc = await createDocument(request.user.tenantId, request.user.id, {
            category: (fields.category ?? 'employment') as any,
            docType: fields.docType ?? originalName,
            fileName: originalName,
            s3Key: `/uploads/${storedName}`,
            fileSize: fileBuffer.byteLength,
            expiryDate: fields.expiryDate ?? null,
            employeeId: fields.employeeId ?? null,
            status: 'under_review',
        } as any)

        return reply.code(201).send({ data: doc })
    })
}

