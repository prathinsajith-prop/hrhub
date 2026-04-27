import { getChecklist, updateStep, listChecklists, addStep, deleteStep, createChecklist, getAnalytics } from './onboarding.service.js'
import {
    listRequiredDocs,
    addRequiredDoc,
    deleteRequiredDoc,
    seedRequiredDocsFromTemplate,
    getStepDocSummary,
    issueUploadToken,
    listUploadTokens,
    revokeUploadToken,
    validateUploadToken,
    logDocumentAction,
    defaultRequiredDocsForStep,
} from './onboarding.docs.service.js'
import { sendEmail, onboardingUploadLinkEmail } from '../../plugins/email.js'
import { db } from '../../db/index.js'
import { onboardingChecklists, onboardingSteps, onboardingStepRequiredDocs, documents, tenants, employees } from '../../db/schema/index.js'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { buildS3Key, uploadObject } from '../../plugins/s3.js'
import { loadEnv } from '../../config/env.js'

// Suggested doc types per step title keyword (used for upload-info endpoint
// when no per-step required-docs have been configured).
const STEP_DOC_SUGGESTIONS: Record<string, Array<{ docType: string; category: string; expiryRequired: boolean }>> = {
    'hr documentation': [
        { docType: 'Employment Contract', category: 'employment', expiryRequired: false },
        { docType: 'Offer Letter', category: 'employment', expiryRequired: false },
    ],
    'benefits enrollment': [
        { docType: 'Bank Account Details', category: 'financial', expiryRequired: false },
        { docType: 'Health Insurance Card', category: 'insurance', expiryRequired: true },
    ],
    'compliance': [
        { docType: 'MOHRE Registration', category: 'compliance', expiryRequired: true },
    ],
    'identity': [
        { docType: 'Passport', category: 'identity', expiryRequired: true },
        { docType: 'Emirates ID', category: 'identity', expiryRequired: true },
    ],
    'visa': [
        { docType: 'Residence Visa', category: 'visa', expiryRequired: true },
        { docType: 'Labour Card', category: 'visa', expiryRequired: true },
    ],
}

function getStepSuggestions(title: string) {
    const lower = title.toLowerCase()
    for (const [key, docs] of Object.entries(STEP_DOC_SUGGESTIONS)) {
        if (lower.includes(key)) return docs
    }
    return []
}

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const writeAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')] }

    fastify.get('/analytics', { ...auth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const data = await getAnalytics(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.post('/', {
        ...writeAuth,
        schema: {
            tags: ['Onboarding'],
            body: {
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'string', format: 'uuid' },
                    startDate: { type: 'string' },
                    dueDate: { type: 'string' },
                    useTemplate: { type: 'boolean' },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const result = await createChecklist(request.user.tenantId, request.body as never)
        if ('error' in result) {
            if (result.error === 'employee_not_found') return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
            if (result.error === 'already_exists') return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Onboarding checklist already exists for this employee' })
        }
        return reply.code(201).send({ data: (result as any).checklist })
    })

    fastify.get('/', { ...auth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const { limit = '20', offset = '0' } = request.query as Record<string, string>
        const data = await listChecklists(request.user.tenantId, { limit: Number(limit), offset: Number(offset) })
        return reply.send({ data })
    })

    fastify.get('/employee/:employeeId', { ...auth, schema: { tags: ['Onboarding'] } }, async (request, reply) => {
        const { employeeId } = request.params as { employeeId: string }
        const checklist = await getChecklist(request.user.tenantId, employeeId)
        if (!checklist) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Onboarding checklist not found' })
        return reply.send({ data: checklist })
    })

    fastify.patch('/:checklistId/steps/:stepId', {
        ...writeAuth,
        schema: {
            tags: ['Onboarding'],
            body: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'overdue'] },
                    notes: { type: 'string' },
                    completedDate: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const { checklistId, stepId } = request.params as { checklistId: string; stepId: string }
        const result = await updateStep(request.user.tenantId, checklistId, stepId, request.body as never)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Step not found' })
        return reply.send({ data: result })
    })

    fastify.post('/:checklistId/steps', {
        ...writeAuth,
        schema: {
            tags: ['Onboarding'],
            body: {
                type: 'object',
                required: ['title'],
                properties: {
                    title: { type: 'string', minLength: 1 },
                    owner: { type: 'string' },
                    dueDate: { type: 'string' },
                    slaDays: { type: 'number' },
                },
            },
        },
    }, async (request, reply) => {
        const { checklistId } = request.params as { checklistId: string }
        const result = await addStep(request.user.tenantId, checklistId, request.body as never)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Checklist not found' })
        return reply.code(201).send({ data: result })
    })

    fastify.delete('/:checklistId/steps/:stepId', { ...writeAuth, schema: { tags: ['Onboarding'] } }, async (request, reply) => {
        const { checklistId, stepId } = request.params as { checklistId: string; stepId: string }
        const result = await deleteStep(request.user.tenantId, checklistId, stepId)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Step not found' })
        return reply.code(204).send()
    })

    // ── Upload Magic Link ─────────────────────────────────────────────────────
    // POST /onboarding/:checklistId/upload-token
    // Generates a DB-backed token row and emails it to the employee. The JWT
    // sent to the employee carries the token's UUID (jti); this enables
    // server-side revocation, view/upload counters, and IP audit.
    fastify.post('/:checklistId/upload-token', {
        ...writeAuth,
        schema: {
            tags: ['Onboarding'],
            body: {
                type: 'object',
                properties: {
                    expiresInDays: { type: 'number', minimum: 1, maximum: 30 },
                    seedRequiredDocs: { type: 'boolean', default: true },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const { checklistId } = request.params as { checklistId: string }
        const { expiresInDays = 7, seedRequiredDocs = true } = (request.body ?? {}) as { expiresInDays?: number; seedRequiredDocs?: boolean }

        // Load checklist + employee email
        const [row] = await db
            .select({
                id: onboardingChecklists.id,
                tenantId: onboardingChecklists.tenantId,
                employeeId: onboardingChecklists.employeeId,
                employeeEmail: employees.email,
                employeeFirst: employees.firstName,
                employeeLast: employees.lastName,
            })
            .from(onboardingChecklists)
            .leftJoin(employees, eq(onboardingChecklists.employeeId, employees.id))
            .where(and(eq(onboardingChecklists.id, checklistId), eq(onboardingChecklists.tenantId, request.user.tenantId)))
            .limit(1)

        if (!row) return reply.code(404).send({ message: 'Checklist not found' })
        if (!row.employeeEmail) return reply.code(422).send({ message: 'Employee has no email address on record' })

        const [tenant] = await db
            .select({ name: tenants.name })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)

        // Optionally seed required-docs from template (idempotent — only fills empty steps)
        if (seedRequiredDocs) {
            await seedRequiredDocsFromTemplate(request.user.tenantId, checklistId)
        }

        // Persist a token row first; the JWT carries its UUID so we can revoke.
        const tokenRow = await issueUploadToken({
            tenantId: request.user.tenantId,
            checklistId,
            employeeId: row.employeeId,
            issuedBy: request.user.id,
            issuedToEmail: row.employeeEmail,
            expiresInDays,
        })

        const token = (fastify as any).jwt.sign(
            { jti: tokenRow.id, checklistId, tenantId: request.user.tenantId, employeeId: row.employeeId },
            { expiresIn: `${expiresInDays}d` },
        )

        const env = loadEnv()
        const uploadUrl = `${env.APP_URL}/onboarding/upload/${token}`
        const employeeName = [row.employeeFirst, row.employeeLast].filter(Boolean).join(' ') || 'Employee'
        const companyName = tenant?.name ?? 'Your Company'

        const emailOpts = onboardingUploadLinkEmail({ employeeName, companyName, uploadUrl, expiresInDays })
        emailOpts.to = row.employeeEmail
        const result = await sendEmail(emailOpts)

        return reply.send({
            data: {
                sent: result.ok,
                error: result.error,
                email: row.employeeEmail,
                uploadUrl,
                expiresInDays,
                tokenId: tokenRow.id,
            },
        })
    })

    // GET /onboarding/:checklistId/upload-tokens — list all tokens for HR
    fastify.get('/:checklistId/upload-tokens', { ...writeAuth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const { checklistId } = request.params as { checklistId: string }
        const tokens = await listUploadTokens(request.user.tenantId, checklistId)
        return reply.send({ data: tokens })
    })

    // POST /onboarding/upload-tokens/:tokenId/revoke — revoke a magic link
    fastify.post('/upload-tokens/:tokenId/revoke', { ...writeAuth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const { tokenId } = request.params as { tokenId: string }
        const revoked = await revokeUploadToken(request.user.tenantId, tokenId, request.user.id)
        if (!revoked) return reply.code(404).send({ message: 'Token not found or already revoked' })
        return reply.send({ data: revoked })
    })

    // ── Public: Upload Info ───────────────────────────────────────────────────
    // GET /onboarding/upload-info?t=<token>  — NO AUTH
    // NOTE: token is passed as query param (not path param) because JWT tokens
    // exceed find-my-way's ~255-char path segment limit, causing 404.
    fastify.get('/upload-info', { schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const rawToken = (request.query as any).t as string | undefined
        if (!rawToken) return reply.code(400).send({ message: 'Missing token' })
        let claims: { jti?: string; checklistId: string; tenantId: string; employeeId: string }
        try {
            claims = (fastify as any).jwt.verify(rawToken)
        } catch {
            return reply.code(401).send({ message: 'Invalid or expired upload link' })
        }

        // If token has a jti, validate against DB (allows revocation).
        if (claims.jti) {
            const tokenRow = await validateUploadToken(claims.jti, { ip: request.ip, mode: 'view' })
            if (!tokenRow) return reply.code(401).send({ message: 'This upload link has been revoked or expired.' })
        }

        const [checklist] = await db
            .select({
                id: onboardingChecklists.id,
                employeeId: onboardingChecklists.employeeId,
                startDate: onboardingChecklists.startDate,
                dueDate: onboardingChecklists.dueDate,
                progress: onboardingChecklists.progress,
                employeeFirst: employees.firstName,
                employeeLast: employees.lastName,
                employeeEmail: employees.email,
                tenantName: tenants.name,
            })
            .from(onboardingChecklists)
            .leftJoin(employees, eq(onboardingChecklists.employeeId, employees.id))
            .leftJoin(tenants, eq(onboardingChecklists.tenantId, tenants.id))
            .where(and(
                eq(onboardingChecklists.id, claims.checklistId),
                eq(onboardingChecklists.tenantId, claims.tenantId),
            ))
            .limit(1)

        if (!checklist) return reply.code(404).send({ message: 'Onboarding checklist not found' })

        const steps = await db
            .select()
            .from(onboardingSteps)
            .where(eq(onboardingSteps.checklistId, claims.checklistId))
            .orderBy(onboardingSteps.stepOrder)

        // Load required-docs and uploaded-docs in parallel
        const stepIds = steps.map(s => s.id)
        const [requiredRows, existingDocs] = await Promise.all([
            stepIds.length > 0
                ? db.select().from(onboardingStepRequiredDocs).where(inArray(onboardingStepRequiredDocs.stepId, stepIds))
                : Promise.resolve([] as any[]),
            stepIds.length > 0
                ? db.select({
                    id: documents.id,
                    stepId: documents.stepId,
                    category: documents.category,
                    docType: documents.docType,
                    fileName: documents.fileName,
                    status: documents.status,
                    expiryDate: documents.expiryDate,
                    rejectionReason: documents.rejectionReason,
                    createdAt: documents.createdAt,
                })
                    .from(documents)
                    .where(and(
                        eq(documents.employeeId, claims.employeeId),
                        eq(documents.tenantId, claims.tenantId),
                        isNull(documents.deletedAt),
                    )) as any
                : Promise.resolve([] as any[]),
        ])

        const reqsByStep = new Map<string, typeof requiredRows>()
        for (const r of requiredRows) {
            const arr = reqsByStep.get(r.stepId) ?? []
            arr.push(r)
            reqsByStep.set(r.stepId, arr)
        }
        const docsByStep = new Map<string, typeof existingDocs>()
        for (const d of existingDocs) {
            if (!d.stepId) continue
            const arr = docsByStep.get(d.stepId) ?? []
            arr.push(d)
            docsByStep.set(d.stepId, arr)
        }

        // Aggregate progress: count of fulfilled mandatory required-docs / total mandatory
        let mandatoryTotal = 0
        let mandatoryFulfilled = 0

        const stepsOut = steps.map(s => {
            const reqs = (reqsByStep.get(s.id) ?? []) as Array<{ id: string; category: string; docType: string; expiryRequired: boolean; isMandatory: boolean; hint: string | null; sortOrder: number }>
            const docs = (docsByStep.get(s.id) ?? []) as any[]

            // Fall back to legacy keyword suggestions if no required-docs configured
            const fallback = reqs.length === 0 ? getStepSuggestions(s.title) : []

            const requiredOut = reqs.length > 0
                ? reqs.map(r => {
                    const fulfilled = docs.some(d => d.docType === r.docType && d.category === r.category && d.status !== 'rejected')
                    if (r.isMandatory) {
                        mandatoryTotal++
                        if (fulfilled) mandatoryFulfilled++
                    }
                    return {
                        id: r.id,
                        category: r.category,
                        docType: r.docType,
                        expiryRequired: r.expiryRequired,
                        isMandatory: r.isMandatory,
                        hint: r.hint,
                        fulfilled,
                    }
                })
                : []

            return {
                id: s.id,
                stepOrder: s.stepOrder,
                title: s.title,
                owner: s.owner,
                status: s.status,
                dueDate: s.dueDate,
                requiredDocs: requiredOut,
                suggestedDocs: fallback,
                uploadedDocs: docs.map(d => ({
                    id: d.id,
                    category: d.category,
                    docType: d.docType,
                    fileName: d.fileName,
                    status: d.status,
                    expiryDate: d.expiryDate,
                    rejectionReason: d.rejectionReason,
                    createdAt: d.createdAt,
                })),
            }
        })

        const overallProgress = mandatoryTotal === 0 ? null : Math.round((mandatoryFulfilled / mandatoryTotal) * 100)

        return reply.send({
            data: {
                checklistId: checklist.id,
                employeeName: [checklist.employeeFirst, checklist.employeeLast].filter(Boolean).join(' '),
                companyName: checklist.tenantName,
                progress: checklist.progress,
                requiredDocsProgress: overallProgress,
                mandatoryTotal,
                mandatoryFulfilled,
                steps: stepsOut,
            },
        })
    })

    // ── Public: Upload Document Against Step ──────────────────────────────────
    // POST /onboarding/upload/:token  — NO AUTH, multipart
    fastify.post('/upload', { schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const rawToken = (request.query as any).t as string | undefined
        if (!rawToken) return reply.code(400).send({ message: 'Missing token' })
        let claims: { jti?: string; checklistId: string; tenantId: string; employeeId: string }
        try {
            claims = (fastify as any).jwt.verify(rawToken)
        } catch {
            return reply.code(401).send({ message: 'Invalid or expired upload link' })
        }

        if (claims.jti) {
            const tokenRow = await validateUploadToken(claims.jti, { ip: request.ip, mode: 'upload' })
            if (!tokenRow) return reply.code(401).send({ message: 'This upload link has been revoked or expired.' })
        }

        const ALLOWED: Record<string, Buffer[]> = {
            'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])],
            'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
            'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
        }

        const parts = request.parts()
        let fileMeta: { fileName: string; mime: string; s3Key: string; size: number } | null = null
        const fields: Record<string, string> = {}

        for await (const part of parts) {
            if (part.type === 'file') {
                const chunks: Buffer[] = []
                for await (const chunk of part.file) chunks.push(chunk as Buffer)
                const buffer = Buffer.concat(chunks)

                const declared = part.mimetype || 'application/octet-stream'
                const signatures = ALLOWED[declared]
                if (!signatures) return reply.code(415).send({ message: `File type '${declared}' is not permitted.` })
                if (!signatures.some(sig => buffer.slice(0, sig.length).equals(sig))) {
                    return reply.code(415).send({ message: 'File content does not match its declared type.' })
                }

                const safeName = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
                const s3Key = buildS3Key(claims.tenantId, `employees/${claims.employeeId}/documents`, safeName)

                try {
                    await uploadObject(s3Key, buffer, declared)
                } catch {
                    return reply.code(503).send({ message: 'File storage unavailable. Please try again later.' })
                }

                fileMeta = { fileName: part.filename, mime: declared, s3Key, size: buffer.length }
            } else {
                fields[part.fieldname] = part.value as string
            }
        }

        if (!fileMeta) return reply.code(400).send({ message: 'No file provided' })

        const { stepId, category, docType, expiryDate } = fields
        if (!category) return reply.code(400).send({ message: 'category is required' })
        if (!docType) return reply.code(400).send({ message: 'docType is required' })

        // Verify stepId belongs to this checklist (if provided) AND that
        // the required-doc (if any) does not need an expiry that's missing.
        if (stepId) {
            const [step] = await db
                .select({ id: onboardingSteps.id })
                .from(onboardingSteps)
                .where(and(eq(onboardingSteps.id, stepId), eq(onboardingSteps.checklistId, claims.checklistId)))
                .limit(1)
            if (!step) return reply.code(400).send({ message: 'Step does not belong to this checklist' })

            // Cross-check expiry-required against per-step config
            const [reqRow] = await db.select().from(onboardingStepRequiredDocs)
                .where(and(
                    eq(onboardingStepRequiredDocs.stepId, stepId),
                    eq(onboardingStepRequiredDocs.category, category as any),
                    eq(onboardingStepRequiredDocs.docType, docType),
                ))
                .limit(1)
            if (reqRow?.expiryRequired && !expiryDate) {
                return reply.code(400).send({ message: `${docType} requires an expiry date.` })
            }
        }

        const [doc] = await db.insert(documents).values({
            tenantId: claims.tenantId,
            employeeId: claims.employeeId,
            stepId: stepId || null,
            category: category as any,
            docType,
            fileName: fileMeta.fileName,
            s3Key: fileMeta.s3Key,
            fileSize: fileMeta.size,
            expiryDate: expiryDate || null,
            status: 'under_review',
            verified: false,
        }).returning()

        // Audit: who uploaded (employee via magic link)
        await logDocumentAction({
            tenantId: claims.tenantId,
            documentId: doc.id,
            action: 'uploaded',
            actorLabel: 'employee_self_upload',
            details: { stepId: stepId || null, category, docType, expiryDate: expiryDate || null, fileName: fileMeta.fileName, sizeBytes: fileMeta.size },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] as string | undefined,
        })

        return reply.code(201).send({ data: doc })
    })

    // ── Required-docs config (HR side) ────────────────────────────────────────
    fastify.get('/steps/:stepId/required-docs', { ...auth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const { stepId } = request.params as { stepId: string }
        const data = await listRequiredDocs(request.user.tenantId, stepId)
        return reply.send({ data })
    })

    fastify.post('/steps/:stepId/required-docs', {
        ...writeAuth,
        schema: {
            tags: ['Onboarding'],
            body: {
                type: 'object',
                required: ['category', 'docType'],
                properties: {
                    category: { type: 'string', enum: ['identity', 'visa', 'company', 'employment', 'insurance', 'qualification', 'financial', 'compliance'] },
                    docType: { type: 'string', minLength: 1 },
                    expiryRequired: { type: 'boolean' },
                    isMandatory: { type: 'boolean' },
                    hint: { type: 'string' },
                    sortOrder: { type: 'number' },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const { stepId } = request.params as { stepId: string }
        const created = await addRequiredDoc(request.user.tenantId, stepId, request.body as any)
        if (!created) return reply.code(404).send({ message: 'Step not found' })
        return reply.code(201).send({ data: created })
    })

    fastify.delete('/required-docs/:requiredDocId', { ...writeAuth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const { requiredDocId } = request.params as { requiredDocId: string }
        const deleted = await deleteRequiredDoc(request.user.tenantId, requiredDocId)
        if (!deleted) return reply.code(404).send({ message: 'Required-doc not found' })
        return reply.send({ data: deleted })
    })

    fastify.post('/:checklistId/seed-required-docs', { ...writeAuth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const { checklistId } = request.params as { checklistId: string }
        const result = await seedRequiredDocsFromTemplate(request.user.tenantId, checklistId)
        return reply.send({ data: result })
    })

    // GET /onboarding/:checklistId/doc-summary — HR view of per-step uploaded vs required
    fastify.get('/:checklistId/doc-summary', { ...auth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const { checklistId } = request.params as { checklistId: string }
        const summary = await getStepDocSummary(request.user.tenantId, checklistId)
        if (!summary) return reply.code(404).send({ message: 'Checklist not found' })
        return reply.send({ data: summary })
    })

    // GET /onboarding/templates/required-docs — read-only template catalog (so the UI
    // can show "what would be seeded" before creating a checklist)
    fastify.get('/templates/required-docs', { ...auth, schema: { tags: ['Onboarding'] } }, async (_request: any, reply: any) => {
        const data: Record<string, ReturnType<typeof defaultRequiredDocsForStep>> = {}
        // Build from REQUIRED_DOC_TEMPLATES via title keywords; map keyword→docs
        const { REQUIRED_DOC_TEMPLATES } = await import('./onboarding.docs.service.js')
        for (const [key, docs] of Object.entries(REQUIRED_DOC_TEMPLATES)) {
            data[key] = docs as any
        }
        return reply.send({ data })
    })
}
