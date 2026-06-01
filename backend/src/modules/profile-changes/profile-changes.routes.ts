// HR-side view of the employee-initiated profile change requests submitted
// through the portal. Lets the admin app surface a pending queue and apply
// approvals using the same per-field "verified" gate the portal uses.

import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employees, profileChangeRequests, users } from '../../db/schema/index.js'
import { recordActivity } from '../audit/audit.service.js'
import { createNotification } from '../notifications/notifications.service.js'
import { e400, e403, e404 } from '../../lib/errors.js'

const CATEGORY_LABEL: Record<string, string> = {
    bank_details: 'bank details',
    contact: 'contact details',
    personal: 'personal details',
}
const REQUESTER_URLS: Record<string, string> = {
    bank_details: '/my/payslips',
    contact: '/my/profile',
    personal: '/my/profile',
}

/**
 * Notify the original requester (the employee) when HR decides their request.
 * Looks the target user up via `users.employeeId` FK first (canonical), then
 * falls back to email matching for legacy rows where the FK is null.
 */
async function notifyEmployeeOwner(tenantId: string, employeeId: string, decision: 'approved' | 'rejected', category: string, detail: string): Promise<void> {
    const [byFk] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, employeeId), eq(users.isActive, true)))
        .limit(1)
    let userId: string | null = byFk?.id ?? null
    if (!userId) {
        const [byEmail] = await db
            .select({ userId: users.id })
            .from(employees)
            .leftJoin(users, sql`lower(${users.email}) = lower(${employees.email})`)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
            .limit(1)
        userId = byEmail?.userId ?? null
    }
    if (!userId) return
    await createNotification({
        tenantId,
        userId,
        type: decision === 'approved' ? 'success' : 'warning',
        title: `Your ${CATEGORY_LABEL[category] ?? 'profile'} update was ${decision}`,
        message: detail,
        actionUrl: REQUESTER_URLS[category],
    })
}

const EDITABLE_FIELDS: Record<string, readonly string[]> = {
    bank_details: ['bankName', 'accountName', 'accountNumber', 'iban', 'swiftCode', 'bankBranch'] as const,
    contact: ['phone', 'mobileNo', 'personalEmail'] as const,
    personal: ['emergencyContactName', 'emergencyContactPhone', 'emergencyContact', 'homeCountryAddress'] as const,
}

function isValidCategory(c: string): boolean {
    return Object.prototype.hasOwnProperty.call(EDITABLE_FIELDS, c)
}

export default async function profileChangesRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/profile-changes/pending — every pending request in the tenant
    fastify.get('/pending', { ...hrOnly, schema: { tags: ['Profile Changes'] } }, async (request: any, reply: any) => {
        const rows = await db
            .select({
                request: profileChangeRequests,
                employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
                employeeNo: employees.employeeNo,
                employeeDepartment: employees.department,
                employeeAvatarUrl: employees.avatarUrl,
                requestedByName: users.name,
            })
            .from(profileChangeRequests)
            .leftJoin(employees, eq(employees.id, profileChangeRequests.employeeId))
            .leftJoin(users, eq(users.id, profileChangeRequests.requestedBy))
            .where(
                and(
                    eq(profileChangeRequests.tenantId, request.user.tenantId),
                    eq(profileChangeRequests.status, 'pending'),
                ),
            )
            .orderBy(desc(profileChangeRequests.createdAt))

        const data = rows.map((r) => ({
            ...r.request,
            employeeName: r.employeeName,
            employeeNo: r.employeeNo,
            employeeDepartment: r.employeeDepartment,
            employeeAvatarUrl: r.employeeAvatarUrl,
            requestedByName: r.requestedByName,
        }))
        return reply.send({ data })
    })

    // GET /api/v1/profile-changes — full history (filter via ?status= / ?employeeId=)
    fastify.get('/', { ...hrOnly, schema: { tags: ['Profile Changes'] } }, async (request: any, reply: any) => {
        const q = (request.query ?? {}) as { status?: string; employeeId?: string; limit?: string }
        const limit = Math.min(200, Math.max(1, Number(q.limit ?? '50') || 50))
        const conds: any[] = [eq(profileChangeRequests.tenantId, request.user.tenantId)]
        if (q.status && ['pending', 'approved', 'rejected'].includes(q.status)) {
            conds.push(eq(profileChangeRequests.status, q.status as any))
        }
        if (q.employeeId) conds.push(eq(profileChangeRequests.employeeId, q.employeeId))

        const rows = await db
            .select({
                request: profileChangeRequests,
                employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
                employeeNo: employees.employeeNo,
                employeeDepartment: employees.department,
                requestedByName: users.name,
            })
            .from(profileChangeRequests)
            .leftJoin(employees, eq(employees.id, profileChangeRequests.employeeId))
            .leftJoin(users, eq(users.id, profileChangeRequests.requestedBy))
            .where(and(...conds))
            .orderBy(desc(profileChangeRequests.createdAt))
            .limit(limit)

        const data = rows.map((r) => ({
            ...r.request,
            employeeName: r.employeeName,
            employeeNo: r.employeeNo,
            employeeDepartment: r.employeeDepartment,
            requestedByName: r.requestedByName,
        }))
        return reply.send({ data })
    })

    // POST /api/v1/profile-changes/:id/approve
    // Reviewer must tick each changed field (verifiedFields[]) before approve.
    fastify.post('/:id/approve', { ...hrOnly, schema: { tags: ['Profile Changes'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const body = (request.body ?? {}) as { verifiedFields?: unknown; reviewerNotes?: unknown }
        const verifiedFields = Array.isArray(body.verifiedFields)
            ? (body.verifiedFields.filter((v) => typeof v === 'string') as string[])
            : []
        const reviewerNotes = typeof body.reviewerNotes === 'string' ? body.reviewerNotes.trim() : null

        const [req] = await db
            .select()
            .from(profileChangeRequests)
            .where(and(eq(profileChangeRequests.tenantId, request.user.tenantId), eq(profileChangeRequests.id, id)))
            .limit(1)
        if (!req) return reply.code(404).send(e404('Change request not found'))
        if (req.status !== 'pending') {
            return reply.code(400).send(e400('Only pending requests can be approved'))
        }
        if (req.employeeId === request.user.employeeId) {
            return reply.code(403).send(e403('You cannot approve your own change request'))
        }
        if (!isValidCategory(req.category)) return reply.code(400).send(e400('Unknown category'))

        const proposed = (req.proposedChanges ?? {}) as Record<string, string | null>
        const snapshot = (req.currentSnapshot ?? {}) as Record<string, string | null>
        const changedFields = Object.keys(proposed).filter((k) => (snapshot[k] ?? null) !== (proposed[k] ?? null))
        const allowed = new Set(EDITABLE_FIELDS[req.category])
        const verifiedSet = new Set(verifiedFields.filter((f) => allowed.has(f) && changedFields.includes(f)))
        if (changedFields.length === 0) return reply.code(400).send(e400('Nothing to apply'))
        for (const f of changedFields) {
            if (!verifiedSet.has(f)) {
                return reply.code(400).send(e400(`Please verify all changed fields before approving (missing: ${f})`))
            }
        }

        await db.transaction(async (tx) => {
            const patch: Record<string, unknown> = { updatedAt: new Date() }
            for (const f of changedFields) patch[f] = proposed[f]
            await tx
                .update(employees)
                .set(patch as any)
                .where(and(eq(employees.tenantId, request.user.tenantId), eq(employees.id, req.employeeId)))

            await tx
                .update(profileChangeRequests)
                .set({
                    status: 'approved',
                    verifiedFields: Array.from(verifiedSet),
                    reviewerNotes,
                    reviewedBy: request.user.id,
                    reviewedAt: new Date(),
                    rejectionReason: null,
                    updatedAt: new Date(),
                })
                .where(eq(profileChangeRequests.id, id))
        })

        // from→to diff (current snapshot → approved value) for the changed
        // fields, so the audit detail shows what was actually applied.
        const approveDiff: Record<string, { from: unknown; to: unknown }> = {}
        for (const f of changedFields) {
            approveDiff[f] = { from: snapshot[f] ?? null, to: proposed[f] ?? null }
        }
        const approveMeta = { kind: 'profile', subKind: 'change-approved', category: req.category, fields: changedFields }
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'profile_change_request',
            entityId: id,
            entityName: req.category,
            action: 'approve',
            changes: Object.keys(approveDiff).length > 0 ? approveDiff : undefined,
            metadata: approveMeta,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        // Mirror onto the employee so the applied change shows in the Updates
        // tab + the employee's My Activity, with the same from→to detail.
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: req.employeeId,
            entityName: CATEGORY_LABEL[req.category] ?? req.category,
            action: 'approve',
            changes: Object.keys(approveDiff).length > 0 ? approveDiff : undefined,
            metadata: { ...approveMeta, requestId: id },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        notifyEmployeeOwner(
            request.user.tenantId,
            req.employeeId,
            'approved',
            req.category,
            `${changedFields.length} field${changedFields.length === 1 ? '' : 's'} applied to your record.`,
        ).catch(() => { })

        const [updated] = await db
            .select()
            .from(profileChangeRequests)
            .where(eq(profileChangeRequests.id, id))
            .limit(1)
        return reply.send({ data: updated })
    })

    // POST /api/v1/profile-changes/:id/reject
    fastify.post('/:id/reject', { ...hrOnly, schema: { tags: ['Profile Changes'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const reason = String(((request.body ?? {}) as { reason?: string }).reason ?? '').trim()
        if (!reason) return reply.code(400).send(e400('Rejection reason is required'))

        const [req] = await db
            .select()
            .from(profileChangeRequests)
            .where(and(eq(profileChangeRequests.tenantId, request.user.tenantId), eq(profileChangeRequests.id, id)))
            .limit(1)
        if (!req) return reply.code(404).send(e404('Change request not found'))
        if (req.status !== 'pending') {
            return reply.code(400).send(e400('Only pending requests can be rejected'))
        }
        if (req.employeeId === request.user.employeeId) {
            return reply.code(403).send(e403('You cannot reject your own change request'))
        }

        const [updated] = await db
            .update(profileChangeRequests)
            .set({
                status: 'rejected',
                rejectionReason: reason,
                reviewedBy: request.user.id,
                reviewedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(and(eq(profileChangeRequests.tenantId, request.user.tenantId), eq(profileChangeRequests.id, id)))
            .returning()

        const rejectMeta = { kind: 'profile', subKind: 'change-rejected', category: req.category, reason }
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'profile_change_request',
            entityId: id,
            entityName: req.category,
            action: 'reject',
            metadata: rejectMeta,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        // Mirror onto the employee so the rejection shows in the Updates tab +
        // the employee's My Activity feed.
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: req.employeeId,
            entityName: CATEGORY_LABEL[req.category] ?? req.category,
            action: 'reject',
            metadata: { ...rejectMeta, requestId: id },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        notifyEmployeeOwner(request.user.tenantId, req.employeeId, 'rejected', req.category, reason)
            .catch(() => { })

        return reply.send({ data: updated })
    })

    // Mention `auth` once so the unused-import lint doesn't fire — reserved for
    // a future employee-self read endpoint when the admin app needs it.
    void auth
}
