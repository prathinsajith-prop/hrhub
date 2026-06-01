import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { documents, employees, orgUnits } from '../../db/schema/index.js'
import { e400, e403, e404 } from '../../lib/errors.js'
import { buildS3Key, generateDownloadUrl, generateUploadUrl, objectExists, uploadObject } from '../../lib/s3.js'
import { parseUuidParam } from '../../lib/validation.js'
import { recordActivity } from '../../lib/audit.js'
import { notifyRequester, notifyReviewers } from '../../lib/notify.js'
import { canAccessEmployee, isDeptHead, isElevated, resolveAllowedEmployeeIds } from '../../lib/scoping.js'

const ALLOWED_UPLOAD_TYPES = new Set([
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const ALLOWED_CATEGORIES = new Set([
    'identity', 'visa', 'company', 'employment', 'insurance', 'qualification', 'financial', 'compliance',
])

/**
 * Derive a UI-friendly status from the persisted status + expiryDate. The
 * documents.status column is set at write time, so it doesn't catch rows
 * that have aged into "expiring_soon" or "expired" since then. We compute
 * those on the read path so the badge always reflects today.
 */
function deriveStatus(
    status: string,
    expiryDate: string | null,
): 'valid' | 'expiring_soon' | 'expired' | 'pending_upload' | 'under_review' | 'rejected' {
    if (status === 'under_review' || status === 'pending_upload' || status === 'rejected') {
        return status as 'under_review' | 'pending_upload' | 'rejected'
    }
    if (!expiryDate) return 'valid'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const exp = new Date(expiryDate)
    const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
    if (days < 0) return 'expired'
    if (days <= 30) return 'expiring_soon'
    return 'valid'
}

export default async function documentsRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/documents/my — every document the current employee owns
    fastify.get('/my', { ...auth }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.send({ data: [] })

        const rows = await db
            .select({
                id: documents.id,
                category: documents.category,
                docType: documents.docType,
                fileName: documents.fileName,
                fileSize: documents.fileSize,
                docNumber: documents.docNumber,
                issueDate: documents.issueDate,
                expiryDate: documents.expiryDate,
                notes: documents.notes,
                status: documents.status,
                verified: documents.verified,
                verifiedAt: documents.verifiedAt,
                rejectionReason: documents.rejectionReason,
                hasFile: documents.s3Key,
                createdAt: documents.createdAt,
            })
            .from(documents)
            .where(
                and(
                    eq(documents.tenantId, tenantId),
                    eq(documents.employeeId, employeeId),
                    isNull(documents.deletedAt),
                ),
            )
            .orderBy(desc(documents.createdAt))

        const data = rows.map(({ hasFile, status, expiryDate, ...rest }) => ({
            ...rest,
            status: deriveStatus(status, expiryDate),
            expiryDate,
            hasFile: !!hasFile,
        }))
        return reply.send({ data })
    })

    // GET /api/v1/documents/pending — manager's queue of docs awaiting their approval.
    // Returns under_review docs belonging to anyone in the dept_head's reporting subtree.
    fastify.get('/pending', { ...auth }, async (request: any, reply: any) => {
        const user = request.user
        if (!isDeptHead(user) && !isElevated(user)) return reply.send({ data: [] })

        const allowed = await resolveAllowedEmployeeIds(user, request)
        // null = elevated (HR/super_admin) — no employee restriction
        // [] = no team
        if (allowed && allowed.length === 0) return reply.send({ data: [] })

        const employeeFilter = allowed
            ? inArray(documents.employeeId, allowed)
            : sql`${documents.employeeId} IS NOT NULL`

        const rows = await db
            .select({
                id: documents.id,
                category: documents.category,
                docType: documents.docType,
                fileName: documents.fileName,
                fileSize: documents.fileSize,
                expiryDate: documents.expiryDate,
                notes: documents.notes,
                status: documents.status,
                createdAt: documents.createdAt,
                hasFile: documents.s3Key,
                employeeId: documents.employeeId,
                employeeName: sql<string | null>`${employees.firstName} || ' ' || ${employees.lastName}`,
                employeeNo: employees.employeeNo,
                // Resolve via org_units FK (consistent with /employees/*).
                employeeDepartment: sql<string | null>`COALESCE(${orgUnits.name}, ${employees.department})`,
            })
            .from(documents)
            .leftJoin(employees, and(
                eq(employees.id, documents.employeeId),
                eq(employees.tenantId, user.tenantId),
            ))
            .leftJoin(orgUnits, and(
                eq(employees.departmentId, orgUnits.id),
                eq(orgUnits.tenantId, user.tenantId),
            ))
            .where(
                and(
                    eq(documents.tenantId, user.tenantId),
                    isNull(documents.deletedAt),
                    eq(documents.status, 'under_review'),
                    employeeFilter,
                ),
            )
            .orderBy(desc(documents.createdAt))

        const data = rows.map(({ hasFile, ...rest }) => ({ ...rest, hasFile: !!hasFile }))
        return reply.send({ data })
    })

    // POST /api/v1/documents/upload-url — presigned PUT URL for the file
    fastify.post('/upload-url', { ...auth }, async (request: any, reply: any) => {
        const { fileName, contentType } = (request.body ?? {}) as { fileName?: string; contentType?: string }
        if (!fileName || !contentType) return reply.code(400).send(e400('fileName and contentType are required'))
        if (!ALLOWED_UPLOAD_TYPES.has(contentType)) {
            return reply
                .code(415)
                .send({ statusCode: 415, error: 'Unsupported Media Type', message: `File type '${contentType}' is not permitted.` })
        }
        const { tenantId, employeeId } = request.user
        if (!employeeId) return reply.code(400).send(e400('No employee record linked to this account'))

        const s3Key = buildS3Key(tenantId, `employees/${employeeId}/documents`, fileName)
        const uploadUrl = await generateUploadUrl(s3Key, contentType)
        return reply.send({ data: { uploadUrl, s3Key } })
    })

    // POST /api/v1/documents/upload — single-request multipart upload. The
    // browser sends the file + metadata as multipart/form-data to THIS backend,
    // which streams it to S3 server-side and registers the document. This avoids
    // a browser→S3 direct PUT, which would require the bucket's CORS policy to
    // allow the portal origin (it currently doesn't). Mirrors the main backend.
    fastify.post('/upload', { ...auth }, async (request: any, reply: any) => {
        const { tenantId, employeeId } = request.user
        if (!employeeId) return reply.code(400).send(e400('No employee record linked to this account'))

        // Buffer the file and collect fields. The file part may arrive before the
        // other fields, so we read everything before processing.
        const fields: Record<string, string> = {}
        let pending: { buffer: Buffer; originalName: string; mimetype: string } | null = null
        for await (const part of (request as any).parts()) {
            if (part.type === 'file') {
                const chunks: Buffer[] = []
                for await (const chunk of part.file) chunks.push(chunk as Buffer)
                if (part.file.truncated) {
                    return reply.code(413).send({ statusCode: 413, error: 'Payload Too Large', message: 'File exceeds the 10 MB limit.' })
                }
                pending = { buffer: Buffer.concat(chunks), originalName: part.filename, mimetype: part.mimetype }
            } else {
                fields[part.fieldname] = part.value as string
            }
        }
        if (!pending) return reply.code(400).send(e400('No file provided'))

        // Trust the browser-sent MIME, falling back to the file extension for
        // Office formats some browsers report as application/octet-stream.
        const EXT_MIME: Record<string, string> = {
            pdf: 'application/pdf',
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
        const ext = pending.originalName.split('.').pop()?.toLowerCase() ?? ''
        const mime = ALLOWED_UPLOAD_TYPES.has(pending.mimetype) ? pending.mimetype : (EXT_MIME[ext] ?? pending.mimetype)
        if (!ALLOWED_UPLOAD_TYPES.has(mime)) {
            return reply.code(415).send({ statusCode: 415, error: 'Unsupported Media Type', message: `File type '${mime}' is not permitted.` })
        }

        const category = String(fields.category ?? '')
        const docType = String(fields.docType ?? '').trim()
        const fileName = pending.originalName
        const docNumber = fields.docNumber ? String(fields.docNumber).trim() : null
        const issueDate = fields.issueDate ? String(fields.issueDate) : null
        const expiryDate = fields.expiryDate ? String(fields.expiryDate) : null
        const notes = fields.notes ? String(fields.notes) : null

        if (!ALLOWED_CATEGORIES.has(category)) return reply.code(400).send(e400('Invalid category'))
        if (!docType) return reply.code(400).send(e400('docType is required'))

        const s3Key = buildS3Key(tenantId, `employees/${employeeId}/documents`, fileName)
        try {
            await uploadObject(s3Key, pending.buffer, mime)
        } catch (err) {
            request.log?.error?.({ err }, 'S3 upload failed')
            return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'File storage service is unavailable. Please try again later.' })
        }

        const [doc] = await db
            .insert(documents)
            .values({
                tenantId,
                employeeId,
                category: category as any,
                docType,
                fileName,
                s3Key,
                fileSize: pending.buffer.length,
                docNumber,
                issueDate,
                expiryDate,
                notes,
                status: 'under_review',
                uploadedBy: request.user.id,
            })
            .returning()

        recordActivity({
            tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'document',
            entityId: doc.id,
            entityName: doc.docType,
            action: 'submit',
            metadata: { category, docType, pendingApproval: true },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        notifyReviewers({
            tenantId,
            actorEmployeeId: employeeId,
            title: `${request.user.name ?? 'An employee'} uploaded "${docType}"`,
            message: 'New document pending verification',
            actionUrl: `/employees/${employeeId}?tab=documents&review=${doc.id}`,
        }).catch((err) => request.log?.warn?.({ err }, 'document submit notification failed'))

        return reply.code(201).send({ data: doc })
    })

    // POST /api/v1/documents — register the uploaded file as a pending document.
    // Always starts in `under_review` — a dept_head/HR must approve before the
    // doc is considered valid. The employee cannot self-approve.
    fastify.post('/', { ...auth }, async (request: any, reply: any) => {
        const { tenantId, employeeId } = request.user
        if (!employeeId) return reply.code(400).send(e400('No employee record linked to this account'))

        const b = (request.body ?? {}) as Record<string, unknown>
        const category = String(b.category ?? '')
        const docType = String(b.docType ?? '').trim()
        const fileName = String(b.fileName ?? '').trim()
        const s3Key = b.s3Key ? String(b.s3Key) : null
        const fileSize = typeof b.fileSize === 'number' ? b.fileSize : null
        const docNumber = b.docNumber ? String(b.docNumber).trim() : null
        const issueDate = b.issueDate ? String(b.issueDate) : null
        const expiryDate = b.expiryDate ? String(b.expiryDate) : null
        const notes = b.notes ? String(b.notes) : null

        if (!ALLOWED_CATEGORIES.has(category)) return reply.code(400).send(e400('Invalid category'))
        if (!docType) return reply.code(400).send(e400('docType is required'))
        if (!fileName) return reply.code(400).send(e400('fileName is required'))
        if (!s3Key) return reply.code(400).send(e400('s3Key is required — upload the file first'))

        // Cross-tenant key injection guard
        if (!s3Key.startsWith(`tenants/${tenantId}/employees/${employeeId}/documents/`)) {
            return reply.code(403).send(e403('The referenced file does not belong to you'))
        }
        const exists = await objectExists(s3Key)
        if (!exists) return reply.code(400).send(e400('The uploaded file was not found in storage'))

        const [doc] = await db
            .insert(documents)
            .values({
                tenantId,
                employeeId,
                category: category as any,
                docType,
                fileName,
                s3Key,
                fileSize,
                docNumber,
                issueDate,
                expiryDate,
                notes,
                status: 'under_review',
                uploadedBy: request.user.id,
            })
            .returning()

        recordActivity({
            tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'document',
            entityId: doc.id,
            entityName: doc.docType,
            action: 'submit',
            metadata: { category, docType, pendingApproval: true },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        // Notify HR + the submitter's direct dept_head that there's a doc to review.
        notifyReviewers({
            tenantId,
            actorEmployeeId: employeeId,
            title: `${request.user.name ?? 'An employee'} uploaded "${docType}"`,
            message: 'New document pending verification',
            actionUrl: `/employees/${employeeId}?tab=documents&review=${doc.id}`,
        }).catch((err) => request.log?.warn?.({ err }, 'document submit notification failed'))

        return reply.code(201).send({ data: doc })
    })

    // POST /api/v1/documents/:id/approve — dept_head (or HR) marks an under_review doc as valid.
    fastify.post('/:id/approve', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return

        const user = request.user
        if (!isDeptHead(user) && !isElevated(user)) {
            return reply.code(403).send(e403('Only managers can approve documents'))
        }

        const [doc] = await db
            .select()
            .from(documents)
            .where(and(eq(documents.tenantId, user.tenantId), eq(documents.id, id), isNull(documents.deletedAt)))
            .limit(1)
        if (!doc) return reply.code(404).send(e404('Document not found'))
        if (doc.status !== 'under_review') {
            return reply.code(400).send(e400('Only documents awaiting review can be approved'))
        }
        if (!doc.employeeId) return reply.code(400).send(e400('Document is not linked to an employee'))
        // Employees cannot self-approve, even if they happen to have dept_head role.
        if (doc.employeeId === user.employeeId) {
            return reply.code(403).send(e403('You cannot approve your own document'))
        }
        if (!(await canAccessEmployee(user, doc.employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to approve this employee\'s documents'))
        }

        const [updated] = await db
            .update(documents)
            .set({
                status: 'valid',
                verified: true,
                verifiedBy: user.id,
                verifiedAt: new Date(),
                rejectionReason: null,
                rejectedAt: null,
                rejectedBy: null,
                updatedAt: new Date(),
            })
            .where(and(eq(documents.tenantId, user.tenantId), eq(documents.id, id)))
            .returning()

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'document',
            entityId: id,
            entityName: updated.docType,
            action: 'approve',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        if (doc.employeeId) {
            notifyRequester({
                tenantId: user.tenantId,
                employeeId: doc.employeeId,
                type: 'success',
                title: `Your "${updated.docType}" was approved`,
                message: 'The document is now valid on your record.',
                actionUrl: '/me/documents',
            }).catch((err) => request.log?.warn?.({ err }, 'document approve notification failed'))
        }

        return reply.send({ data: updated })
    })

    // POST /api/v1/documents/:id/reject — same gate as approve.
    fastify.post('/:id/reject', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return

        const user = request.user
        if (!isDeptHead(user) && !isElevated(user)) {
            return reply.code(403).send(e403('Only managers can reject documents'))
        }

        const reason = String(((request.body ?? {}) as { reason?: string }).reason ?? '').trim()
        if (!reason) return reply.code(400).send(e400('Rejection reason is required'))

        const [doc] = await db
            .select()
            .from(documents)
            .where(and(eq(documents.tenantId, user.tenantId), eq(documents.id, id), isNull(documents.deletedAt)))
            .limit(1)
        if (!doc) return reply.code(404).send(e404('Document not found'))
        if (doc.status !== 'under_review') {
            return reply.code(400).send(e400('Only documents awaiting review can be rejected'))
        }
        if (!doc.employeeId) return reply.code(400).send(e400('Document is not linked to an employee'))
        if (doc.employeeId === user.employeeId) {
            return reply.code(403).send(e403('You cannot reject your own document'))
        }
        if (!(await canAccessEmployee(user, doc.employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to reject this employee\'s documents'))
        }

        const [updated] = await db
            .update(documents)
            .set({
                status: 'rejected',
                verified: false,
                rejectionReason: reason,
                rejectedAt: new Date(),
                rejectedBy: user.id,
                updatedAt: new Date(),
            })
            .where(and(eq(documents.tenantId, user.tenantId), eq(documents.id, id)))
            .returning()

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'document',
            entityId: id,
            entityName: updated.docType,
            action: 'reject',
            metadata: { reason },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        if (doc.employeeId) {
            notifyRequester({
                tenantId: user.tenantId,
                employeeId: doc.employeeId,
                type: 'warning',
                title: `Your "${updated.docType}" was rejected`,
                message: reason,
                actionUrl: '/me/documents',
            }).catch((err) => request.log?.warn?.({ err }, 'document reject notification failed'))
        }

        return reply.send({ data: updated })
    })

    // GET /api/v1/documents/:id/download — 302 redirect to a 1-hour presigned URL
    fastify.get('/:id/download', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return
        const user = request.user

        const [doc] = await db
            .select()
            .from(documents)
            .where(and(eq(documents.tenantId, user.tenantId), eq(documents.id, id), isNull(documents.deletedAt)))
            .limit(1)

        if (!doc) return reply.code(404).send(e404('Document not found'))
        // Owner OR a manager who can access the employee may download.
        const isOwner = doc.employeeId === user.employeeId
        const canManagerAccess = !!doc.employeeId && (await canAccessEmployee(user, doc.employeeId, request))
        if (!isOwner && !canManagerAccess) {
            return reply.code(403).send(e403('Not authorized to download this document'))
        }
        if (!doc.s3Key) return reply.code(404).send(e404('No file attached to this document'))

        const url = await generateDownloadUrl(doc.s3Key, 3600, doc.fileName)
        return reply.redirect(302, url)
    })
}
