import type { FastifyInstance } from 'fastify'
import { and, desc, eq, isNull, lte, sql, getTableColumns } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { announcements, announcementAudiences, announcementReceipts, announcementComments, employees, teamMembers, users } from '../../db/schema/index.js'
import { recordActivity } from '../../lib/audit.js'

// Employee-portal read surface for Company Announcements. HR creates/publishes
// in the admin app; here employees only read their feed + record engagement.
// Audience resolution mirrors backend/src/modules/announcements/announcements.service.ts.

/**
 * Opportunistic lifecycle sweep, run before each feed read. Employees read
 * announcements here (not the admin app), so the portal must also flip due
 * scheduled→published and published→expired rows — otherwise a scheduled
 * announcement would stay invisible until an admin happened to load the admin
 * list. Status flip only (no notification fan-out — that's the admin side's
 * job, fired on manual publish and on its own sweep). Never blocks the read.
 * Mirrors publishDueScheduled/expireDue in the admin service.
 *
 * Throttled per tenant. Every employee opening their feed previously fired
 * two UPDATEs against `announcements`, even though the rows hardly ever
 * change minute-to-minute. We cache the last sweep timestamp per tenant
 * in-process and skip the SQL pass entirely when the previous sweep is
 * fresh. The skip window is 60s — short enough that scheduled announcements
 * still appear "within a minute" of their publish time, long enough that a
 * busy tenant doesn't thrash the table on every read.
 *
 * In-memory cache is fine here: it's a hot-path optimisation, not a
 * correctness guarantee. Multiple backend instances will each run the
 * sweep at most once per 60s; a missed transition recovers on the next
 * tick. If we later move to multi-region read replicas, this can move to
 * Redis with the same TTL semantics.
 */
const SWEEP_TTL_MS = 60_000
const lastSweptAt = new Map<string, number>()

async function flipDueTransitions(tenantId: string): Promise<void> {
    const now = Date.now()
    const previous = lastSweptAt.get(tenantId) ?? 0
    if (now - previous < SWEEP_TTL_MS) return
    // Record optimistically — if the SQL pass throws we still want the
    // throttle in effect, otherwise every concurrent request would
    // re-fire it. The catch below silences failures so we don't block
    // the feed; a transient DB blip will be retried in 60s.
    lastSweptAt.set(tenantId, now)
    try {
        await db.update(announcements)
            .set({ status: 'published' as never, publishedAt: sql`COALESCE(${announcements.publishedAt}, now())`, updatedAt: sql`now()` })
            .where(and(
                eq(announcements.status, 'scheduled' as never),
                lte(announcements.publishAt, sql`now()`),
                isNull(announcements.deletedAt),
                eq(announcements.tenantId, tenantId),
            ))
        await db.update(announcements)
            .set({ status: 'expired' as never, updatedAt: sql`now()` })
            .where(and(
                eq(announcements.status, 'published' as never),
                lte(announcements.expireAt, sql`now()`),
                isNull(announcements.deletedAt),
                eq(announcements.tenantId, tenantId),
            ))
    } catch {
        /* never block the feed on a sweep */
    }
}

function audienceMatchSql(emp: {
    id: string; branchId: string | null; divisionId: string | null; departmentId: string | null
    gradeLevelId: string | null; contractType: string | null; workLocation: string | null; designation: string | null
}, teamIds: string[]) {
    const teamClause = teamIds.length
        ? sql`OR (aa.audience_kind = 'team' AND aa.audience_value IN (${sql.join(teamIds.map((t) => sql`${t}`), sql`, `)}))`
        : sql``
    return sql`EXISTS (
        SELECT 1 FROM announcement_audiences aa
        WHERE aa.announcement_id = ${announcements.id} AND (
            aa.audience_kind = 'all'
            OR (aa.audience_kind = 'branch' AND aa.audience_value = ${emp.branchId})
            OR (aa.audience_kind = 'division' AND aa.audience_value = ${emp.divisionId})
            OR (aa.audience_kind = 'department' AND aa.audience_value = ${emp.departmentId})
            OR (aa.audience_kind = 'grade' AND aa.audience_value = ${emp.gradeLevelId})
            OR (aa.audience_kind = 'employment_type' AND aa.audience_value = ${emp.contractType})
            OR (aa.audience_kind = 'location' AND aa.audience_value = ${emp.workLocation})
            OR (aa.audience_kind = 'designation' AND aa.audience_value = ${emp.designation})
            OR (aa.audience_kind = 'employee' AND aa.audience_value = ${emp.id})
            ${teamClause}
        )
    )`
}

async function loadTargeting(tenantId: string, employeeId: string) {
    const [emp] = await db.select({
        id: employees.id, branchId: employees.branchId, divisionId: employees.divisionId,
        departmentId: employees.departmentId, gradeLevelId: employees.gradeLevelId,
        contractType: employees.contractType, workLocation: employees.workLocation, designation: employees.designation,
    }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId))).limit(1)
    if (!emp) return null
    const teams = await db.select({ teamId: teamMembers.teamId }).from(teamMembers)
        .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.employeeId, employeeId)))
    return {
        emp: {
            id: emp.id, branchId: emp.branchId ?? null, divisionId: emp.divisionId ?? null,
            departmentId: emp.departmentId ?? null, gradeLevelId: emp.gradeLevelId ?? null,
            contractType: (emp.contractType as string | null) ?? null, workLocation: emp.workLocation ?? null, designation: emp.designation ?? null,
        },
        teamIds: teams.map((t) => t.teamId),
    }
}

async function ackUpsert(tenantId: string, announcementId: string, employeeId: string, ack: boolean) {
    const now = new Date()
    const setObj: Record<string, unknown> = { readAt: sql`COALESCE(${announcementReceipts.readAt}, now())`, updatedAt: sql`now()` }
    if (ack) setObj.acknowledgedAt = sql`COALESCE(${announcementReceipts.acknowledgedAt}, now())`
    await db.insert(announcementReceipts)
        .values({ tenantId, announcementId, employeeId, readAt: now, ...(ack ? { acknowledgedAt: now } : {}) })
        .onConflictDoUpdate({ target: [announcementReceipts.announcementId, announcementReceipts.employeeId], set: setObj })
}

export default async function announcementsRoutes(fastify: FastifyInstance): Promise<void> {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /announcements/feed — published, in-window, visible-to-me (paginated).
    fastify.get('/feed', { ...auth }, async (request: any, reply: any) => {
        const employeeId = request.user.employeeId
        if (!employeeId) return reply.send({ data: [], total: 0, limit: 0, offset: 0, hasMore: false })
        await flipDueTransitions(request.user.tenantId)
        const { category, kind, limit = '20', offset = '0' } = (request.query ?? {}) as Record<string, string>
        const targeting = await loadTargeting(request.user.tenantId, employeeId)
        if (!targeting) return reply.send({ data: [], total: 0, limit: 0, offset: 0, hasMore: false })
        const lim = Math.min(Number(limit) || 20, 50), off = Number(offset) || 0
        const conds = [
            eq(announcements.tenantId, request.user.tenantId),
            isNull(announcements.deletedAt),
            eq(announcements.status, 'published' as never),
            sql`(${announcements.expireAt} IS NULL OR ${announcements.expireAt} > now())`,
            audienceMatchSql(targeting.emp, targeting.teamIds),
        ]
        if (category) conds.push(eq(announcements.category, category))
        // Optional kind filter powers the portal's two-tab split: the
        // Announcements tab requests kind=announcement, the Posts tab kind=post.
        // Omitted = both (the unified home feed).
        if (kind === 'announcement' || kind === 'post') conds.push(eq(announcements.kind, kind as never))
        const rows = await db.select({
            ...getTableColumns(announcements),
            totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
            readAt: announcementReceipts.readAt,
            acknowledgedAt: announcementReceipts.acknowledgedAt,
        })
            .from(announcements)
            .leftJoin(announcementReceipts, and(eq(announcementReceipts.announcementId, announcements.id), eq(announcementReceipts.employeeId, employeeId)))
            .where(and(...conds))
            .orderBy(desc(announcements.pinned), desc(announcements.publishedAt), desc(announcements.createdAt))
            .limit(lim).offset(off)
        const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
        return reply.send({ data: rows, total, limit: lim, offset: off, hasMore: off + lim < total })
    })

    async function canView(tenantId: string, employeeId: string, id: string): Promise<boolean> {
        const targeting = await loadTargeting(tenantId, employeeId)
        if (!targeting) return false
        const [row] = await db.select({ id: announcements.id }).from(announcements)
            .where(and(eq(announcements.id, id), eq(announcements.tenantId, tenantId), isNull(announcements.deletedAt),
                eq(announcements.status, 'published' as never), audienceMatchSql(targeting.emp, targeting.teamIds))).limit(1)
        return !!row
    }

    // GET /announcements/feed/:id — detail (auto-marks read).
    fastify.get('/feed/:id', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const employeeId = request.user.employeeId
        if (!employeeId || !(await canView(request.user.tenantId, employeeId, id))) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        }
        const [row] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1)
        ackUpsert(request.user.tenantId, id, employeeId, false).catch(() => { })
        return reply.send({ data: row })
    })

    fastify.post('/:id/read', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        if (!request.user.employeeId) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'No employee record linked' })
        await ackUpsert(request.user.tenantId, id, request.user.employeeId, false)
        return reply.send({ data: { ok: true } })
    })

    fastify.post('/:id/acknowledge', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const employeeId = request.user.employeeId
        if (!employeeId || !(await canView(request.user.tenantId, employeeId, id))) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        }
        await ackUpsert(request.user.tenantId, id, employeeId, true)
        const [ann] = await db.select({ title: announcements.title }).from(announcements).where(eq(announcements.id, id)).limit(1)
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: employeeId, entityName: ann?.title ?? 'Announcement', action: 'acknowledge',
            metadata: { kind: 'announcement', subKind: 'acknowledge', announcementId: id }, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: { ok: true } })
    })

    // ── Comments ────────────────────────────────────────────────────────────
    //
    // List + post comments on an announcement. The audience gate runs
    // first so an employee who can't see the announcement can't see its
    // thread either (and can't seed it with their own reply, which would
    // leak existence back to legitimate viewers). Soft-deleted rows are
    // filtered out of the list so moderation hides them without losing
    // the audit trail in the DB.

    fastify.get('/:id/comments', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const employeeId = request.user.employeeId
        if (!employeeId || !(await canView(request.user.tenantId, employeeId, id))) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        }
        const rows = await db.select().from(announcementComments)
            .where(and(
                eq(announcementComments.tenantId, request.user.tenantId),
                eq(announcementComments.announcementId, id),
                isNull(announcementComments.deletedAt),
            ))
            .orderBy(announcementComments.createdAt)
        return reply.send({ data: rows })
    })

    fastify.post('/:id/comments', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const employeeId = request.user.employeeId
        if (!employeeId || !(await canView(request.user.tenantId, employeeId, id))) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        }
        const rawBody = (request.body as any)?.body
        const body = typeof rawBody === 'string' ? rawBody.trim() : ''
        if (!body) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Comment body is required' })
        }
        // Cap comment length so the input field can't be used to seed
        // multi-megabyte rows. 4 KB is plenty for a thread comment.
        if (body.length > 4000) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Comment is too long (max 4000 characters)' })
        }
        const parentIdRaw = (request.body as any)?.parentId
        const parentId = typeof parentIdRaw === 'string' && parentIdRaw ? parentIdRaw : null
        const [row] = await db.insert(announcementComments).values({
            tenantId: request.user.tenantId,
            announcementId: id,
            parentId,
            userId: request.user.id ?? null,
            authorName: request.user.name ?? null,
            body,
        }).returning()
        const [ann] = await db.select({ title: announcements.title }).from(announcements).where(eq(announcements.id, id)).limit(1)
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'announcement', entityId: id, entityName: ann?.title ?? 'Announcement', action: 'create',
            metadata: { kind: 'announcement', subKind: 'comment', commentId: row.id }, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: row })
    })

    // ── Employee posts ────────────────────────────────────────────────────────
    //
    // Employees with the `portalPostEnabled` permission (set per-user in the
    // admin Manage Access screen, OFF by default) can publish their own posts
    // into the feed. A post is stored as an announcement authored by the
    // employee — title is empty (it's a social post, not an official notice),
    // category 'general', audience 'all', published immediately. The matching
    // `announcement_audiences` row (kind 'all') is REQUIRED or the feed's
    // audience filter would never surface it. Authors may edit/delete only
    // their own posts; the ownership check (`created_by = me`) means this can
    // never touch HR-authored announcements even with the permission on.

    /** Gate: 403 unless the signed-in user has post-creation permission. */
    async function assertCanPost(request: any, reply: any): Promise<boolean> {
        const [row] = await db.select({ enabled: users.portalPostEnabled })
            .from(users).where(eq(users.id, request.user.id)).limit(1)
        if (!row?.enabled) {
            reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You do not have permission to create posts' })
            return false
        }
        return true
    }

    /**
     * Load a post the signed-in user OWNS, or send the right error and return
     * null. Centralises the gate shared by edit / delete / pin so the three
     * mutating routes can't drift apart: 404 if the row is gone (or not in this
     * tenant), 403 if it exists but `created_by` isn't the caller. The
     * ownership check means none of these can ever touch an HR-authored
     * announcement, even for a user holding the post permission.
     */
    async function loadOwnedPost(request: any, reply: any, id: string): Promise<{ createdBy: string | null } | null> {
        const [existing] = await db.select({ createdBy: announcements.createdBy }).from(announcements)
            .where(and(eq(announcements.id, id), eq(announcements.tenantId, request.user.tenantId), isNull(announcements.deletedAt))).limit(1)
        if (!existing) {
            reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Post not found' })
            return null
        }
        if (existing.createdBy !== request.user.id) {
            reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only modify your own posts' })
            return null
        }
        return existing
    }

    // Employee posts are plain social text (the portal composer is a <textarea>)
    // and are rendered as React-escaped text on the home feed (whitespace-pre-
    // line) and through DOMPurify on the Announcements page. The body is stored
    // verbatim — no server-side HTML transform — so it survives losslessly for
    // the text renderer; XSS is neutralised at the DOMPurify render sink.
    function readPostBody(request: any, reply: any): string | null {
        const raw = (request.body as any)?.body
        const body = typeof raw === 'string' ? raw.trim() : ''
        if (!body) {
            reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Post content is required' })
            return null
        }
        if (body.length > 5000) {
            reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Post is too long (max 5000 characters)' })
            return null
        }
        return body
    }

    // POST /announcements — create a post (published immediately, company-wide).
    fastify.post('/', { ...auth }, async (request: any, reply: any) => {
        if (!(await assertCanPost(request, reply))) return
        const body = readPostBody(request, reply)
        if (body === null) return
        const row = await db.transaction(async (tx) => {
            const [ann] = await tx.insert(announcements).values({
                tenantId: request.user.tenantId,
                title: '',
                body,
                category: 'general',
                kind: 'post' as never,
                priority: 'normal' as never,
                status: 'published' as never,
                audienceType: 'all' as never,
                publishedAt: new Date(),
                createdBy: request.user.id ?? null,
                authorName: request.user.name ?? null,
            }).returning()
            await tx.insert(announcementAudiences).values({
                tenantId: request.user.tenantId, announcementId: ann.id, audienceKind: 'all' as never, audienceValue: null,
            })
            return ann
        })
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'announcement', entityId: row.id, entityName: body.slice(0, 80), action: 'create',
            metadata: { kind: 'post' }, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: { ...row, readAt: null, acknowledgedAt: null } })
    })

    // PATCH /announcements/:id — edit your own post.
    fastify.patch('/:id', { ...auth }, async (request: any, reply: any) => {
        if (!(await assertCanPost(request, reply))) return
        const { id } = request.params as { id: string }
        if (!(await loadOwnedPost(request, reply, id))) return
        const body = readPostBody(request, reply)
        if (body === null) return
        const [row] = await db.update(announcements).set({ body, updatedAt: new Date() })
            .where(and(eq(announcements.id, id), eq(announcements.tenantId, request.user.tenantId))).returning()
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'announcement', entityId: id, entityName: body.slice(0, 80), action: 'update',
            metadata: { kind: 'post' }, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: row })
    })

    // PATCH /announcements/:id/pin — pin or unpin your own post. Pinned posts
    // sort to the top of every recipient's feed (the feed orders by
    // `pinned DESC`), so this is a deliberately owner-only action: it can only
    // move YOUR post, never an HR announcement. Body `{ pinned: boolean }`;
    // defaults to pinning when omitted so a bare POST-style call still does
    // the obvious thing.
    fastify.patch('/:id/pin', { ...auth }, async (request: any, reply: any) => {
        if (!(await assertCanPost(request, reply))) return
        const { id } = request.params as { id: string }
        if (!(await loadOwnedPost(request, reply, id))) return
        const raw = (request.body as any)?.pinned
        const pinned = typeof raw === 'boolean' ? raw : true
        const [row] = await db.update(announcements).set({ pinned, updatedAt: new Date() })
            .where(and(eq(announcements.id, id), eq(announcements.tenantId, request.user.tenantId))).returning()
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'announcement', entityId: id, entityName: (row?.body ?? 'Post').slice(0, 80), action: 'update',
            metadata: { kind: 'post', subKind: pinned ? 'pin' : 'unpin' }, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: row })
    })

    // DELETE /announcements/:id — delete (soft) your own post.
    fastify.delete('/:id', { ...auth }, async (request: any, reply: any) => {
        if (!(await assertCanPost(request, reply))) return
        const { id } = request.params as { id: string }
        if (!(await loadOwnedPost(request, reply, id))) return
        await db.update(announcements).set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(announcements.id, id), eq(announcements.tenantId, request.user.tenantId)))
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'announcement', entityId: id, entityName: 'Post', action: 'delete',
            metadata: { kind: 'post' }, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: { ok: true } })
    })
}
