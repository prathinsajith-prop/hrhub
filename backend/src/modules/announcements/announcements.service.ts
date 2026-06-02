import { and, desc, eq, inArray, isNull, lte, sql, getTableColumns } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
    announcements,
    announcementAudiences,
    announcementReceipts,
    employees,
    teamMembers,
} from '../../db/schema/index.js'
import { notifyEmployeesBulk } from '../notifications/notifications.service.js'
import { sendEmail } from '../../plugins/email.js'

// Max recipients we email synchronously for a Critical announcement. Beyond
// this, the in-app notification still reaches everyone; email overflow is
// logged (production should move the email fan-out to a BullMQ job).
const CRITICAL_EMAIL_CAP = 500

export type AudienceKind =
    | 'all' | 'branch' | 'division' | 'department' | 'team'
    | 'designation' | 'grade' | 'employment_type' | 'location' | 'employee'

export interface AudienceRule { kind: AudienceKind; value?: string | null }

export interface AnnouncementInput {
    title: string
    body?: string
    category?: string
    priority?: 'low' | 'normal' | 'high' | 'critical'
    pinned?: boolean
    requireAck?: boolean
    attachments?: Array<{ name: string; s3Key: string; size?: number; mime?: string }>
    publishAt?: string | null
    expireAt?: string | null
}

// ── Admin CRUD ────────────────────────────────────────────────────────────────

export async function createAnnouncement(
    tenantId: string,
    createdBy: string | null,
    authorName: string | null,
    input: AnnouncementInput,
    audiences: AudienceRule[],
) {
    const audienceType = audiences.some((a) => a.kind === 'all') || audiences.length === 0 ? 'all' : 'targeted'
    return db.transaction(async (tx) => {
        const [row] = await tx.insert(announcements).values({
            tenantId,
            title: input.title,
            body: input.body ?? '',
            category: input.category ?? 'general',
            priority: input.priority ?? 'normal',
            status: 'draft',
            audienceType,
            pinned: !!input.pinned,
            requireAck: !!input.requireAck,
            attachments: input.attachments ?? [],
            publishAt: input.publishAt ? new Date(input.publishAt) : null,
            expireAt: input.expireAt ? new Date(input.expireAt) : null,
            createdBy,
            authorName,
        }).returning()
        await writeAudiences(tx, tenantId, row.id, audienceType === 'all' ? [{ kind: 'all' }] : audiences)
        return row
    })
}

export async function updateAnnouncement(
    tenantId: string,
    id: string,
    input: Partial<AnnouncementInput>,
    audiences?: AudienceRule[],
) {
    return db.transaction(async (tx) => {
        const patch: Record<string, unknown> = { updatedAt: new Date() }
        if (input.title !== undefined) patch.title = input.title
        if (input.body !== undefined) patch.body = input.body
        if (input.category !== undefined) patch.category = input.category
        if (input.priority !== undefined) patch.priority = input.priority
        if (input.pinned !== undefined) patch.pinned = input.pinned
        if (input.requireAck !== undefined) patch.requireAck = input.requireAck
        if (input.attachments !== undefined) patch.attachments = input.attachments
        if (input.publishAt !== undefined) patch.publishAt = input.publishAt ? new Date(input.publishAt) : null
        if (input.expireAt !== undefined) patch.expireAt = input.expireAt ? new Date(input.expireAt) : null
        if (audiences) patch.audienceType = audiences.some((a) => a.kind === 'all') || audiences.length === 0 ? 'all' : 'targeted'

        const [row] = await tx.update(announcements)
            .set(patch)
            .where(and(eq(announcements.id, id), eq(announcements.tenantId, tenantId), isNull(announcements.deletedAt)))
            .returning()
        if (!row) return null
        if (audiences) {
            await tx.delete(announcementAudiences).where(eq(announcementAudiences.announcementId, id))
            await writeAudiences(tx, tenantId, id, (patch.audienceType === 'all') ? [{ kind: 'all' }] : audiences)
        }
        return row
    })
}

async function writeAudiences(tx: any, tenantId: string, announcementId: string, audiences: AudienceRule[]) {
    const rows = audiences
        .filter((a) => a.kind === 'all' || (a.value && String(a.value).trim()))
        .map((a) => ({ tenantId, announcementId, audienceKind: a.kind, audienceValue: a.kind === 'all' ? null : String(a.value) }))
    if (rows.length) await tx.insert(announcementAudiences).values(rows)
}

export async function getAnnouncement(tenantId: string, id: string) {
    const [row] = await db.select().from(announcements)
        .where(and(eq(announcements.id, id), eq(announcements.tenantId, tenantId), isNull(announcements.deletedAt)))
        .limit(1)
    if (!row) return null
    const aud = await db.select({ kind: announcementAudiences.audienceKind, value: announcementAudiences.audienceValue })
        .from(announcementAudiences).where(eq(announcementAudiences.announcementId, id))
    return { ...row, audiences: aud }
}

export async function listAnnouncements(tenantId: string, params: { status?: string; category?: string; priority?: string; q?: string; limit: number; offset: number }) {
    await processDueTransitions(tenantId)
    const { status, category, priority, q, limit, offset } = params
    const conds = [eq(announcements.tenantId, tenantId), isNull(announcements.deletedAt)]
    if (status) conds.push(eq(announcements.status, status as never))
    if (category) conds.push(eq(announcements.category, category))
    if (priority) conds.push(eq(announcements.priority, priority as never))
    if (q && q.trim()) conds.push(sql`(${announcements.title} ILIKE ${'%' + q.trim() + '%'} OR ${announcements.body} ILIKE ${'%' + q.trim() + '%'})`)

    const rows = await db.select({ ...getTableColumns(announcements), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(announcements)
        .where(and(...conds))
        .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
        .limit(limit).offset(offset)
    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return { data: rows, total, limit, offset, hasMore: offset + limit < total }
}

export async function softDeleteAnnouncement(tenantId: string, id: string) {
    const [row] = await db.update(announcements)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(announcements.id, id), eq(announcements.tenantId, tenantId), isNull(announcements.deletedAt)))
        .returning()
    return row ?? null
}

/** Transition status. On publish, stamp publishedAt (first time only). */
export async function setStatus(tenantId: string, id: string, status: 'draft' | 'scheduled' | 'published' | 'expired' | 'archived') {
    const existing = await getAnnouncement(tenantId, id)
    if (!existing) return null
    const patch: Record<string, unknown> = { status, updatedAt: new Date() }
    if (status === 'published' && !existing.publishedAt) patch.publishedAt = new Date()
    const [row] = await db.update(announcements)
        .set(patch)
        .where(and(eq(announcements.id, id), eq(announcements.tenantId, tenantId), isNull(announcements.deletedAt)))
        .returning()
    return row ?? null
}

// ── Audience resolution ───────────────────────────────────────────────────────

/**
 * Builds the SQL predicate that's true when an announcement (alias `a`) targets
 * the given employee. Used by both the employee feed (forward) and recipient
 * resolution. Null employee attributes simply never match their kind.
 */
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

async function loadEmployeeTargeting(tenantId: string, employeeId: string) {
    const [emp] = await db.select({
        id: employees.id,
        branchId: employees.branchId,
        divisionId: employees.divisionId,
        departmentId: employees.departmentId,
        gradeLevelId: employees.gradeLevelId,
        contractType: employees.contractType,
        workLocation: employees.workLocation,
        designation: employees.designation,
    }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId))).limit(1)
    if (!emp) return null
    const teams = await db.select({ teamId: teamMembers.teamId }).from(teamMembers)
        .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.employeeId, employeeId)))
    return {
        emp: {
            id: emp.id,
            branchId: emp.branchId ?? null,
            divisionId: emp.divisionId ?? null,
            departmentId: emp.departmentId ?? null,
            gradeLevelId: emp.gradeLevelId ?? null,
            contractType: (emp.contractType as string | null) ?? null,
            workLocation: emp.workLocation ?? null,
            designation: emp.designation ?? null,
        },
        teamIds: teams.map((t) => t.teamId),
    }
}

/** Employee-facing feed: published, in-window, visible-to-me. Pinned first. */
export async function listFeedForEmployee(tenantId: string, employeeId: string, params: { limit: number; offset: number; category?: string }) {
    await processDueTransitions(tenantId)
    const targeting = await loadEmployeeTargeting(tenantId, employeeId)
    if (!targeting) return { data: [], total: 0, limit: params.limit, offset: params.offset, hasMore: false }
    const match = audienceMatchSql(targeting.emp, targeting.teamIds)

    const conds = [
        eq(announcements.tenantId, tenantId),
        isNull(announcements.deletedAt),
        eq(announcements.status, 'published' as never),
        sql`(${announcements.expireAt} IS NULL OR ${announcements.expireAt} > now())`,
        match,
    ]
    if (params.category) conds.push(eq(announcements.category, params.category))

    const rows = await db.select({
        ...getTableColumns(announcements),
        totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
        readAt: announcementReceipts.readAt,
        acknowledgedAt: announcementReceipts.acknowledgedAt,
    })
        .from(announcements)
        .leftJoin(announcementReceipts, and(
            eq(announcementReceipts.announcementId, announcements.id),
            eq(announcementReceipts.employeeId, employeeId),
        ))
        .where(and(...conds))
        .orderBy(desc(announcements.pinned), desc(announcements.publishedAt), desc(announcements.createdAt))
        .limit(params.limit).offset(params.offset)
    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return { data: rows, total, limit: params.limit, offset: params.offset, hasMore: params.offset + params.limit < total }
}

/** Can this employee see this announcement? (detail-page guard) */
export async function employeeCanView(tenantId: string, employeeId: string, announcementId: string): Promise<boolean> {
    const targeting = await loadEmployeeTargeting(tenantId, employeeId)
    if (!targeting) return false
    const match = audienceMatchSql(targeting.emp, targeting.teamIds)
    const [row] = await db.select({ id: announcements.id })
        .from(announcements)
        .where(and(
            eq(announcements.id, announcementId),
            eq(announcements.tenantId, tenantId),
            isNull(announcements.deletedAt),
            eq(announcements.status, 'published' as never),
            match,
        )).limit(1)
    return !!row
}

/**
 * Resolve the distinct employee ids an announcement targets — for the publish
 * notification fan-out. One set query (no per-rule round-trips).
 */
export async function resolveRecipientEmployeeIds(tenantId: string, announcementId: string): Promise<string[]> {
    const rows = await db.execute(sql`
        SELECT DISTINCT e.id
        FROM employees e
        WHERE e.tenant_id = ${tenantId} AND e.is_archived = false AND EXISTS (
            SELECT 1 FROM announcement_audiences aa
            WHERE aa.announcement_id = ${announcementId} AND (
                aa.audience_kind = 'all'
                OR (aa.audience_kind = 'branch' AND aa.audience_value = e.branch_id::text)
                OR (aa.audience_kind = 'division' AND aa.audience_value = e.division_id::text)
                OR (aa.audience_kind = 'department' AND aa.audience_value = e.department_id::text)
                OR (aa.audience_kind = 'grade' AND aa.audience_value = e.grade_level_id::text)
                OR (aa.audience_kind = 'employment_type' AND aa.audience_value = e.contract_type)
                OR (aa.audience_kind = 'location' AND aa.audience_value = e.work_location)
                OR (aa.audience_kind = 'designation' AND aa.audience_value = e.designation)
                OR (aa.audience_kind = 'employee' AND aa.audience_value = e.id::text)
                OR (aa.audience_kind = 'team' AND EXISTS (
                    SELECT 1 FROM team_members tm WHERE tm.employee_id = e.id AND tm.team_id::text = aa.audience_value))
            )
        )`)
    const list = (rows as any).rows ?? rows
    return list.map((r: any) => r.id as string)
}

// ── Receipts (view / read / acknowledge) ──────────────────────────────────────

async function upsertReceipt(tenantId: string, announcementId: string, employeeId: string, field: 'viewedAt' | 'readAt' | 'acknowledgedAt') {
    await db.insert(announcementReceipts)
        .values({ tenantId, announcementId, employeeId, [field]: new Date() })
        .onConflictDoUpdate({
            target: [announcementReceipts.announcementId, announcementReceipts.employeeId],
            // Only stamp the field if not already set — DB-side now() avoids
            // binding a JS Date inside a raw SQL template (driver rejects it).
            set: { [field]: sql`COALESCE(${announcementReceipts[field]}, now())`, updatedAt: sql`now()` },
        })
}

export const markViewed = (t: string, a: string, e: string) => upsertReceipt(t, a, e, 'viewedAt')
export const markRead = (t: string, a: string, e: string) => upsertReceipt(t, a, e, 'readAt')
export async function acknowledge(tenantId: string, announcementId: string, employeeId: string) {
    const now = new Date()
    await db.insert(announcementReceipts)
        .values({ tenantId, announcementId, employeeId, readAt: now, acknowledgedAt: now })
        .onConflictDoUpdate({
            target: [announcementReceipts.announcementId, announcementReceipts.employeeId],
            set: { acknowledgedAt: sql`COALESCE(${announcementReceipts.acknowledgedAt}, now())`, readAt: sql`COALESCE(${announcementReceipts.readAt}, now())`, updatedAt: sql`now()` },
        })
}

/** Read/ack analytics for one announcement: targeted total + engagement counts. */
export async function getReceiptStats(tenantId: string, announcementId: string) {
    const targeted = (await resolveRecipientEmployeeIds(tenantId, announcementId)).length
    const [agg] = await db.select({
        viewed: sql<number>`COUNT(*) FILTER (WHERE ${announcementReceipts.viewedAt} IS NOT NULL)`,
        read: sql<number>`COUNT(*) FILTER (WHERE ${announcementReceipts.readAt} IS NOT NULL)`,
        acknowledged: sql<number>`COUNT(*) FILTER (WHERE ${announcementReceipts.acknowledgedAt} IS NOT NULL)`,
    }).from(announcementReceipts)
        .where(and(eq(announcementReceipts.tenantId, tenantId), eq(announcementReceipts.announcementId, announcementId)))
    const read = Number(agg?.read ?? 0)
    const acknowledged = Number(agg?.acknowledged ?? 0)
    const pct = (n: number) => (targeted > 0 ? Math.round((n / targeted) * 1000) / 10 : 0)
    return {
        targeted,
        viewed: Number(agg?.viewed ?? 0),
        read,
        acknowledged,
        readPct: pct(read),
        ackPct: pct(acknowledged),
        unread: Math.max(0, targeted - read),
        unreadPct: pct(Math.max(0, targeted - read)),
    }
}

/**
 * Flip scheduled→published whose publishAt has arrived. The `RETURNING` clause
 * yields exactly the rows this call flipped — and it's exactly-once across
 * concurrent callers: Postgres re-evaluates the `status='scheduled'` predicate
 * after locking each row, so a row already flipped by another transaction is
 * not returned again. That property is what lets us fire the publish
 * notification from whichever reader happens to trigger the transition without
 * risking duplicates.
 */
export async function publishDueScheduled(tenantId?: string): Promise<Array<{ id: string; tenantId: string; title: string; priority: string }>> {
    const rows = await db.update(announcements)
        .set({ status: 'published' as never, publishedAt: sql`COALESCE(${announcements.publishedAt}, now())`, updatedAt: sql`now()` })
        .where(and(
            eq(announcements.status, 'scheduled' as never),
            lte(announcements.publishAt, sql`now()`),
            isNull(announcements.deletedAt),
            tenantId ? eq(announcements.tenantId, tenantId) : undefined,
        ))
        .returning({ id: announcements.id, tenantId: announcements.tenantId, title: announcements.title, priority: announcements.priority })
    return rows as Array<{ id: string; tenantId: string; title: string; priority: string }>
}

/** Flip published→expired whose expireAt has passed. (The feed also filters by
 *  expireAt at query time, so this is about keeping the stored status truthful.) */
export async function expireDue(tenantId?: string): Promise<void> {
    await db.update(announcements)
        .set({ status: 'expired' as never, updatedAt: sql`now()` })
        .where(and(
            eq(announcements.status, 'published' as never),
            lte(announcements.expireAt, sql`now()`),
            isNull(announcements.deletedAt),
            tenantId ? eq(announcements.tenantId, tenantId) : undefined,
        ))
}

/** Auto-flip scheduled→published and published→expired based on the clock.
 *  Returns the announcements that were newly published (for notification). */
export async function runScheduledTransitions(tenantId?: string) {
    const published = await publishDueScheduled(tenantId)
    await expireDue(tenantId)
    return published
}

/**
 * Fan out publish notifications: in-app to every resolved recipient, plus email
 * to the first CRITICAL_EMAIL_CAP recipients when priority is critical. Shared
 * by the manual publish route and the scheduled-publish sweep. Fire-and-forget
 * at call sites — never block a request on the fan-out.
 */
export async function notifyAnnouncementPublished(
    tenantId: string,
    ann: { id: string; title: string; priority: string },
    log?: { warn?: (obj: unknown, msg?: string) => void },
): Promise<void> {
    const recipientIds = await resolveRecipientEmployeeIds(tenantId, ann.id)
    if (!recipientIds.length) return
    const critical = ann.priority === 'critical'
    await notifyEmployeesBulk(tenantId, recipientIds, {
        type: critical ? 'warning' : 'info',
        title: critical ? `Important: ${ann.title}` : ann.title,
        message: 'A new announcement has been posted.',
        actionUrl: '/me/announcements',
    })
    if (!critical) return
    const emps = await db.select({ email: employees.email, firstName: employees.firstName })
        .from(employees).where(and(eq(employees.tenantId, tenantId), inArray(employees.id, recipientIds)))
    const withEmail = emps.filter((e) => e.email)
    if (withEmail.length > CRITICAL_EMAIL_CAP) log?.warn?.({ count: withEmail.length, cap: CRITICAL_EMAIL_CAP, announcementId: ann.id }, 'critical announcement: email fan-out capped')
    for (const e of withEmail.slice(0, CRITICAL_EMAIL_CAP)) {
        const html = `<p>Hi ${e.firstName ?? ''},</p><p>A critical announcement has been posted: <strong>${ann.title}</strong>.</p><p>Please log in to the portal to read it.</p>`
        sendEmail({ to: e.email!, subject: `Important announcement: ${ann.title}`, html, tenantId }).catch(() => { })
    }
}

/**
 * Opportunistic (lazy) lifecycle sweep run at the top of every feed / admin
 * list read. Flips any due scheduled→published and published→expired rows for
 * the tenant, then detaches a publish notification for each row that just went
 * live. No Redis/worker dependency — the app stays correct even with workers
 * disabled. The notify is fire-and-forget so the read it piggybacks on is never
 * blocked, and exactly-once thanks to publishDueScheduled's RETURNING semantics.
 */
async function processDueTransitions(tenantId: string): Promise<void> {
    try {
        const published = await runScheduledTransitions(tenantId)
        for (const a of published) {
            notifyAnnouncementPublished(a.tenantId, a).catch(() => { })
        }
    } catch {
        /* never block a read on a transition sweep */
    }
}

export { inArray }
