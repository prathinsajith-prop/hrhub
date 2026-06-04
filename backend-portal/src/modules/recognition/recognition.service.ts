// Focused recognition service for the employee portal. Mirrors the relevant
// subset of backend/src/modules/recognition/recognition.service.ts (create,
// feed, detail, reactions, comments, points, visibility). Admin-only concerns
// (category/badge CRUD, analytics, approvals management, redemption) stay in
// the admin app. The recognition tables are shared (created by admin migrations).

import { and, desc, eq, sql, inArray, isNull, or, getTableColumns } from 'drizzle-orm'
import { db } from '../../db/client.js'
import {
    recognitions,
    recognitionRecipients,
    recognitionTeamTargets,
    recognitionDeptTargets,
    recognitionReactions,
    recognitionComments,
    recognitionCategories,
    recognitionBadges,
    recognitionPoints,
    recognitionApprovals,
    employees,
    users,
    teams,
    orgUnits,
} from '../../db/schema/index.js'

// Upper bound on points a single recognition may award. `points` comes from the
// client (any employee with give-recognition permission can submit it), so it is
// clamped to a sane integer range to protect leaderboard / points-ledger
// integrity — without it, a crafted request could award an arbitrary balance.
const MAX_RECOGNITION_POINTS = 1000
function clampPoints(value: unknown): number {
    return Math.min(MAX_RECOGNITION_POINTS, Math.max(0, Math.floor(Number(value ?? 0) || 0)))
}

// ── Types ────────────────────────────────────────────────────────────────────
export type Visibility = 'public' | 'team' | 'department' | 'branch' | 'manager' | 'hr' | 'private'
export type NominationType = 'peer' | 'manager' | 'leadership' | 'self_nomination' | 'employee_of_month'
export type Status = 'draft' | 'pending' | 'approved' | 'rejected' | 'published' | 'archived'
export type WorkflowState = 'manager_review' | 'hr_approval' | 'completed' | null
export type ReactionType = 'like' | 'celebrate' | 'love' | 'support' | 'congrats'

export interface RecognitionInput {
    categoryKey: string
    badgeKey?: string | null
    title: string
    message: string
    achievementDate?: string | null
    visibility?: Visibility
    visibilityScopeId?: string | null
    nominationType?: NominationType
    points?: number
    attachments?: Array<{ name: string; s3Key: string; size?: number; mime?: string }>
    commentsDisabled?: boolean
    recipientEmployeeIds: string[]
    teamIds?: string[]
    orgUnitIds?: string[]
}

// ── Annotation helpers (recipients / targets / reactions / comments) ──────────
async function fetchRecipientsForIds(tenantId: string, ids: string[]) {
    if (!ids.length) return new Map<string, any[]>()
    const rows = await db.select({
        recognitionId: recognitionRecipients.recognitionId,
        employeeId: recognitionRecipients.employeeId,
        isPrimary: recognitionRecipients.isPrimary,
        pointsAwarded: recognitionRecipients.pointsAwarded,
        firstName: employees.firstName,
        lastName: employees.lastName,
        email: employees.email,
        designation: employees.designation,
        department: employees.department,
        avatarUrl: employees.avatarUrl,
    })
        .from(recognitionRecipients)
        .leftJoin(employees, eq(employees.id, recognitionRecipients.employeeId))
        .where(and(eq(recognitionRecipients.tenantId, tenantId), inArray(recognitionRecipients.recognitionId, ids)))
    const map = new Map<string, any[]>()
    for (const r of rows) {
        const arr = map.get(r.recognitionId) ?? []
        const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || r.email || 'Employee'
        arr.push({ ...r, name: fullName })
        map.set(r.recognitionId, arr)
    }
    return map
}

async function fetchTeamTargetsForIds(tenantId: string, ids: string[]) {
    if (!ids.length) return new Map<string, string[]>()
    const rows = await db.select({ recognitionId: recognitionTeamTargets.recognitionId, teamId: recognitionTeamTargets.teamId })
        .from(recognitionTeamTargets)
        .where(and(eq(recognitionTeamTargets.tenantId, tenantId), inArray(recognitionTeamTargets.recognitionId, ids)))
    const map = new Map<string, string[]>()
    for (const r of rows) { const a = map.get(r.recognitionId) ?? []; a.push(r.teamId); map.set(r.recognitionId, a) }
    return map
}

async function fetchDeptTargetsForIds(tenantId: string, ids: string[]) {
    if (!ids.length) return new Map<string, string[]>()
    const rows = await db.select({ recognitionId: recognitionDeptTargets.recognitionId, orgUnitId: recognitionDeptTargets.orgUnitId })
        .from(recognitionDeptTargets)
        .where(and(eq(recognitionDeptTargets.tenantId, tenantId), inArray(recognitionDeptTargets.recognitionId, ids)))
    const map = new Map<string, string[]>()
    for (const r of rows) { const a = map.get(r.recognitionId) ?? []; a.push(r.orgUnitId); map.set(r.recognitionId, a) }
    return map
}

async function fetchReactionCounts(tenantId: string, ids: string[]) {
    const empty = () => ({ like: 0, celebrate: 0, love: 0, support: 0, congrats: 0, total: 0 })
    if (!ids.length) return new Map<string, ReturnType<typeof empty>>()
    const rows = await db.select({
        recognitionId: recognitionReactions.recognitionId,
        type: recognitionReactions.reactionType,
        count: sql<number>`COUNT(*)`.as('count'),
    })
        .from(recognitionReactions)
        .where(and(eq(recognitionReactions.tenantId, tenantId), inArray(recognitionReactions.recognitionId, ids)))
        .groupBy(recognitionReactions.recognitionId, recognitionReactions.reactionType)
    const map = new Map<string, ReturnType<typeof empty>>()
    for (const r of rows) {
        const e = map.get(r.recognitionId) ?? empty()
        const c = Number(r.count)
        ;(e as any)[r.type as ReactionType] = c
        e.total += c
        map.set(r.recognitionId, e)
    }
    return map
}

async function fetchCommentCounts(tenantId: string, ids: string[]) {
    if (!ids.length) return new Map<string, number>()
    const rows = await db.select({ recognitionId: recognitionComments.recognitionId, count: sql<number>`COUNT(*)`.as('count') })
        .from(recognitionComments)
        .where(and(eq(recognitionComments.tenantId, tenantId), inArray(recognitionComments.recognitionId, ids), isNull(recognitionComments.deletedAt)))
        .groupBy(recognitionComments.recognitionId)
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.recognitionId, Number(r.count))
    return map
}

async function fetchMyReactions(tenantId: string, ids: string[], userId: string) {
    if (!ids.length || !userId) return new Map<string, ReactionType>()
    const rows = await db.select({ recognitionId: recognitionReactions.recognitionId, type: recognitionReactions.reactionType })
        .from(recognitionReactions)
        .where(and(eq(recognitionReactions.tenantId, tenantId), eq(recognitionReactions.userId, userId), inArray(recognitionReactions.recognitionId, ids)))
    const map = new Map<string, ReactionType>()
    for (const r of rows) map.set(r.recognitionId, r.type as ReactionType)
    return map
}

async function annotate(tenantId: string, rows: any[], currentUserId: string | null) {
    if (!rows.length) return rows
    const ids = rows.map((r) => r.id)
    const [recipients, teamTargets, depts, reactions, comments, mine] = await Promise.all([
        fetchRecipientsForIds(tenantId, ids),
        fetchTeamTargetsForIds(tenantId, ids),
        fetchDeptTargetsForIds(tenantId, ids),
        fetchReactionCounts(tenantId, ids),
        fetchCommentCounts(tenantId, ids),
        currentUserId ? fetchMyReactions(tenantId, ids, currentUserId) : Promise.resolve(new Map<string, ReactionType>()),
    ])
    return rows.map((r) => ({
        ...r,
        recipients: recipients.get(r.id) ?? [],
        teamIds: teamTargets.get(r.id) ?? [],
        orgUnitIds: depts.get(r.id) ?? [],
        reactionCounts: reactions.get(r.id) ?? { like: 0, celebrate: 0, love: 0, support: 0, congrats: 0, total: 0 },
        commentCount: comments.get(r.id) ?? 0,
        myReaction: currentUserId ? (mine.get(r.id) ?? null) : null,
    }))
}

// ── Create (give recognition) ─────────────────────────────────────────────────
export async function createRecognition(
    tenantId: string,
    giverUserId: string | null,
    giverEmployeeId: string | null,
    giverName: string | null,
    input: RecognitionInput,
    requiresApproval: boolean,
) {
    const recipientIds = Array.from(new Set((input.recipientEmployeeIds ?? []).filter(Boolean)))
    if (!recipientIds.length) {
        const err = new Error('At least one recipient is required')
        ;(err as any).statusCode = 400
        throw err
    }
    const teamIds = Array.from(new Set((input.teamIds ?? []).filter(Boolean)))
    const orgUnitIds = Array.from(new Set((input.orgUnitIds ?? []).filter(Boolean)))
    const status: Status = requiresApproval ? 'pending' : 'published'
    const workflowState: WorkflowState = requiresApproval ? 'manager_review' : 'completed'
    const points = clampPoints(input.points)

    return db.transaction(async (tx) => {
        const now = new Date()
        const [row] = await tx.insert(recognitions).values({
            tenantId,
            giverUserId,
            giverEmployeeId,
            giverName,
            categoryKey: input.categoryKey,
            badgeKey: input.badgeKey ?? null,
            title: input.title,
            message: input.message,
            achievementDate: input.achievementDate ?? null,
            visibility: input.visibility ?? 'public',
            visibilityScopeId: input.visibilityScopeId ?? null,
            nominationType: input.nominationType ?? 'peer',
            points,
            attachments: input.attachments ?? [],
            status,
            workflowState,
            commentsDisabled: !!input.commentsDisabled,
            submittedAt: requiresApproval ? now : null,
            publishedAt: requiresApproval ? null : now,
            approvedAt: requiresApproval ? null : now,
        }).returning()

        await tx.insert(recognitionRecipients).values(
            recipientIds.map((employeeId, idx) => ({ tenantId, recognitionId: row.id, employeeId, isPrimary: idx === 0, pointsAwarded: points })),
        )
        if (teamIds.length) await tx.insert(recognitionTeamTargets).values(teamIds.map((teamId) => ({ tenantId, recognitionId: row.id, teamId })))
        if (orgUnitIds.length) await tx.insert(recognitionDeptTargets).values(orgUnitIds.map((orgUnitId) => ({ tenantId, recognitionId: row.id, orgUnitId })))
        if (requiresApproval) {
            await tx.insert(recognitionApprovals).values({
                tenantId, recognitionId: row.id, approverUserId: giverUserId, approverName: giverName,
                step: 'system', action: 'submit', comment: 'Submitted for approval',
            })
        }
        return row
    })
}

// ── Read: detail + feed + team feed ───────────────────────────────────────────
export async function getRecognition(tenantId: string, id: string, currentUserId: string | null) {
    const [row] = await db.select().from(recognitions)
        .where(and(eq(recognitions.id, id), eq(recognitions.tenantId, tenantId), isNull(recognitions.deletedAt)))
        .limit(1)
    if (!row) return null
    const annotated = await annotate(tenantId, [row], currentUserId)
    return annotated[0]
}

export async function listFeed(
    tenantId: string,
    currentUser: { userId: string; employeeId: string | null; role: string },
    params: { limit: number; offset: number; category?: string },
) {
    const { limit, offset } = params
    const isHr = currentUser.role === 'hr_manager' || currentUser.role === 'super_admin'
    const empId = currentUser.employeeId
    const userId = currentUser.userId

    const conds: any[] = [
        eq(recognitions.tenantId, tenantId),
        isNull(recognitions.deletedAt),
        eq(recognitions.status, 'published' as any),
    ]
    if (params.category) conds.push(eq(recognitions.categoryKey, params.category))

    const visibilityOr: any[] = [eq(recognitions.visibility, 'public' as any)]
    if (empId) {
        visibilityOr.push(eq(recognitions.giverEmployeeId, empId))
        visibilityOr.push(sql`EXISTS (SELECT 1 FROM recognition_recipients rr WHERE rr.recognition_id = ${recognitions.id} AND rr.employee_id = ${empId})`)
        visibilityOr.push(sql`(${recognitions.visibility} = 'team' AND EXISTS (
            SELECT 1 FROM recognition_team_targets rtt JOIN team_members tm ON tm.team_id = rtt.team_id
            WHERE rtt.recognition_id = ${recognitions.id} AND tm.employee_id = ${empId}))`)
        visibilityOr.push(sql`(${recognitions.visibility} = 'department' AND EXISTS (
            SELECT 1 FROM recognition_recipients rr JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognitions.id} AND e.department_id IS NOT NULL
              AND e.department_id = (SELECT department_id FROM employees WHERE id = ${empId})))`)
        visibilityOr.push(sql`(${recognitions.visibility} = 'branch' AND EXISTS (
            SELECT 1 FROM recognition_recipients rr JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognitions.id} AND e.branch_id IS NOT NULL
              AND e.branch_id = (SELECT branch_id FROM employees WHERE id = ${empId})))`)
        visibilityOr.push(sql`(${recognitions.visibility} = 'manager' AND EXISTS (
            SELECT 1 FROM recognition_recipients rr JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognitions.id} AND e.reporting_to = ${empId}))`)
    }
    if (userId) visibilityOr.push(eq(recognitions.giverUserId, userId))
    if (isHr) visibilityOr.push(sql`1=1`)
    conds.push(or(...visibilityOr))

    const rows = await db.select({ ...getTableColumns(recognitions), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(recognitions)
        .where(and(...conds))
        .orderBy(desc(recognitions.isPinned), desc(recognitions.publishedAt), desc(recognitions.createdAt))
        .limit(limit).offset(offset)
    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    const data = await annotate(tenantId, rows, userId)
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

/** Manager team feed: published recognitions whose recipients report to this manager. */
export async function listTeamFeed(
    tenantId: string,
    managerEmployeeId: string,
    currentUserId: string,
    params: { limit: number; offset: number },
) {
    const { limit, offset } = params
    const rows = await db.select({ ...getTableColumns(recognitions), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(recognitions)
        .where(and(
            eq(recognitions.tenantId, tenantId),
            isNull(recognitions.deletedAt),
            eq(recognitions.status, 'published' as any),
            sql`EXISTS (
                SELECT 1 FROM recognition_recipients rr JOIN employees e ON e.id = rr.employee_id
                WHERE rr.recognition_id = ${recognitions.id} AND e.reporting_to = ${managerEmployeeId})`,
        ))
        .orderBy(desc(recognitions.isPinned), desc(recognitions.publishedAt), desc(recognitions.createdAt))
        .limit(limit).offset(offset)
    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    const data = await annotate(tenantId, rows, currentUserId)
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

// ── Reactions ──────────────────────────────────────────────────────────────────
export async function setReaction(tenantId: string, recognitionId: string, userId: string, type: ReactionType) {
    await db.insert(recognitionReactions)
        .values({ tenantId, recognitionId, userId, reactionType: type })
        .onConflictDoUpdate({ target: [recognitionReactions.recognitionId, recognitionReactions.userId], set: { reactionType: type, createdAt: sql`now()` } })
}

export async function removeReaction(tenantId: string, recognitionId: string, userId: string) {
    await db.delete(recognitionReactions)
        .where(and(eq(recognitionReactions.tenantId, tenantId), eq(recognitionReactions.recognitionId, recognitionId), eq(recognitionReactions.userId, userId)))
}

// ── Comments ────────────────────────────────────────────────────────────────────
export async function listComments(tenantId: string, recognitionId: string) {
    return db.select().from(recognitionComments)
        .where(and(eq(recognitionComments.tenantId, tenantId), eq(recognitionComments.recognitionId, recognitionId)))
        .orderBy(recognitionComments.createdAt)
}

export async function addComment(tenantId: string, recognitionId: string, userId: string, authorName: string | null, body: string, parentId?: string | null) {
    const [row] = await db.insert(recognitionComments).values({ tenantId, recognitionId, parentId: parentId ?? null, userId, authorName, body }).returning()
    return row
}

// ── Categories / badges (read-only in the portal — for the give form) ─────────
export async function listCategories(tenantId: string) {
    return db.select().from(recognitionCategories)
        .where(and(eq(recognitionCategories.tenantId, tenantId), eq(recognitionCategories.isArchived, false)))
        .orderBy(recognitionCategories.sortOrder, recognitionCategories.label)
}

export async function listBadges(tenantId: string) {
    return db.select().from(recognitionBadges)
        .where(and(eq(recognitionBadges.tenantId, tenantId), eq(recognitionBadges.isArchived, false)))
        .orderBy(recognitionBadges.sortOrder, recognitionBadges.label)
}

// ── Points (faithful port of the atomic ledger write) ─────────────────────────
async function insertPointsAtomic(tx: any, row: {
    tenantId: string; userId: string; employeeId: string | null; recognitionId: string | null
    points: number; type: 'earned' | 'given' | 'granted' | 'redeemed' | 'reversed'; description: string; createdByUserId: string | null
}) {
    const res = await tx.execute(sql`
        WITH cur AS (
            SELECT COALESCE(SUM(CASE WHEN type IN ('earned','granted') THEN points
                                     WHEN type = 'redeemed' THEN -points ELSE 0 END), 0)::int AS available
            FROM recognition_points WHERE tenant_id = ${row.tenantId} AND user_id = ${row.userId}
        )
        INSERT INTO recognition_points
            (tenant_id, user_id, employee_id, recognition_id, points, type, description, balance_after, created_by_user_id)
        SELECT ${row.tenantId}, ${row.userId}, ${row.employeeId}, ${row.recognitionId}, ${row.points}, ${row.type}, ${row.description},
            CASE WHEN ${row.type} IN ('earned','granted') THEN cur.available + ${row.points}
                 WHEN ${row.type} = 'redeemed' THEN cur.available - ${row.points} ELSE cur.available END,
            ${row.createdByUserId}
        FROM cur RETURNING *`)
    return (((res as any).rows ?? res) as any[])[0]
}

export async function resolveRecipientUserIds(tenantId: string, employeeIds: string[]) {
    if (!employeeIds.length) return [] as Array<{ employeeId: string; userId: string }>
    const rows = await db.select({ employeeId: users.employeeId, userId: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true), inArray(users.employeeId, employeeIds)))
    return rows.filter((r) => r.employeeId).map((r) => ({ employeeId: r.employeeId as string, userId: r.userId }))
}

export async function recordRecognitionPoints(
    tenantId: string, recognitionId: string, giverUserId: string | null, giverEmployeeId: string | null,
    points: number, recipientUserIds: string[], recipientEmployeeIds: string[],
) {
    const safe = Math.max(0, Math.floor(Number(points) || 0))
    if (!safe) return
    await db.transaction(async (tx) => {
        for (let i = 0; i < recipientUserIds.length; i++) {
            const uid = recipientUserIds[i]
            if (!uid) continue
            await insertPointsAtomic(tx, {
                tenantId, userId: uid, employeeId: recipientEmployeeIds[i] ?? null, recognitionId,
                points: safe, type: 'earned', description: 'Recognition received', createdByUserId: giverUserId,
            })
        }
        if (giverUserId) {
            await tx.insert(recognitionPoints).values({
                tenantId, userId: giverUserId, employeeId: giverEmployeeId, recognitionId,
                points: safe * Math.max(1, recipientUserIds.length), type: 'given', description: 'Recognition given',
                balanceAfter: null, createdByUserId: giverUserId,
            })
        }
    })
}

// ── Tenant-scope guards ───────────────────────────────────────────────────────
export async function filterEmployeesInTenant(tenantId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return []
    const rows = await db.select({ id: employees.id }).from(employees)
        .where(and(eq(employees.tenantId, tenantId), inArray(employees.id, ids)))
    return rows.map((r) => r.id)
}

export async function filterTeamsInTenant(tenantId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return []
    const rows = await db.select({ id: teams.id }).from(teams)
        .where(and(eq(teams.tenantId, tenantId), inArray(teams.id, ids)))
    return rows.map((r) => r.id)
}

export async function filterOrgUnitsInTenant(tenantId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return []
    const rows = await db.select({ id: orgUnits.id }).from(orgUnits)
        .where(and(eq(orgUnits.tenantId, tenantId), inArray(orgUnits.id, ids)))
    return rows.map((r) => r.id)
}

/** Visibility gate for a single recognition (detail-page guard). */
export async function canViewRecognition(
    tenantId: string,
    recognition: { id: string; visibility: string; giverUserId: string | null; giverEmployeeId: string | null },
    user: { userId: string | null; employeeId: string | null; role: string },
): Promise<boolean> {
    const isHr = user.role === 'hr_manager' || user.role === 'super_admin'
    if (isHr) return true
    if (recognition.visibility === 'public') return true
    if (recognition.visibility === 'hr') return false
    if (user.userId && recognition.giverUserId === user.userId) return true
    if (user.employeeId && recognition.giverEmployeeId === user.employeeId) return true
    if (!user.employeeId) return false
    const [recip] = await db.select({ id: recognitionRecipients.id }).from(recognitionRecipients)
        .where(and(eq(recognitionRecipients.tenantId, tenantId), eq(recognitionRecipients.recognitionId, recognition.id), eq(recognitionRecipients.employeeId, user.employeeId)))
        .limit(1)
    if (recip) return true
    if (recognition.visibility === 'private') return false
    const existsRows = async (q: any) => {
        const res = await db.execute(q)
        const rows = ((res as any).rows ?? res) as any[]
        return Array.isArray(rows) && rows.length > 0
    }
    if (recognition.visibility === 'team') {
        return existsRows(sql`SELECT 1 FROM recognition_team_targets rtt JOIN team_members tm ON tm.team_id = rtt.team_id
            WHERE rtt.recognition_id = ${recognition.id} AND tm.employee_id = ${user.employeeId} LIMIT 1`)
    }
    if (recognition.visibility === 'department') {
        return existsRows(sql`SELECT 1 FROM recognition_recipients rr JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognition.id} AND e.department_id IS NOT NULL
              AND e.department_id = (SELECT department_id FROM employees WHERE id = ${user.employeeId}) LIMIT 1`)
    }
    if (recognition.visibility === 'branch') {
        return existsRows(sql`SELECT 1 FROM recognition_recipients rr JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognition.id} AND e.branch_id IS NOT NULL
              AND e.branch_id = (SELECT branch_id FROM employees WHERE id = ${user.employeeId}) LIMIT 1`)
    }
    if (recognition.visibility === 'manager') {
        return existsRows(sql`SELECT 1 FROM recognition_recipients rr JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognition.id} AND e.reporting_to = ${user.employeeId} LIMIT 1`)
    }
    return false
}
