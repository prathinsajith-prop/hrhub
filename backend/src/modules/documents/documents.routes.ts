import { listDocuments, getDocument, createDocument, updateDocument, verifyDocument, getExpiringDocuments, softDeleteDocument } from './documents.service.js'
import { generateUploadUrl, generateDownloadUrl, buildS3Key, uploadObject } from '../../plugins/s3.js'
import { templateRoutes } from './templates.routes.js'
import { recordActivity } from '../audit/audit.service.js'
import { createWriteStream, existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { pipeline } from 'stream/promises'
import { createReadStream } from 'fs'
import { randomUUID } from 'crypto'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // Register template routes as sub-plugin
    await fastify.register(templateRoutes)

    fastify.get('/', { ...auth, schema: { tags: ['Documents'] } }, async (request, reply) => {
        const { employeeId, category, status, limit = '20', offset = '0', after } = request.query as Record<string, string>
        const result = await listDocuments(request.user.tenantId, { employeeId, category, status, limit: Number(limit), offset: Number(offset), after })
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

    // POST /api/v1/documents/upload — multipart file upload (uploads to S3/MinIO; falls back to local disk)
    fastify.post('/upload', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Documents'] },
    }, async (request: any, reply: any) => {
        const parts = request.parts()
        let fileMeta: { fileName: string; mime: string; s3Key: string; size: number } | null = null
        const fields: Record<string, string> = {}

        for await (const part of parts) {
            if (part.type === 'file') {
                // Buffer the stream so we can both upload to S3 and know the size
                const chunks: Buffer[] = []
                for await (const chunk of part.file) chunks.push(chunk as Buffer)
                const buffer = Buffer.concat(chunks)
                const ext = extname(part.filename) || ''
                const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
                const s3Key = buildS3Key(request.user.tenantId, fields.employeeId ? `employees/${fields.employeeId}/documents` : 'documents', safeName)
                const mime = part.mimetype || 'application/octet-stream'

                // Try S3/MinIO first; on failure fall back to local disk for resilience.
                let storedKey = s3Key
                try {
                    await uploadObject(s3Key, buffer, mime)
                } catch (err) {
                    request.log.warn({ err }, 'S3 upload failed; falling back to local disk')
                    const uploadsDir = join(new URL('../../../../uploads', import.meta.url).pathname)
                    if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true })
                    const savedName = `${randomUUID()}${ext}`
                    const filePath = join(uploadsDir, savedName)
                    await pipeline(
                        // re-stream the buffer
                        (function* () { yield buffer })(),
                        createWriteStream(filePath),
                    )
                    storedKey = `local://${savedName}`
                }

                fileMeta = { fileName: part.filename, mime, s3Key: storedKey, size: buffer.length }
            } else {
                fields[part.fieldname] = part.value as string
            }
        }

        if (!fileMeta) return reply.code(400).send({ message: 'No file provided' })

        const { employeeId, category, expiryDate, docType } = fields
        if (!category) return reply.code(400).send({ message: 'category is required' })

        const doc = await createDocument(request.user.tenantId, request.user.id, {
            employeeId: employeeId || null,
            category: category as any,
            docType: docType || fileMeta.fileName,
            fileName: fileMeta.fileName,
            s3Key: fileMeta.s3Key,
            fileSize: fileMeta.size,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            status: 'under_review' as any,
        } as any)

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

    // GET /api/v1/documents/:id/file?token=<jwt>
    // Auth via Bearer header OR short-lived token query param (for window.open).
    fastify.get('/:id/file', { schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        // Resolve auth: Bearer token or ?token=
        let claims: { tenantId: string } | null = null
        try {
            if (request.headers.authorization?.startsWith('Bearer ')) {
                await request.jwtVerify()
                claims = { tenantId: request.user.tenantId }
            } else {
                const token = (request.query as any)?.token as string | undefined
                if (!token) return reply.code(401).send({ message: 'Unauthorized' })
                const decoded = (fastify as any).jwt.verify(token) as { tenantId: string; docId: string }
                if (decoded.docId !== request.params.id) return reply.code(403).send({ message: 'Token mismatch' })
                claims = { tenantId: decoded.tenantId }
            }
        } catch {
            return reply.code(401).send({ message: 'Unauthorized' })
        }

        const { id } = request.params as { id: string }
        const doc = await getDocument(claims.tenantId, id)
        if (!doc) return reply.code(404).send({ message: 'Document not found' })

        if (doc.s3Key?.startsWith('local://')) {
            const savedName = doc.s3Key.replace('local://', '')
            const uploadsDir = join(new URL('../../../../uploads', import.meta.url).pathname)
            const filePath = join(uploadsDir, savedName)
            if (!existsSync(filePath)) return reply.code(404).send({ message: 'File not found on server' })
            const ext = extname(doc.fileName ?? savedName).toLowerCase()
            const mimeMap: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }
            const mime = mimeMap[ext] ?? 'application/octet-stream'
            reply.header('Content-Type', mime)
            reply.header('Content-Disposition', `inline; filename="${doc.fileName ?? savedName}"`)
            return reply.send(createReadStream(filePath))
        }

        if (doc.s3Key) {
            try {
                const downloadUrl = await generateDownloadUrl(doc.s3Key)
                return reply.redirect(302, downloadUrl)
            } catch {
                return reply.code(500).send({ message: 'Could not generate download URL' })
            }
        }

        return reply.code(400).send({ message: 'No file stored for this document' })
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

    // GET /api/v1/documents/:id/download-url — returns a URL the browser can open directly.
    // For S3/MinIO objects we issue a presigned URL; for legacy local:// files we issue a
    // short-lived JWT-protected backend URL (so window.open without auth headers still works).
    fastify.get('/:id/download-url', { ...auth, schema: { tags: ['Documents'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const doc = await getDocument(request.user.tenantId, id)
        if (!doc) return reply.code(404).send({ message: 'Document not found' })
        if (!doc.s3Key) return reply.code(400).send({ message: 'No file stored for this document' })

        if (doc.s3Key.startsWith('local://')) {
            const token = (fastify as any).jwt.sign(
                { docId: id, tenantId: request.user.tenantId, scope: 'doc-download' },
                { expiresIn: '5m' },
            )
            return reply.send({ data: { downloadUrl: `/api/v1/documents/${id}/file?token=${encodeURIComponent(token)}` } })
        }

        const downloadUrl = await generateDownloadUrl(doc.s3Key)
        return reply.send({ data: { downloadUrl } })
    })
}

