import { listDocuments, getDocument, createDocument, updateDocument, verifyDocument, rejectDocument, getExpiringDocuments, softDeleteDocument } from './documents.service.js'
import { generateUploadUrl, generateDownloadUrl, buildS3Key, uploadObject, objectExists } from '../../plugins/s3.js'
import { fileTypeFromBuffer } from 'file-type'
import { e403 } from '../../lib/errors.js'
import { templateRoutes } from './templates.routes.js'
import { recordActivity } from '../audit/audit.service.js'
import { logDocumentAction, getDocumentAuditLog } from '../onboarding/onboarding.docs.service.js'
import { sendEmail, documentVerifiedEmail, documentRejectedEmail } from '../../plugins/email.js'
import { db } from '../../db/index.js'
import { employees, tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // Register template routes as sub-plugin
    await fastify.register(templateRoutes)

    fastify.get('/', { ...auth, schema: { tags: ['Documents'] } }, async (request, reply) => {
        const { employeeId, category, status, from, to, search, q, filter, limit = '20', offset = '0', after } = request.query as Record<string, string>
        if (filter && filter.length > 2000) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'filter param too long' })
        const isElevated = ['hr_manager', 'super_admin', 'pro_officer'].includes(request.user.role)
        const effectiveEmployeeId = isElevated ? employeeId : request.user.employeeId
        const result = await listDocuments(request.user.tenantId, { employeeId: effectiveEmployeeId, category, status, from, to, search: q || search || undefined, filter: filter || undefined, limit: Number(limit), offset: Number(offset), after })
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
        // Presigned-PUT flow: validate the supplied s3Key before creating the DB record.
        if (body.s3Key && typeof body.s3Key === 'string') {
            // Reject keys outside this tenant's prefix — prevents cross-tenant file access.
            if (!body.s3Key.startsWith(`tenants/${request.user.tenantId}/`)) {
                return reply.code(403).send(e403('The referenced file does not belong to your organization'))
            }
            const exists = await objectExists(body.s3Key)
            if (!exists) {
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'The referenced file was not found in storage. Please upload the file first.' })
            }
        }
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
        const b = request.body as Record<string, unknown>
        const updated = await updateDocument(request.user.tenantId, id, {
            ...(b.category !== undefined && { category: b.category as never }),
            ...(b.docType !== undefined && { docType: b.docType as string }),
            ...(b.fileName !== undefined && { fileName: b.fileName as string }),
            ...(b.expiryDate !== undefined && { expiryDate: b.expiryDate ? (b.expiryDate as string) : null }),
            ...(b.notes !== undefined && { notes: b.notes as string }),
            ...(b.status !== undefined && { status: b.status as never }),
        })
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
        await logDocumentAction({
            tenantId: request.user.tenantId,
            documentId: id,
            action: 'verified',
            actorId: request.user.id,
            actorLabel: request.user.name,
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'] as string | undefined,
        })
        // Notify employee (best-effort)
        if (updated.employeeId) {
            try {
                const [emp] = await db.select({ email: employees.email, firstName: employees.firstName, lastName: employees.lastName })
                    .from(employees).where(eq(employees.id, updated.employeeId)).limit(1)
                const [tn] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
                if (emp?.email) {
                    const opts = documentVerifiedEmail({
                        employeeName: [emp.firstName, emp.lastName].filter(Boolean).join(' ') || 'Employee',
                        docType: updated.docType ?? updated.fileName ?? 'Document',
                        verifiedBy: request.user.name ?? 'HR Team',
                        companyName: tn?.name ?? 'Your Company',
                    })
                    opts.to = emp.email
                    sendEmail(opts).catch((err: unknown) => request.log.warn({ err }, 'document verified email delivery failed'))
                }
            } catch (err) { request.log.warn({ err }, 'document verified: failed to load employee for email') }
        }
        return reply.send({ data: updated })
    })

    fastify.post('/:id/reject', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: {
            tags: ['Documents'],
            body: {
                type: 'object',
                required: ['reason'],
                properties: { reason: { type: 'string', minLength: 1, maxLength: 1000 } },
            },
        },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const { reason } = request.body as { reason: string }
        const updated = await rejectDocument(request.user.tenantId, id, request.user.id, reason)
        if (!updated) return reply.code(404).send({ message: 'Document not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'document',
            entityId: id,
            entityName: updated.fileName ?? updated.docType,
            action: 'reject',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        await logDocumentAction({
            tenantId: request.user.tenantId,
            documentId: id,
            action: 'rejected',
            actorId: request.user.id,
            actorLabel: request.user.name,
            details: { reason },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] as string | undefined,
        })
        if (updated.employeeId) {
            try {
                const [emp] = await db.select({ email: employees.email, firstName: employees.firstName, lastName: employees.lastName })
                    .from(employees).where(eq(employees.id, updated.employeeId)).limit(1)
                const [tn] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
                if (emp?.email) {
                    const opts = documentRejectedEmail({
                        employeeName: [emp.firstName, emp.lastName].filter(Boolean).join(' ') || 'Employee',
                        docType: updated.docType ?? updated.fileName ?? 'Document',
                        reason,
                        companyName: tn?.name ?? 'Your Company',
                    })
                    opts.to = emp.email
                    sendEmail(opts).catch((err: unknown) => request.log.warn({ err }, 'document rejected email delivery failed'))
                }
            } catch (err) { request.log.warn({ err }, 'document rejected: failed to load employee for email') }
        }
        return reply.send({ data: updated })
    })

    // GET /api/v1/documents/:id/audit-log
    fastify.get('/:id/audit-log', { ...auth, schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await getDocumentAuditLog(request.user.tenantId, id)
        return reply.send({ data })
    })

    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Documents'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const deleted = await softDeleteDocument(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Document not found' })
        await logDocumentAction({
            tenantId: request.user.tenantId,
            documentId: id,
            action: 'deleted',
            actorId: request.user.id,
            actorLabel: request.user.name,
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'] as string | undefined,
        })
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

    // POST /api/v1/documents/upload — multipart file upload (S3/MinIO only; no local fallback)
    fastify.post('/upload', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Documents'] },
    }, async (request: any, reply: any) => {
        const parts = request.parts()
        const fields: Record<string, string> = {}

        // Allowed MIME types (validated via file-type magic byte detection)
        const ALLOWED_MIMES = new Set([
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])

        // Collect all fields FIRST, then process the file — the browser sends the file
        // part before the other form fields, so fields.employeeId etc. are not yet
        // available when iterating the stream. We buffer the file and defer the S3
        // upload until after the entire multipart body has been consumed.
        let pendingFile: { buffer: Buffer; originalName: string } | null = null

        for await (const part of parts) {
            if (part.type === 'file') {
                const chunks: Buffer[] = []
                for await (const chunk of part.file) chunks.push(chunk as Buffer)
                pendingFile = { buffer: Buffer.concat(chunks), originalName: part.filename }
            } else {
                fields[part.fieldname] = part.value as string
            }
        }

        if (!pendingFile) return reply.code(400).send({ message: 'No file provided' })

        // Resolve MIME: prefer magic-byte detection; fall back to file extension for
        // ZIP-based Office formats (.docx/.xlsx) where file-type may return 'application/zip'.
        const EXT_MIME: Record<string, string> = {
            pdf: 'application/pdf',
            jpg: 'image/jpeg', jpeg: 'image/jpeg',
            png: 'image/png', gif: 'image/gif', webp: 'image/webp',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
        const detected = await fileTypeFromBuffer(pendingFile.buffer)
        const ext = pendingFile.originalName.split('.').pop()?.toLowerCase() ?? ''
        const mime = (detected?.mime && detected.mime !== 'application/zip')
            ? detected.mime
            : (EXT_MIME[ext] ?? 'application/octet-stream')
        if (!ALLOWED_MIMES.has(mime)) {
            return reply.code(415).send({ message: `File type not permitted. Please upload a PDF, image, Word, or Excel document.` })
        }

        const { employeeId, category, expiryDate, issueDate, notes, docType } = fields
        if (!category) return reply.code(400).send({ message: 'category is required' })

        const folder = employeeId ? `employees/${employeeId}/documents` : 'documents'
        const s3Key = buildS3Key(request.user.tenantId, folder, pendingFile.originalName)

        try {
            await uploadObject(s3Key, pendingFile.buffer, mime)
        } catch (err) {
            request.log.error({ err }, 'S3 upload failed')
            return reply.code(503).send({ message: 'File storage service is unavailable. Please try again later.' })
        }

        const fileMeta = { fileName: pendingFile.originalName, mime, s3Key, size: pendingFile.buffer.length }

        const doc = await createDocument(request.user.tenantId, request.user.id, {
            employeeId: employeeId || null,
            category: category as any,
            docType: docType || fileMeta.fileName,
            fileName: fileMeta.fileName,
            s3Key: fileMeta.s3Key,
            fileSize: fileMeta.size,
            issueDate: issueDate || null,
            expiryDate: expiryDate || null,
            notes: notes || null,
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

        await logDocumentAction({
            tenantId: request.user.tenantId,
            documentId: doc.id,
            action: 'uploaded',
            actorId: request.user.id,
            actorLabel: request.user.name,
            details: { stepId: null, category, docType: docType || fileMeta.fileName, fileName: fileMeta.fileName, sizeBytes: fileMeta.size, expiryDate: expiryDate || null },
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'] as string | undefined,
        })

        return reply.code(201).send({ data: doc })
    })

    // GET /api/v1/documents/:id/file?token=<jwt>
    // Auth via Bearer header OR short-lived token query param (for window.open).
    fastify.get('/:id/file', { schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        // Resolve auth: Bearer token or ?token=
        let claims!: { tenantId: string }
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

        if (doc.s3Key) {
            try {
                const downloadUrl = await generateDownloadUrl(doc.s3Key, 3600, doc.fileName)
                logDocumentAction({
                    tenantId: claims.tenantId,
                    documentId: id,
                    action: 'viewed',
                    actorId: (request as any).user?.id,
                    actorLabel: (request as any).user?.name ?? 'token_view',
                    ipAddress: (request as any).ip,
                    userAgent: request.headers['user-agent'] as string | undefined,
                }).catch(() => { })
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
        const ALLOWED_UPLOAD_TYPES = new Set([
            'application/pdf',
            'image/jpeg', 'image/png', 'image/webp',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])
        if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
            return reply.code(415).send({ statusCode: 415, error: 'Unsupported Media Type', message: `File type '${contentType}' is not permitted.` })
        }
        const folder = employeeId ? `employees/${employeeId}/documents` : 'documents'
        const s3Key = buildS3Key(request.user.tenantId, folder, fileName)
        if (!s3Key.startsWith(`tenants/${request.user.tenantId}/`)) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'File path does not belong to your organization' })
        }
        const uploadUrl = await generateUploadUrl(s3Key, contentType)
        return reply.send({ data: { uploadUrl, s3Key, category } })
    })

    // GET /api/v1/documents/:id/download-url
    fastify.get('/:id/download-url', { ...auth, schema: { tags: ['Documents'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const doc = await getDocument(request.user.tenantId, id)
        if (!doc) return reply.code(404).send({ message: 'Document not found' })
        if (!doc.s3Key) return reply.code(400).send({ message: 'No file stored for this document' })

        const downloadUrl = await generateDownloadUrl(doc.s3Key, 3600, doc.fileName)
        logDocumentAction({
            tenantId: request.user.tenantId,
            documentId: id,
            action: 'downloaded',
            actorId: request.user.id,
            actorLabel: request.user.name,
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'] as string | undefined,
        }).catch(() => { })
        return reply.send({ data: { downloadUrl } })
    })
}

