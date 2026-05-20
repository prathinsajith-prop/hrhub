import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import {
    employees,
    orgUnits,
    profileChangeRequests,
    users,
} from '../../db/schema/index.js'
import { e400, e403, e404 } from '../../lib/errors.js'
import { parseUuidParam } from '../../lib/validation.js'
import { recordActivity } from '../../lib/audit.js'
import { notifyRequester, notifyReviewers } from '../../lib/notify.js'
import {
    canAccessEmployee,
    isDeptHead,
    isElevated,
    resolveAllowedEmployeeIds,
} from '../../lib/scoping.js'

// Fields the employee can propose changes to, grouped by category. Keep this
// allow-list explicit — anything not listed silently drops out of the
// proposed_changes payload. Add a new category here when you want to expose a
// new section in the portal's profile editor.
const EDITABLE_FIELDS: Record<string, readonly string[]> = {
    bank_details: ['bankName', 'accountName', 'accountNumber', 'iban', 'swiftCode', 'bankBranch'] as const,
    contact: ['phone', 'mobileNo', 'personalEmail'] as const,
    personal: ['emergencyContactName', 'emergencyContactPhone', 'emergencyContact', 'homeCountryAddress'] as const,
}

type Category = keyof typeof EDITABLE_FIELDS

function isValidCategory(c: string): c is Category {
    return Object.prototype.hasOwnProperty.call(EDITABLE_FIELDS, c)
}

/**
 * Filter a raw client payload to the allow-listed fields for the given
 * category and trim/normalise the values. Empty strings become explicit
 * nulls so the reviewer knows the employee wants the field cleared.
 */
function pickFields(category: Category, raw: Record<string, unknown>): Record<string, string | null> {
    const out: Record<string, string | null> = {}
    for (const f of EDITABLE_FIELDS[category]) {
        if (!(f in raw)) continue
        const v = raw[f]
        if (v === null || v === '') out[f] = null
        else if (typeof v === 'string') {
            const trimmed = v.trim()
            out[f] = trimmed === '' ? null : trimmed
        }
    }
    return out
}

/** Snapshot the current values of the same fields, for side-by-side review. */
function snapshotFields(employee: Record<string, unknown>, category: Category): Record<string, string | null> {
    const out: Record<string, string | null> = {}
    for (const f of EDITABLE_FIELDS[category]) {
        const v = employee[f]
        out[f] = v == null ? null : String(v)
    }
    return out
}

/** Return true iff at least one proposed value differs from the snapshot. */
function hasRealChange(
    proposed: Record<string, string | null>,
    snapshot: Record<string, string | null>,
): boolean {
    return Object.entries(proposed).some(([k, v]) => (snapshot[k] ?? null) !== v)
}

const CATEGORY_LABEL: Record<string, string> = {
    bank_details: 'bank details',
    contact: 'contact details',
    personal: 'personal details',
}

/** Deep-link to the admin app's employee detail page → payroll tab. */
function reviewUrl(employeeId: string | null, requestId: string): string {
    return employeeId
        ? `/employees/${employeeId}?tab=payroll&review=${requestId}`
        : `/profile-changes`
}

export default async function profileChangesRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // POST /api/v1/profile-changes — employee submits a proposed update.
    // Forced to status='pending'; existing pending requests in the same
    // category are auto-rejected so HR isn't reviewing a stale stack.
    fastify.post('/', { ...auth }, async (request: any, reply: any) => {
        const user = request.user
        if (!user.employeeId) return reply.code(400).send(e400('No employee record linked to this account'))

        const b = (request.body ?? {}) as { category?: string; changes?: Record<string, unknown> }
        const category = String(b.category ?? '')
        if (!isValidCategory(category)) {
            return reply.code(400).send(e400('Invalid or missing category'))
        }
        const changes = b.changes && typeof b.changes === 'object' ? (b.changes as Record<string, unknown>) : {}

        const proposed = pickFields(category, changes)
        if (Object.keys(proposed).length === 0) {
            return reply.code(400).send(e400('No editable fields provided for this category'))
        }

        const [employee] = await db
            .select()
            .from(employees)
            .where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, user.employeeId)))
            .limit(1)
        if (!employee) return reply.code(404).send(e404('Employee not found'))

        const snapshot = snapshotFields(employee as unknown as Record<string, unknown>, category)
        if (!hasRealChange(proposed, snapshot)) {
            return reply.code(400).send(e400('No fields changed — nothing to submit'))
        }

        // Supersede any prior pending requests for the same category. Cleaner
        // queue for HR and prevents the employee from racing multiple updates.
        await db
            .update(profileChangeRequests)
            .set({
                status: 'rejected',
                rejectionReason: 'Superseded by a newer submission',
                reviewedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(profileChangeRequests.tenantId, user.tenantId),
                    eq(profileChangeRequests.employeeId, user.employeeId),
                    eq(profileChangeRequests.category, category as any),
                    eq(profileChangeRequests.status, 'pending'),
                ),
            )

        const [created] = await db
            .insert(profileChangeRequests)
            .values({
                tenantId: user.tenantId,
                employeeId: user.employeeId,
                requestedBy: user.id,
                category: category as any,
                status: 'pending',
                proposedChanges: proposed,
                currentSnapshot: snapshot,
            })
            .returning()

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'profile_change_request',
            entityId: created.id,
            entityName: category,
            action: 'submit',
            metadata: { category, fields: Object.keys(proposed) },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        // Notify reviewers (HR + dept_head). Fire-and-forget so a
        // notification-write failure can't block the submit.
        const fields = Object.keys(proposed).length
        notifyReviewers({
            tenantId: user.tenantId,
            actorEmployeeId: user.employeeId,
            title: `${user.name ?? 'An employee'} updated their ${CATEGORY_LABEL[category] ?? 'profile'}`,
            message: `${fields} field${fields === 1 ? '' : 's'} pending review`,
            actionUrl: reviewUrl(user.employeeId, created.id),
        }).catch((err) => request.log?.warn?.({ err }, 'profile-change notification failed'))

        return reply.code(201).send({ data: created })
    })

    // GET /api/v1/profile-changes/my — full history of the current user
    fastify.get('/my', { ...auth }, async (request: any, reply: any) => {
        const user = request.user
        if (!user.employeeId) return reply.send({ data: [] })
        const rows = await db
            .select()
            .from(profileChangeRequests)
            .where(
                and(
                    eq(profileChangeRequests.tenantId, user.tenantId),
                    eq(profileChangeRequests.employeeId, user.employeeId),
                ),
            )
            .orderBy(desc(profileChangeRequests.createdAt))
        return reply.send({ data: rows })
    })

    // GET /api/v1/profile-changes/pending — reviewer queue (scoped)
    fastify.get('/pending', { ...auth }, async (request: any, reply: any) => {
        const user = request.user
        if (!isDeptHead(user) && !isElevated(user)) return reply.send({ data: [] })

        const allowed = await resolveAllowedEmployeeIds(user, request)
        if (allowed && allowed.length === 0) return reply.send({ data: [] })

        // Exclude the reviewer's own employee record from the queue — they
        // can't self-approve, and including their own submission would just
        // clutter the manager's inbox. They can still see it under /my.
        const teamIds = allowed
            ? allowed.filter((id) => id !== user.employeeId)
            : null
        if (teamIds && teamIds.length === 0) return reply.send({ data: [] })

        const employeeFilter = teamIds
            ? inArray(profileChangeRequests.employeeId, teamIds)
            : user.employeeId
              ? sql`${profileChangeRequests.employeeId} <> ${user.employeeId}`
              : sql`${profileChangeRequests.employeeId} IS NOT NULL`

        const rows = await db
            .select({
                request: profileChangeRequests,
                employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
                employeeNo: employees.employeeNo,
                // Resolved via org_units FK; legacy text column as fallback.
                employeeDepartment: sql<string | null>`COALESCE(${orgUnits.name}, ${employees.department})`,
                employeeAvatarUrl: employees.avatarUrl,
                requestedByName: users.name,
            })
            .from(profileChangeRequests)
            .leftJoin(employees, and(
                eq(employees.id, profileChangeRequests.employeeId),
                eq(employees.tenantId, user.tenantId),
            ))
            .leftJoin(orgUnits, and(
                eq(employees.departmentId, orgUnits.id),
                eq(orgUnits.tenantId, user.tenantId),
            ))
            .leftJoin(users, eq(users.id, profileChangeRequests.requestedBy))
            .where(
                and(
                    eq(profileChangeRequests.tenantId, user.tenantId),
                    eq(profileChangeRequests.status, 'pending'),
                    employeeFilter,
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

    // GET /api/v1/profile-changes/employee/:employeeId — manager viewing a team member's history
    fastify.get('/employee/:employeeId', { ...auth }, async (request: any, reply: any) => {
        const employeeId = parseUuidParam(request.params, 'employeeId', reply)
        if (!employeeId) return
        const user = request.user
        if (!(await canAccessEmployee(user, employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to view this employee'))
        }
        const rows = await db
            .select()
            .from(profileChangeRequests)
            .where(
                and(
                    eq(profileChangeRequests.tenantId, user.tenantId),
                    eq(profileChangeRequests.employeeId, employeeId),
                ),
            )
            .orderBy(desc(profileChangeRequests.createdAt))
        return reply.send({ data: rows })
    })

    // POST /api/v1/profile-changes/:id/approve
    //
    // Reviewer must:
    //   - be a dept_head or elevated role
    //   - have access to the target employee (subtree check)
    //   - NOT be approving their own submission (employee can't self-approve)
    //   - tick each proposed field as verified — the request body carries
    //     `verifiedFields: string[]` and we assert it covers every field that
    //     differs from the snapshot. This is the "checkbox verify" gate the
    //     user asked for.
    fastify.post('/:id/approve', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return
        const user = request.user
        if (!isDeptHead(user) && !isElevated(user)) {
            return reply.code(403).send(e403('Only managers can approve profile changes'))
        }

        const body = (request.body ?? {}) as { verifiedFields?: unknown; reviewerNotes?: unknown }
        const verifiedFields = Array.isArray(body.verifiedFields)
            ? body.verifiedFields.filter((v) => typeof v === 'string') as string[]
            : []
        const reviewerNotes = typeof body.reviewerNotes === 'string' ? body.reviewerNotes.trim() : null

        const [req] = await db
            .select()
            .from(profileChangeRequests)
            .where(
                and(
                    eq(profileChangeRequests.tenantId, user.tenantId),
                    eq(profileChangeRequests.id, id),
                ),
            )
            .limit(1)
        if (!req) return reply.code(404).send(e404('Change request not found'))
        if (req.status !== 'pending') {
            return reply.code(400).send(e400('Only pending requests can be approved'))
        }
        if (req.employeeId === user.employeeId) {
            return reply.code(403).send(e403('You cannot approve your own change request'))
        }
        if (!(await canAccessEmployee(user, req.employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to approve this employee\'s changes'))
        }
        if (!isValidCategory(req.category)) {
            return reply.code(400).send(e400('Unknown category'))
        }

        // ── Verification gate ─────────────────────────────────────────────
        // Every field that actually differs from the snapshot must appear in
        // verifiedFields. Reviewer ticks them off in the UI before approve
        // becomes clickable; we enforce again here for safety.
        const proposed = req.proposedChanges ?? {}
        const snapshot = req.currentSnapshot ?? {}
        const changedFields = Object.keys(proposed).filter((k) => (snapshot[k] ?? null) !== (proposed[k] ?? null))
        const allowed = new Set(EDITABLE_FIELDS[req.category])
        const verifiedSet = new Set(verifiedFields.filter((f) => allowed.has(f) && changedFields.includes(f)))
        if (changedFields.length === 0) {
            return reply.code(400).send(e400('Nothing to apply — request has no real changes'))
        }
        for (const f of changedFields) {
            if (!verifiedSet.has(f)) {
                return reply
                    .code(400)
                    .send(e400(`Please verify all changed fields before approving (missing: ${f})`))
            }
        }

        // ── Atomic apply ──────────────────────────────────────────────────
        await db.transaction(async (tx) => {
            const patch: Record<string, unknown> = { updatedAt: new Date() }
            for (const f of changedFields) patch[f] = proposed[f]
            await tx
                .update(employees)
                .set(patch as any)
                .where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, req.employeeId)))

            await tx
                .update(profileChangeRequests)
                .set({
                    status: 'approved',
                    verifiedFields: Array.from(verifiedSet),
                    reviewerNotes,
                    reviewedBy: user.id,
                    reviewedAt: new Date(),
                    rejectionReason: null,
                    updatedAt: new Date(),
                })
                .where(eq(profileChangeRequests.id, id))
        })

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'profile_change_request',
            entityId: id,
            entityName: req.category,
            action: 'approve',
            metadata: { category: req.category, fields: changedFields },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        // Tell the requester their change is live.
        notifyRequester({
            tenantId: user.tenantId,
            employeeId: req.employeeId,
            type: 'success',
            title: `Your ${CATEGORY_LABEL[req.category] ?? 'profile'} update was approved`,
            message: `${changedFields.length} field${changedFields.length === 1 ? '' : 's'} applied to your record.`,
            actionUrl: REQUESTER_URLS[req.category],
        }).catch((err) => request.log?.warn?.({ err }, 'requester notification failed'))

        const [updated] = await db
            .select()
            .from(profileChangeRequests)
            .where(eq(profileChangeRequests.id, id))
            .limit(1)
        return reply.send({ data: updated })
    })

    // POST /api/v1/profile-changes/:id/reject
    fastify.post('/:id/reject', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return
        const user = request.user
        if (!isDeptHead(user) && !isElevated(user)) {
            return reply.code(403).send(e403('Only managers can reject profile changes'))
        }

        const reason = String(((request.body ?? {}) as { reason?: string }).reason ?? '').trim()
        if (!reason) return reply.code(400).send(e400('Rejection reason is required'))

        const [req] = await db
            .select()
            .from(profileChangeRequests)
            .where(
                and(
                    eq(profileChangeRequests.tenantId, user.tenantId),
                    eq(profileChangeRequests.id, id),
                ),
            )
            .limit(1)
        if (!req) return reply.code(404).send(e404('Change request not found'))
        if (req.status !== 'pending') {
            return reply.code(400).send(e400('Only pending requests can be rejected'))
        }
        if (req.employeeId === user.employeeId) {
            return reply.code(403).send(e403('You cannot reject your own change request'))
        }
        if (!(await canAccessEmployee(user, req.employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to reject this employee\'s changes'))
        }

        const [updated] = await db
            .update(profileChangeRequests)
            .set({
                status: 'rejected',
                rejectionReason: reason,
                reviewedBy: user.id,
                reviewedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(profileChangeRequests.id, id))
            .returning()

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'profile_change_request',
            entityId: id,
            entityName: req.category,
            action: 'reject',
            metadata: { reason },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        notifyRequester({
            tenantId: user.tenantId,
            employeeId: req.employeeId,
            type: 'warning',
            title: `Your ${CATEGORY_LABEL[req.category] ?? 'profile'} update was rejected`,
            message: reason,
            actionUrl: REQUESTER_URLS[req.category],
        }).catch((err) => request.log?.warn?.({ err }, 'requester notification failed'))

        return reply.send({ data: updated })
    })
}

// Where to send the employee when they tap the notification.
const REQUESTER_URLS: Record<string, string> = {
    bank_details: '/me/payslips',
    contact: '/me/profile',
    personal: '/me/profile',
}
