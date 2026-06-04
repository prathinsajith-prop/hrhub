import { and, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import {
    recruitmentJobs,
    jobApplications,
    referrals,
    tenants,
    recruitmentSkills,
    recruitmentQualifications,
} from '../../db/schema/index.js'
import { e400, e403, e404, e409 } from '../../lib/errors.js'
import { recordActivity } from '../../lib/audit.js'
import { buildS3Key, uploadObject } from '../../lib/s3.js'
import { sendEmail, referralReceivedEmail } from '../../lib/email.js'
import { notifyRequester, notifyReviewers } from '../../lib/notify.js'

// Resume types we accept. Mirrors the documents-upload allow-list.
const RESUME_MIME = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp',
])
const IMAGE_MIME: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }

/**
 * Detect the real content type from magic bytes — never trust the client-supplied
 * Content-Type / extension (mirrors the main backend's fileTypeFromBuffer check).
 * Returns a canonical MIME or null. Office Open XML (.docx) is a zip and legacy
 * .doc is OLE2, so both map to their canonical document MIME.
 */
function sniffMime(buf: Buffer): string | null {
    if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf' // %PDF
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
    if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // PK zip → docx
    if (buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return 'application/msword' // OLE2 → doc
    return null
}

/**
 * Employee-portal referral endpoints.
 *
 *   GET  /referrals/jobs?q= — open job postings (searchable by title / job no)
 *   GET  /referrals         — the caller's own referrals, with live pipeline stage
 *   POST /referrals         — submit a referral (multipart: fields + optional resume)
 *
 * Submitting a referral, in one transaction:
 *   1. creates a job_applications row (source='referral', stage='received',
 *      referred_by_employee_id = caller) so the candidate enters the HR
 *      recruitment pipeline immediately, and
 *   2. creates a referrals row linking back to that application.
 * Then (best-effort) emails the referred candidate. Tenant-scoped throughout.
 */
export default async function referralsRoutes(fastify: FastifyInstance): Promise<void> {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // ── Open jobs the employee can refer against (searchable) ───────────────
    fastify.get('/jobs', { ...auth }, async (request: any, reply: any) => {
        const q = String((request.query as any)?.q ?? '').trim()
        const search = q
            ? or(ilike(recruitmentJobs.title, `%${q}%`), ilike(recruitmentJobs.jobNo, `%${q}%`))
            : undefined
        const rows = await db
            .select({
                id: recruitmentJobs.id,
                jobNo: recruitmentJobs.jobNo,
                title: recruitmentJobs.title,
                department: recruitmentJobs.department,
                location: recruitmentJobs.location,
                type: recruitmentJobs.type,
                openings: recruitmentJobs.openings,
            })
            .from(recruitmentJobs)
            .where(and(
                eq(recruitmentJobs.tenantId, request.user.tenantId),
                eq(recruitmentJobs.status, 'open'),
                isNull(recruitmentJobs.deletedAt),
                search,
            ))
            .orderBy(desc(recruitmentJobs.createdAt))
            .limit(25)
        return reply.send({ data: rows })
    })

    // ── Skill / qualification suggestions (read-only) ───────────────────────
    // Sourced from the per-tenant catalog curated by the admin job screens. The
    // referral form suggests from this vocabulary but never adds to it.
    fastify.get('/tag-suggestions', { ...auth }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const [skills, qualifications] = await Promise.all([
            db.select({ name: recruitmentSkills.name }).from(recruitmentSkills)
                .where(eq(recruitmentSkills.tenantId, tenantId)).orderBy(recruitmentSkills.name),
            db.select({ name: recruitmentQualifications.name }).from(recruitmentQualifications)
                .where(eq(recruitmentQualifications.tenantId, tenantId)).orderBy(recruitmentQualifications.name),
        ])
        return reply.send({ data: { skills: skills.map((r) => r.name), qualifications: qualifications.map((r) => r.name) } })
    })

    // ── My referrals (with the live stage of the linked application) ────────
    fastify.get('/', { ...auth }, async (request: any, reply: any) => {
        const employeeId = request.user.employeeId
        if (!employeeId) return reply.send({ data: [] })
        const rows = await db
            .select({
                id: referrals.id,
                jobId: referrals.jobId,
                jobNo: recruitmentJobs.jobNo,
                jobTitle: recruitmentJobs.title,
                candidateName: referrals.candidateName,
                candidateEmail: referrals.candidateEmail,
                candidatePhone: referrals.candidatePhone,
                relationship: referrals.relationship,
                notes: referrals.notes,
                hasResume: sql<boolean>`${referrals.resumeUrl} IS NOT NULL`,
                createdAt: referrals.createdAt,
                jobApplicationId: referrals.jobApplicationId,
                // Live pipeline stage of the referred candidate (null if the
                // application was deleted). Lets the employee track progress.
                stage: jobApplications.stage,
                // Extended candidate profile (migration 0081). Pulled from the
                // linked application so the portal can render exactly what the
                // employee just submitted — without these the form's extended
                // inputs are silently lost on the read-back.
                address: jobApplications.address,
                gender: jobApplications.gender,
                nationality: jobApplications.nationality,
                experience: jobApplications.experience,
                expectedSalary: jobApplications.expectedSalary,
                currentSalary: jobApplications.currentSalary,
                skills: jobApplications.skills,
                educationHistory: jobApplications.educationHistory,
                experienceHistory: jobApplications.experienceHistory,
                resumeUrl: jobApplications.resumeUrl,
                avatarUrl: jobApplications.avatarUrl,
            })
            .from(referrals)
            .leftJoin(recruitmentJobs, eq(referrals.jobId, recruitmentJobs.id))
            .leftJoin(jobApplications, eq(referrals.jobApplicationId, jobApplications.id))
            .where(and(
                eq(referrals.tenantId, request.user.tenantId),
                eq(referrals.referredByEmployeeId, employeeId),
                isNull(referrals.deletedAt),
            ))
            .orderBy(desc(referrals.createdAt))
        return reply.send({ data: rows })
    })

    // ── Submit a referral (multipart: fields + optional resume) ─────────────
    fastify.post('/', { ...auth }, async (request: any, reply: any) => {
        const employeeId = request.user.employeeId
        if (!employeeId) return reply.code(403).send(e403('No employee record linked to this account.'))

        // Parse multipart: collect text fields + buffer the (optional) resume.
        const fields: Record<string, string> = {}
        let pending: { buffer: Buffer; originalName: string; mimetype: string } | null = null
        // Optional candidate photo, auto-extracted from the résumé client-side.
        let photo: { buffer: Buffer; mimetype: string } | null = null
        for await (const part of (request as any).parts()) {
            if (part.type === 'file') {
                const chunks: Buffer[] = []
                for await (const chunk of part.file) chunks.push(chunk as Buffer)
                if (part.fieldname === 'photo') {
                    // Cap photo at 2 MB; just skip it if oversized rather than failing.
                    if (!part.file.truncated && chunks.length) {
                        const buf = Buffer.concat(chunks)
                        if (buf.length <= 2 * 1024 * 1024) photo = { buffer: buf, mimetype: part.mimetype }
                    }
                    continue
                }
                if (part.file.truncated) {
                    return reply.code(413).send({ statusCode: 413, error: 'Payload Too Large', message: 'Resume exceeds the 10 MB limit.' })
                }
                if (chunks.length) pending = { buffer: Buffer.concat(chunks), originalName: part.filename, mimetype: part.mimetype }
            } else {
                fields[part.fieldname] = part.value as string
            }
        }

        const jobId = String(fields.jobId ?? '').trim()
        const candidateName = String(fields.candidateName ?? '').trim()
        const candidateEmail = String(fields.candidateEmail ?? '').trim().toLowerCase()
        const candidatePhone = fields.candidatePhone?.trim() || null
        const relationship = fields.relationship?.trim() || null
        const notes = fields.notes?.trim() || null
        // Extended candidate profile fields (migration 0081). Multipart values are
        // strings only, so arrays arrive JSON-stringified; parse defensively so a
        // malformed payload never blocks the referral submission.
        const address = fields.address?.trim() || null
        const nationality = fields.nationality?.trim() || null
        const validGenders = ['male', 'female', 'other', 'prefer_not_to_say']
        const genderRaw = fields.gender?.trim() ?? ''
        const gender = validGenders.includes(genderRaw) ? (genderRaw as 'male' | 'female' | 'other' | 'prefer_not_to_say') : null
        // Numeric fields: parse explicitly so a literal 0 (e.g. fresh graduate)
        // is preserved and non-numeric free text becomes null rather than 0.
        const expRaw = fields.experience?.trim()
        const expNum = expRaw ? Number(expRaw) : NaN
        const experience = Number.isFinite(expNum) && Number.isInteger(expNum) && expNum >= 0 ? expNum : null
        const expectedRaw = fields.expectedSalary?.trim()
        const expectedNum = expectedRaw ? Number(expectedRaw) : NaN
        const expectedSalary = Number.isFinite(expectedNum) && expectedNum >= 0 ? expectedNum.toFixed(2) : null
        const currentRaw = fields.currentSalary?.trim()
        const currentNum = currentRaw ? Number(currentRaw) : NaN
        const currentSalary = Number.isFinite(currentNum) && currentNum >= 0 ? currentNum.toFixed(2) : null
        const safeArray = <T,>(raw: string | undefined, valid: (v: any) => v is T): T[] => {
            if (!raw) return []
            try {
                const parsed = JSON.parse(raw)
                return Array.isArray(parsed) ? parsed.filter(valid) : []
            } catch { return [] }
        }
        const educationHistory = safeArray<{ school: string }>(
            fields.educationHistory as string | undefined,
            (v: any): v is { school: string } => v && typeof v === 'object' && typeof v.school === 'string' && v.school.trim().length > 0,
        )
        const experienceHistory = safeArray<{ title: string }>(
            fields.experienceHistory as string | undefined,
            (v: any): v is { title: string } => v && typeof v === 'object' && typeof v.title === 'string' && v.title.trim().length > 0,
        )
        const skills = safeArray<string>(
            fields.skills as string | undefined,
            (v: any): v is string => typeof v === 'string' && v.trim().length > 0,
        ).map((s) => s.trim())
        if (!jobId) return reply.code(400).send(e400('A job is required'))
        if (!candidateName) return reply.code(400).send(e400('Candidate name is required'))
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidateEmail)) {
            return reply.code(400).send(e400('A valid candidate email is required'))
        }

        // The job must exist, belong to this tenant, and be open.
        const [job] = await db
            .select({ id: recruitmentJobs.id, status: recruitmentJobs.status, title: recruitmentJobs.title, jobNo: recruitmentJobs.jobNo })
            .from(recruitmentJobs)
            .where(and(
                eq(recruitmentJobs.id, jobId),
                eq(recruitmentJobs.tenantId, request.user.tenantId),
                isNull(recruitmentJobs.deletedAt),
            ))
            .limit(1)
        if (!job) return reply.code(404).send(e404('Job not found'))
        if (job.status !== 'open') return reply.code(409).send(e409('This job is no longer open for referrals'))

        // Pre-check: don't let the same candidate be referred to a job they're
        // already in the pipeline for (the DB unique index is the race-safe backstop).
        const [dup] = await db
            .select({ id: jobApplications.id })
            .from(jobApplications)
            .where(and(
                eq(jobApplications.tenantId, request.user.tenantId),
                eq(jobApplications.jobId, jobId),
                eq(jobApplications.email, candidateEmail),
                isNull(jobApplications.deletedAt),
                ne(jobApplications.stage, 'rejected'),
            ))
            .limit(1)
        if (dup) return reply.code(409).send(e409('This candidate is already in the pipeline for this job'))

        // Resume (optional): validate by MAGIC BYTES (not client headers), then
        // stream to S3 server-side.
        let resumeUrl: string | null = null
        if (pending) {
            const mime = sniffMime(pending.buffer)
            if (!mime || !RESUME_MIME.has(mime)) {
                return reply.code(415).send({ statusCode: 415, error: 'Unsupported Media Type', message: 'Resume must be a valid PDF, Word doc, or image.' })
            }
            const key = buildS3Key(request.user.tenantId, `referrals/${jobId}`, pending.originalName)
            try {
                await uploadObject(key, pending.buffer, mime)
                resumeUrl = key
            } catch {
                return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Could not upload the resume. Please try again.' })
            }
        }

        // Candidate photo (optional, best-effort): validate it's an image, store
        // to S3. A failure here never blocks the referral — photo is a nicety.
        let avatarUrl: string | null = null
        if (photo) {
            const detected = sniffMime(photo.buffer)            // trust bytes, not the client
            const ext = detected ? IMAGE_MIME[detected] : undefined
            if (ext && detected) {
                const key = buildS3Key(request.user.tenantId, `referrals/${jobId}/photo`, `photo${ext}`)
                try {
                    await uploadObject(key, photo.buffer, detected)
                    avatarUrl = key
                } catch {
                    // Swallow — proceed without the photo.
                }
            }
        }

        // One transaction: create the pipeline candidate, then the referral.
        // The referrals (tenant, job, candidate_email) partial-unique index is the
        // race-safe backstop — a second submit raises 23505 and the WHOLE
        // transaction rolls back, so no duplicate candidate is left behind.
        let created
        try {
            created = await db.transaction(async (tx) => {
                const [application] = await tx.insert(jobApplications).values({
                    tenantId: request.user.tenantId,
                    jobId,
                    name: candidateName,
                    email: candidateEmail,
                    phone: candidatePhone,
                    nationality,
                    address,
                    gender,
                    experience,
                    expectedSalary,
                    currentSalary,
                    skills,
                    educationHistory,
                    experienceHistory,
                    notes,
                    resumeUrl,
                    avatarUrl,
                    stage: 'received',
                    source: 'referral',
                    referredByEmployeeId: employeeId,
                }).returning()

                // The pipeline pre-check permits re-referring a candidate whose
                // prior application was rejected, but the partial-unique index on
                // referrals(tenant, job, email) WHERE deleted_at IS NULL would block
                // it (a rejection never soft-deletes the old referral). Soft-delete
                // any stale live referral for this (tenant, job, email) first so the
                // slot is free; same-tx so it stays race-safe.
                await tx.update(referrals)
                    .set({ deletedAt: new Date() })
                    .where(and(
                        eq(referrals.tenantId, request.user.tenantId),
                        eq(referrals.jobId, jobId),
                        eq(referrals.candidateEmail, candidateEmail),
                        isNull(referrals.deletedAt),
                    ))

                const [referral] = await tx.insert(referrals).values({
                    tenantId: request.user.tenantId,
                    jobId,
                    referredByEmployeeId: employeeId,
                    jobApplicationId: application.id,
                    candidateName,
                    candidateEmail,
                    candidatePhone,
                    relationship,
                    notes,
                    resumeUrl,
                }).returning()

                return { application, referral }
            })
        } catch (err: any) {
            const code = err?.code ?? err?.cause?.code
            const msg = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`
            if (code === '23505' || /duplicate key|unique constraint/i.test(msg)) {
                return reply.code(409).send(e409('This candidate has already been referred for this job'))
            }
            throw err
        }

        // Audit: log on the referral and mirror onto the referrer's employee record.
        const meta = { kind: 'referral', subKind: 'submit', jobId, jobNo: job.jobNo, jobTitle: job.title, candidateName, hasResume: !!resumeUrl, jobApplicationId: created.application.id }
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'referral', entityId: created.referral.id, entityName: candidateName, action: 'submit',
            metadata: meta, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: employeeId, entityName: candidateName, action: 'submit',
            metadata: meta, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })

        const roleLabel = job.jobNo ? `${job.title} (${job.jobNo})` : job.title

        // In-app notifications (fire-and-forget — never block the response):
        //   • the referring employee gets a "submitted successfully" confirmation
        //   • HR reviewers are alerted that a new referred candidate needs review
        notifyRequester({
            tenantId: request.user.tenantId,
            employeeId,
            type: 'success',
            title: 'Referral submitted',
            message: `Your referral of ${candidateName} for ${roleLabel} was sent successfully.`,
            actionUrl: '/me/referrals',
        }).catch(() => { })
        notifyReviewers({
            tenantId: request.user.tenantId,
            actorEmployeeId: employeeId,
            type: 'info',
            title: 'New candidate referral',
            message: `${request.user.name ?? 'An employee'} referred ${candidateName} for ${roleLabel}.`,
            actionUrl: '/recruitment',
        }).catch(() => { })

        // Notify the referred candidate (best-effort — never blocks the response).
        ;(async () => {
            try {
                const [tn] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
                const opts = referralReceivedEmail({
                    candidateName,
                    jobTitle: job.title,
                    jobNo: job.jobNo,
                    referrerName: request.user.name ?? 'A colleague',
                    companyName: tn?.name ?? 'our company',
                })
                opts.to = candidateEmail
                await sendEmail(opts)
            } catch (err) {
                request.log?.warn?.({ err }, 'referral candidate email failed')
            }
        })()

        return reply.code(201).send({ data: created.referral })
    })
}
