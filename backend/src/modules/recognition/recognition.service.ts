import { and, desc, eq, sql, inArray, isNull, or, getTableColumns } from 'drizzle-orm'
import { db } from '../../db/index.js'
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

// ── Types ────────────────────────────────────────────────────────────────────

export type Visibility = 'public' | 'team' | 'department' | 'branch' | 'manager' | 'hr' | 'private'
export type NominationType = 'peer' | 'manager' | 'leadership' | 'self_nomination' | 'employee_of_month'
export type Status = 'draft' | 'pending' | 'approved' | 'rejected' | 'published' | 'archived'
export type WorkflowState = 'manager_review' | 'hr_approval' | 'completed' | null
export type ReactionType = 'like' | 'celebrate' | 'love' | 'support' | 'congrats'
export type BadgeLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
export type ApprovalStep = 'manager' | 'hr' | 'system'
export type ApprovalAction = 'approve' | 'reject' | 'hold' | 'return' | 'submit' | 'publish'

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

export interface ListParams {
    status?: string
    category?: string
    visibility?: string
    q?: string
    dateFrom?: string
    dateTo?: string
    recipientId?: string
    giverId?: string
    limit: number
    offset: number
}

export interface CategoryInput {
    key: string
    label: string
    description?: string | null
    icon?: string
    color?: string
    sortOrder?: number
}

export interface BadgeInput {
    key: string
    label: string
    description?: string | null
    icon?: string
    color?: string
    level: BadgeLevel
    categoryKey?: string | null
    defaultPoints?: number
    sortOrder?: number
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES: Array<{ key: string; label: string; description: string; icon: string; color: string; sortOrder: number }> = [
    { key: 'great_work', label: 'Great Work', description: 'Outstanding work delivered with quality and care', icon: 'award', color: '#6366f1', sortOrder: 1 },
    { key: 'above_and_beyond', label: 'Above & Beyond', description: 'Going the extra mile for the team or customer', icon: 'sparkles', color: '#f59e0b', sortOrder: 2 },
    { key: 'helping_hand', label: 'Helping Hand', description: 'Helping a colleague when they needed it most', icon: 'hand-heart', color: '#ef4444', sortOrder: 3 },
    { key: 'innovation', label: 'Innovation', description: 'Bringing a new idea, tool, or process to life', icon: 'lightbulb', color: '#eab308', sortOrder: 4 },
    { key: 'leadership', label: 'Leadership', description: 'Demonstrating leadership in word and action', icon: 'crown', color: '#a855f7', sortOrder: 5 },
    { key: 'team_player', label: 'Team Player', description: 'Embodying the spirit of teamwork', icon: 'users', color: '#0ea5e9', sortOrder: 6 },
    { key: 'customer_excellence', label: 'Customer Excellence', description: 'Delighting a customer above expectations', icon: 'smile', color: '#10b981', sortOrder: 7 },
    { key: 'problem_solver', label: 'Problem Solver', description: 'Untangling a complex problem with clarity', icon: 'puzzle', color: '#8b5cf6', sortOrder: 8 },
    { key: 'outstanding_performance', label: 'Outstanding Performance', description: 'Hitting targets and exceeding the bar', icon: 'star', color: '#f97316', sortOrder: 9 },
    { key: 'knowledge_sharing', label: 'Knowledge Sharing', description: 'Teaching, mentoring, sharing what you know', icon: 'book-open', color: '#14b8a6', sortOrder: 10 },
    { key: 'collaboration', label: 'Collaboration', description: 'Cross-functional collaboration done well', icon: 'handshake', color: '#06b6d4', sortOrder: 11 },
    { key: 'employee_of_the_month', label: 'Employee of the Month', description: 'The standout contributor of the month', icon: 'trophy', color: '#dc2626', sortOrder: 12 },
]

export const DEFAULT_BADGES: Array<{ key: string; label: string; description: string; icon: string; color: string; level: BadgeLevel; categoryKey: string | null; defaultPoints: number; sortOrder: number }> = [
    { key: 'gold_star', label: 'Gold Star', description: 'A shining performer this period', icon: 'star', color: '#facc15', level: 'gold', categoryKey: 'great_work', defaultPoints: 50, sortOrder: 1 },
    { key: 'team_champion', label: 'Team Champion', description: 'A pillar of the team', icon: 'users', color: '#0ea5e9', level: 'gold', categoryKey: 'team_player', defaultPoints: 50, sortOrder: 2 },
    { key: 'innovation_award', label: 'Innovation Award', description: 'Brought a fresh idea to fruition', icon: 'lightbulb', color: '#eab308', level: 'silver', categoryKey: 'innovation', defaultPoints: 30, sortOrder: 3 },
    { key: 'leadership_award', label: 'Leadership Award', description: 'Led with vision and integrity', icon: 'crown', color: '#a855f7', level: 'gold', categoryKey: 'leadership', defaultPoints: 50, sortOrder: 4 },
    { key: 'excellence_award', label: 'Excellence Award', description: 'Exceptional achievement worthy of platinum', icon: 'trophy', color: '#e5e7eb', level: 'platinum', categoryKey: 'outstanding_performance', defaultPoints: 100, sortOrder: 5 },
    { key: 'helping_hand_badge', label: 'Helping Hand', description: 'Lifted others when it mattered', icon: 'hand-heart', color: '#ef4444', level: 'bronze', categoryKey: 'helping_hand', defaultPoints: 15, sortOrder: 6 },
    { key: 'customer_hero', label: 'Customer Hero', description: 'Made a customer\'s day', icon: 'smile', color: '#10b981', level: 'silver', categoryKey: 'customer_excellence', defaultPoints: 30, sortOrder: 7 },
    { key: 'problem_solver_badge', label: 'Problem Solver', description: 'Solved what others could not', icon: 'puzzle', color: '#8b5cf6', level: 'silver', categoryKey: 'problem_solver', defaultPoints: 30, sortOrder: 8 },
    { key: 'mentor_badge', label: 'Mentor', description: 'Guided and developed colleagues', icon: 'book-open', color: '#14b8a6', level: 'silver', categoryKey: 'knowledge_sharing', defaultPoints: 30, sortOrder: 9 },
    { key: 'rising_star', label: 'Rising Star', description: 'A promising trajectory worth celebrating', icon: 'sparkles', color: '#f59e0b', level: 'bronze', categoryKey: 'great_work', defaultPoints: 15, sortOrder: 10 },
    { key: 'employee_of_month', label: 'Employee of the Month', description: 'The month\'s standout contributor', icon: 'trophy', color: '#dc2626', level: 'platinum', categoryKey: 'employee_of_the_month', defaultPoints: 100, sortOrder: 11 },
    { key: 'top_contributor', label: 'Top Contributor', description: 'Among the highest-impact contributors', icon: 'award', color: '#6366f1', level: 'gold', categoryKey: 'outstanding_performance', defaultPoints: 50, sortOrder: 12 },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(value: string | null | undefined): Date | null {
    if (!value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
}

function periodSql(periodDays: number) {
    const days = Math.max(1, Math.min(periodDays, 365))
    return sql`now() - (${days} || ' days')::interval`
}

async function fetchRecipientsForIds(tenantId: string, recognitionIds: string[]) {
    if (!recognitionIds.length) return new Map<string, any[]>()
    const rows = await db
        .select({
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
        .where(and(eq(recognitionRecipients.tenantId, tenantId), inArray(recognitionRecipients.recognitionId, recognitionIds)))
    const map = new Map<string, any[]>()
    for (const r of rows) {
        const arr = map.get(r.recognitionId) ?? []
        const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || r.email || 'Employee'
        arr.push({ ...r, name: fullName })
        map.set(r.recognitionId, arr)
    }
    return map
}

async function fetchTeamTargetsForIds(tenantId: string, recognitionIds: string[]) {
    if (!recognitionIds.length) return new Map<string, string[]>()
    const rows = await db
        .select({ recognitionId: recognitionTeamTargets.recognitionId, teamId: recognitionTeamTargets.teamId })
        .from(recognitionTeamTargets)
        .where(and(eq(recognitionTeamTargets.tenantId, tenantId), inArray(recognitionTeamTargets.recognitionId, recognitionIds)))
    const map = new Map<string, string[]>()
    for (const r of rows) {
        const arr = map.get(r.recognitionId) ?? []
        arr.push(r.teamId)
        map.set(r.recognitionId, arr)
    }
    return map
}

async function fetchDeptTargetsForIds(tenantId: string, recognitionIds: string[]) {
    if (!recognitionIds.length) return new Map<string, string[]>()
    const rows = await db
        .select({ recognitionId: recognitionDeptTargets.recognitionId, orgUnitId: recognitionDeptTargets.orgUnitId })
        .from(recognitionDeptTargets)
        .where(and(eq(recognitionDeptTargets.tenantId, tenantId), inArray(recognitionDeptTargets.recognitionId, recognitionIds)))
    const map = new Map<string, string[]>()
    for (const r of rows) {
        const arr = map.get(r.recognitionId) ?? []
        arr.push(r.orgUnitId)
        map.set(r.recognitionId, arr)
    }
    return map
}

async function fetchReactionCounts(tenantId: string, recognitionIds: string[]) {
    if (!recognitionIds.length) return new Map<string, { like: number; celebrate: number; love: number; support: number; congrats: number; total: number }>()
    const rows = await db
        .select({
            recognitionId: recognitionReactions.recognitionId,
            type: recognitionReactions.reactionType,
            count: sql<number>`COUNT(*)`.as('count'),
        })
        .from(recognitionReactions)
        .where(and(eq(recognitionReactions.tenantId, tenantId), inArray(recognitionReactions.recognitionId, recognitionIds)))
        .groupBy(recognitionReactions.recognitionId, recognitionReactions.reactionType)
    const map = new Map<string, { like: number; celebrate: number; love: number; support: number; congrats: number; total: number }>()
    for (const r of rows) {
        const existing = map.get(r.recognitionId) ?? { like: 0, celebrate: 0, love: 0, support: 0, congrats: 0, total: 0 }
        const c = Number(r.count)
        const t = r.type as ReactionType
        if (t === 'like') existing.like = c
        else if (t === 'celebrate') existing.celebrate = c
        else if (t === 'love') existing.love = c
        else if (t === 'support') existing.support = c
        else if (t === 'congrats') existing.congrats = c
        existing.total += c
        map.set(r.recognitionId, existing)
    }
    return map
}

async function fetchCommentCounts(tenantId: string, recognitionIds: string[]) {
    if (!recognitionIds.length) return new Map<string, number>()
    const rows = await db
        .select({
            recognitionId: recognitionComments.recognitionId,
            count: sql<number>`COUNT(*)`.as('count'),
        })
        .from(recognitionComments)
        .where(and(
            eq(recognitionComments.tenantId, tenantId),
            inArray(recognitionComments.recognitionId, recognitionIds),
            isNull(recognitionComments.deletedAt),
        ))
        .groupBy(recognitionComments.recognitionId)
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.recognitionId, Number(r.count))
    return map
}

async function fetchMyReactions(tenantId: string, recognitionIds: string[], userId: string) {
    if (!recognitionIds.length || !userId) return new Map<string, ReactionType>()
    const rows = await db
        .select({ recognitionId: recognitionReactions.recognitionId, type: recognitionReactions.reactionType })
        .from(recognitionReactions)
        .where(and(
            eq(recognitionReactions.tenantId, tenantId),
            eq(recognitionReactions.userId, userId),
            inArray(recognitionReactions.recognitionId, recognitionIds),
        ))
    const map = new Map<string, ReactionType>()
    for (const r of rows) map.set(r.recognitionId, r.type as ReactionType)
    return map
}

async function annotateRecognitions(tenantId: string, rows: any[], currentUserId: string | null) {
    if (!rows.length) return rows
    const ids = rows.map((r) => r.id)
    const [recipients, teams, depts, reactions, comments, mine] = await Promise.all([
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
        teamIds: teams.get(r.id) ?? [],
        orgUnitIds: depts.get(r.id) ?? [],
        reactionCounts: reactions.get(r.id) ?? { like: 0, celebrate: 0, love: 0, support: 0, congrats: 0, total: 0 },
        commentCount: comments.get(r.id) ?? 0,
        myReaction: currentUserId ? (mine.get(r.id) ?? null) : null,
    }))
}

// ── Recognitions: CRUD & lifecycle ───────────────────────────────────────────

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
    const points = Math.max(0, Number(input.points ?? 0) || 0)

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

        // Recipients (first one is primary)
        await tx.insert(recognitionRecipients).values(
            recipientIds.map((employeeId, idx) => ({
                tenantId,
                recognitionId: row.id,
                employeeId,
                isPrimary: idx === 0,
                pointsAwarded: points,
            })),
        )

        if (teamIds.length) {
            await tx.insert(recognitionTeamTargets).values(
                teamIds.map((teamId) => ({ tenantId, recognitionId: row.id, teamId })),
            )
        }
        if (orgUnitIds.length) {
            await tx.insert(recognitionDeptTargets).values(
                orgUnitIds.map((orgUnitId) => ({ tenantId, recognitionId: row.id, orgUnitId })),
            )
        }

        // Approval trail entry on submit
        if (requiresApproval) {
            await tx.insert(recognitionApprovals).values({
                tenantId,
                recognitionId: row.id,
                approverUserId: giverUserId,
                approverName: giverName,
                step: 'system',
                action: 'submit',
                comment: 'Submitted for approval',
            })
        }

        return row
    })
}

export async function updateRecognition(
    tenantId: string,
    id: string,
    patch: Partial<RecognitionInput>,
) {
    return db.transaction(async (tx) => {
        const updates: Record<string, unknown> = { updatedAt: new Date() }
        if (patch.categoryKey !== undefined) updates.categoryKey = patch.categoryKey
        if (patch.badgeKey !== undefined) updates.badgeKey = patch.badgeKey
        if (patch.title !== undefined) updates.title = patch.title
        if (patch.message !== undefined) updates.message = patch.message
        if (patch.achievementDate !== undefined) updates.achievementDate = patch.achievementDate
        if (patch.visibility !== undefined) updates.visibility = patch.visibility
        if (patch.visibilityScopeId !== undefined) updates.visibilityScopeId = patch.visibilityScopeId
        if (patch.nominationType !== undefined) updates.nominationType = patch.nominationType
        if (patch.points !== undefined) updates.points = Math.max(0, Number(patch.points) || 0)
        if (patch.attachments !== undefined) updates.attachments = patch.attachments
        if (patch.commentsDisabled !== undefined) updates.commentsDisabled = patch.commentsDisabled

        const [row] = await tx.update(recognitions)
            .set(updates)
            .where(and(
                eq(recognitions.id, id),
                eq(recognitions.tenantId, tenantId),
                isNull(recognitions.deletedAt),
            ))
            .returning()
        if (!row) return null

        if (patch.recipientEmployeeIds) {
            const ids = Array.from(new Set(patch.recipientEmployeeIds.filter(Boolean)))
            // Guard: refusing an empty list prevents orphaning a recognition
            // with no recipients. Caller must explicitly pass at least one.
            if (!ids.length) {
                const err = new Error('At least one recipient is required')
                ;(err as any).statusCode = 400
                throw err
            }
            await tx.delete(recognitionRecipients).where(eq(recognitionRecipients.recognitionId, id))
            await tx.insert(recognitionRecipients).values(
                ids.map((employeeId, idx) => ({
                    tenantId,
                    recognitionId: id,
                    employeeId,
                    isPrimary: idx === 0,
                    pointsAwarded: row.points,
                })),
            )
        }
        if (patch.teamIds) {
            await tx.delete(recognitionTeamTargets).where(eq(recognitionTeamTargets.recognitionId, id))
            const ids = Array.from(new Set(patch.teamIds.filter(Boolean)))
            if (ids.length) {
                await tx.insert(recognitionTeamTargets).values(
                    ids.map((teamId) => ({ tenantId, recognitionId: id, teamId })),
                )
            }
        }
        if (patch.orgUnitIds) {
            await tx.delete(recognitionDeptTargets).where(eq(recognitionDeptTargets.recognitionId, id))
            const ids = Array.from(new Set(patch.orgUnitIds.filter(Boolean)))
            if (ids.length) {
                await tx.insert(recognitionDeptTargets).values(
                    ids.map((orgUnitId) => ({ tenantId, recognitionId: id, orgUnitId })),
                )
            }
        }

        return row
    })
}

export async function softDeleteRecognition(tenantId: string, id: string) {
    const [row] = await db.update(recognitions)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(
            eq(recognitions.id, id),
            eq(recognitions.tenantId, tenantId),
            isNull(recognitions.deletedAt),
        ))
        .returning()
    return row ?? null
}

export async function getRecognition(tenantId: string, id: string, currentUserId: string | null) {
    const [row] = await db.select().from(recognitions)
        .where(and(
            eq(recognitions.id, id),
            eq(recognitions.tenantId, tenantId),
            isNull(recognitions.deletedAt),
        ))
        .limit(1)
    if (!row) return null
    const annotated = await annotateRecognitions(tenantId, [row], currentUserId)
    return annotated[0]
}

export async function listRecognitions(tenantId: string, params: ListParams) {
    const { status, category, visibility, q, dateFrom, dateTo, recipientId, giverId, limit, offset } = params
    const conds: any[] = [
        eq(recognitions.tenantId, tenantId),
        isNull(recognitions.deletedAt),
    ]
    if (status) conds.push(eq(recognitions.status, status as any))
    if (category) conds.push(eq(recognitions.categoryKey, category))
    if (visibility) conds.push(eq(recognitions.visibility, visibility as any))
    if (q && q.trim()) {
        const term = '%' + q.trim() + '%'
        conds.push(sql`(${recognitions.title} ILIKE ${term} OR ${recognitions.message} ILIKE ${term})`)
    }
    const from = parseDate(dateFrom ?? null)
    const to = parseDate(dateTo ?? null)
    if (from) conds.push(sql`${recognitions.createdAt} >= ${from}`)
    if (to) conds.push(sql`${recognitions.createdAt} <= ${to}`)
    if (giverId) conds.push(eq(recognitions.giverEmployeeId, giverId))
    if (recipientId) {
        conds.push(sql`EXISTS (
            SELECT 1 FROM recognition_recipients rr
            WHERE rr.recognition_id = ${recognitions.id} AND rr.employee_id = ${recipientId}
        )`)
    }

    const rows = await db.select({
        ...getTableColumns(recognitions),
        totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
    })
        .from(recognitions)
        .where(and(...conds))
        .orderBy(desc(recognitions.isPinned), desc(recognitions.createdAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    const data = await annotateRecognitions(tenantId, rows, null)
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

export async function listFeed(
    tenantId: string,
    currentUser: { userId: string; employeeId: string | null; role: string; departmentId?: string | null; department?: string | null },
    params: { limit: number; offset: number },
) {
    const { limit, offset } = params
    const isHr = currentUser.role === 'hr_manager' || currentUser.role === 'super_admin'

    // Build visibility predicate based on the current user.
    const conds: any[] = [
        eq(recognitions.tenantId, tenantId),
        isNull(recognitions.deletedAt),
        eq(recognitions.status, 'published' as any),
    ]

    // Visibility: public always; private/team/department/manager/hr — gate via subquery.
    // We OR several conditions together; each branch is matched per row.
    const empId = currentUser.employeeId
    const userId = currentUser.userId
    const visibilityOr: any[] = [
        eq(recognitions.visibility, 'public' as any),
    ]
    if (empId) {
        // Giver/recipient always see their own
        visibilityOr.push(eq(recognitions.giverEmployeeId, empId))
        visibilityOr.push(sql`EXISTS (
            SELECT 1 FROM recognition_recipients rr
            WHERE rr.recognition_id = ${recognitions.id} AND rr.employee_id = ${empId}
        )`)
        // Team: visible if user is a member of any team target
        visibilityOr.push(sql`(${recognitions.visibility} = 'team' AND EXISTS (
            SELECT 1 FROM recognition_team_targets rtt
            JOIN team_members tm ON tm.team_id = rtt.team_id
            WHERE rtt.recognition_id = ${recognitions.id} AND tm.employee_id = ${empId}
        ))`)
        // Department: visible if any recipient shares department with current employee
        visibilityOr.push(sql`(${recognitions.visibility} = 'department' AND EXISTS (
            SELECT 1 FROM recognition_recipients rr
            JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognitions.id}
              AND e.department_id IS NOT NULL
              AND e.department_id = (SELECT department_id FROM employees WHERE id = ${empId})
        ))`)
        // Branch: visible if any recipient shares branch with current employee
        visibilityOr.push(sql`(${recognitions.visibility} = 'branch' AND EXISTS (
            SELECT 1 FROM recognition_recipients rr
            JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognitions.id}
              AND e.branch_id IS NOT NULL
              AND e.branch_id = (SELECT branch_id FROM employees WHERE id = ${empId})
        ))`)
        // Manager: visible if any recipient reports to current employee
        visibilityOr.push(sql`(${recognitions.visibility} = 'manager' AND EXISTS (
            SELECT 1 FROM recognition_recipients rr
            JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognitions.id} AND e.reporting_to = ${empId}
        ))`)
    }
    if (userId) {
        // Giver/recipient via user id (when employeeId is unavailable)
        visibilityOr.push(eq(recognitions.giverUserId, userId))
    }
    if (isHr) {
        // HR sees everything
        visibilityOr.push(sql`1=1`)
    }

    conds.push(or(...visibilityOr))

    const rows = await db.select({
        ...getTableColumns(recognitions),
        totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
    })
        .from(recognitions)
        .where(and(...conds))
        .orderBy(desc(recognitions.isPinned), desc(recognitions.publishedAt), desc(recognitions.createdAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    const data = await annotateRecognitions(tenantId, rows, userId)
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

export async function listTrending(tenantId: string, limit: number, currentUserId: string | null = null) {
    const cap = Math.min(Math.max(limit, 1), 50)
    const rows = await db.select({
        ...getTableColumns(recognitions),
        score: sql<number>`(
            SELECT COUNT(*) FROM recognition_reactions rr
            WHERE rr.recognition_id = ${recognitions.id} AND rr.created_at > (now() - interval '30 days')
        )`.as('score'),
    })
        .from(recognitions)
        .where(and(
            eq(recognitions.tenantId, tenantId),
            isNull(recognitions.deletedAt),
            eq(recognitions.status, 'published' as any),
            // Trending is a discovery surface — only public recognitions are eligible.
            eq(recognitions.visibility, 'public' as any),
            sql`${recognitions.publishedAt} > (now() - interval '30 days')`,
        ))
        .orderBy(sql`score DESC`, desc(recognitions.publishedAt))
        .limit(cap)

    return annotateRecognitions(tenantId, rows, currentUserId)
}

export async function setStatus(
    tenantId: string,
    id: string,
    status: Status,
    fields?: Record<string, unknown>,
) {
    const patch: Record<string, unknown> = { status, updatedAt: new Date(), ...(fields ?? {}) }
    if (status === 'published' && patch.publishedAt === undefined) patch.publishedAt = new Date()
    if (status === 'approved' && patch.approvedAt === undefined) patch.approvedAt = new Date()
    if (status === 'rejected' && patch.rejectedAt === undefined) patch.rejectedAt = new Date()

    const [row] = await db.update(recognitions)
        .set(patch)
        .where(and(
            eq(recognitions.id, id),
            eq(recognitions.tenantId, tenantId),
            isNull(recognitions.deletedAt),
        ))
        .returning()
    return row ?? null
}

export async function pinRecognition(tenantId: string, id: string, isPinned: boolean) {
    const [row] = await db.update(recognitions)
        .set({ isPinned, updatedAt: new Date() })
        .where(and(
            eq(recognitions.id, id),
            eq(recognitions.tenantId, tenantId),
            isNull(recognitions.deletedAt),
        ))
        .returning()
    return row ?? null
}

// ── Reactions ────────────────────────────────────────────────────────────────

export async function setReaction(tenantId: string, recognitionId: string, userId: string, type: ReactionType) {
    await db.insert(recognitionReactions)
        .values({ tenantId, recognitionId, userId, reactionType: type })
        .onConflictDoUpdate({
            target: [recognitionReactions.recognitionId, recognitionReactions.userId],
            set: { reactionType: type, createdAt: sql`now()` },
        })
}

export async function removeReaction(tenantId: string, recognitionId: string, userId: string) {
    await db.delete(recognitionReactions)
        .where(and(
            eq(recognitionReactions.tenantId, tenantId),
            eq(recognitionReactions.recognitionId, recognitionId),
            eq(recognitionReactions.userId, userId),
        ))
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function listComments(tenantId: string, recognitionId: string) {
    const rows = await db.select().from(recognitionComments)
        .where(and(
            eq(recognitionComments.tenantId, tenantId),
            eq(recognitionComments.recognitionId, recognitionId),
        ))
        .orderBy(recognitionComments.createdAt)
    return rows
}

export async function addComment(
    tenantId: string,
    recognitionId: string,
    userId: string,
    authorName: string | null,
    body: string,
    parentId?: string | null,
) {
    const [row] = await db.insert(recognitionComments).values({
        tenantId,
        recognitionId,
        parentId: parentId ?? null,
        userId,
        authorName,
        body,
    }).returning()
    return row
}

export async function editComment(tenantId: string, commentId: string, userId: string, body: string) {
    const [row] = await db.update(recognitionComments)
        .set({ body, editedAt: new Date() })
        .where(and(
            eq(recognitionComments.tenantId, tenantId),
            eq(recognitionComments.id, commentId),
            eq(recognitionComments.userId, userId),
            isNull(recognitionComments.deletedAt),
        ))
        .returning()
    return row ?? null
}

export async function deleteComment(tenantId: string, commentId: string, userId: string, isModerator: boolean) {
    const conds: any[] = [
        eq(recognitionComments.tenantId, tenantId),
        eq(recognitionComments.id, commentId),
        isNull(recognitionComments.deletedAt),
    ]
    if (!isModerator) conds.push(eq(recognitionComments.userId, userId))
    const [row] = await db.update(recognitionComments)
        .set({ deletedAt: new Date(), deletedByUserId: userId })
        .where(and(...conds))
        .returning()
    return row ?? null
}

export async function getComment(tenantId: string, commentId: string) {
    const [row] = await db.select().from(recognitionComments)
        .where(and(
            eq(recognitionComments.tenantId, tenantId),
            eq(recognitionComments.id, commentId),
        ))
        .limit(1)
    return row ?? null
}

// ── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(tenantId: string) {
    const rows = await db.select().from(recognitionCategories)
        .where(eq(recognitionCategories.tenantId, tenantId))
        .orderBy(recognitionCategories.sortOrder, recognitionCategories.label)
    return rows
}

export async function createCategory(tenantId: string, input: CategoryInput) {
    const [row] = await db.insert(recognitionCategories).values({
        tenantId,
        key: input.key,
        label: input.label,
        description: input.description ?? null,
        icon: input.icon ?? 'award',
        color: input.color ?? '#6366f1',
        sortOrder: input.sortOrder ?? 0,
    }).returning()
    return row
}

export async function updateCategory(tenantId: string, id: string, patch: Partial<CategoryInput>) {
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.label !== undefined) updates.label = patch.label
    if (patch.description !== undefined) updates.description = patch.description
    if (patch.icon !== undefined) updates.icon = patch.icon
    if (patch.color !== undefined) updates.color = patch.color
    if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder
    const [row] = await db.update(recognitionCategories)
        .set(updates)
        .where(and(eq(recognitionCategories.tenantId, tenantId), eq(recognitionCategories.id, id)))
        .returning()
    return row ?? null
}

export async function archiveCategory(tenantId: string, id: string) {
    const [row] = await db.update(recognitionCategories)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(recognitionCategories.tenantId, tenantId), eq(recognitionCategories.id, id)))
        .returning()
    return row ?? null
}

export async function seedDefaultCategories(tenantId: string) {
    let created = 0
    for (const def of DEFAULT_CATEGORIES) {
        const [existing] = await db.select({ id: recognitionCategories.id })
            .from(recognitionCategories)
            .where(and(eq(recognitionCategories.tenantId, tenantId), eq(recognitionCategories.key, def.key)))
            .limit(1)
        if (existing) continue
        await db.insert(recognitionCategories).values({
            tenantId,
            key: def.key,
            label: def.label,
            description: def.description,
            icon: def.icon,
            color: def.color,
            isDefault: true,
            sortOrder: def.sortOrder,
        })
        created++
    }
    return { created, total: DEFAULT_CATEGORIES.length }
}

// ── Badges ───────────────────────────────────────────────────────────────────

export async function listBadges(tenantId: string) {
    const rows = await db.select().from(recognitionBadges)
        .where(eq(recognitionBadges.tenantId, tenantId))
        .orderBy(recognitionBadges.sortOrder, recognitionBadges.label)
    return rows
}

export async function createBadge(tenantId: string, input: BadgeInput) {
    const [row] = await db.insert(recognitionBadges).values({
        tenantId,
        key: input.key,
        label: input.label,
        description: input.description ?? null,
        icon: input.icon ?? 'medal',
        color: input.color ?? '#f59e0b',
        level: input.level,
        categoryKey: input.categoryKey ?? null,
        defaultPoints: input.defaultPoints ?? 0,
        sortOrder: input.sortOrder ?? 0,
    }).returning()
    return row
}

export async function updateBadge(tenantId: string, id: string, patch: Partial<BadgeInput>) {
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.label !== undefined) updates.label = patch.label
    if (patch.description !== undefined) updates.description = patch.description
    if (patch.icon !== undefined) updates.icon = patch.icon
    if (patch.color !== undefined) updates.color = patch.color
    if (patch.level !== undefined) updates.level = patch.level
    if (patch.categoryKey !== undefined) updates.categoryKey = patch.categoryKey
    if (patch.defaultPoints !== undefined) updates.defaultPoints = patch.defaultPoints
    if (patch.sortOrder !== undefined) updates.sortOrder = patch.sortOrder
    const [row] = await db.update(recognitionBadges)
        .set(updates)
        .where(and(eq(recognitionBadges.tenantId, tenantId), eq(recognitionBadges.id, id)))
        .returning()
    return row ?? null
}

export async function archiveBadge(tenantId: string, id: string) {
    const [row] = await db.update(recognitionBadges)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(and(eq(recognitionBadges.tenantId, tenantId), eq(recognitionBadges.id, id)))
        .returning()
    return row ?? null
}

export async function seedDefaultBadges(tenantId: string) {
    let created = 0
    for (const def of DEFAULT_BADGES) {
        const [existing] = await db.select({ id: recognitionBadges.id })
            .from(recognitionBadges)
            .where(and(eq(recognitionBadges.tenantId, tenantId), eq(recognitionBadges.key, def.key)))
            .limit(1)
        if (existing) continue
        await db.insert(recognitionBadges).values({
            tenantId,
            key: def.key,
            label: def.label,
            description: def.description,
            icon: def.icon,
            color: def.color,
            level: def.level,
            categoryKey: def.categoryKey,
            defaultPoints: def.defaultPoints,
            sortOrder: def.sortOrder,
        })
        created++
    }
    return { created, total: DEFAULT_BADGES.length }
}

// ── Points ───────────────────────────────────────────────────────────────────

export async function getUserPointsBalance(tenantId: string, userId: string): Promise<{ earned: number; given: number; redeemed: number; available: number }> {
    const rows = await db.select({
        type: recognitionPoints.type,
        total: sql<number>`COALESCE(SUM(${recognitionPoints.points}), 0)`.as('total'),
    })
        .from(recognitionPoints)
        .where(and(eq(recognitionPoints.tenantId, tenantId), eq(recognitionPoints.userId, userId)))
        .groupBy(recognitionPoints.type)
    let earned = 0, given = 0, redeemed = 0, granted = 0
    for (const r of rows) {
        const total = Number(r.total)
        if (r.type === 'earned') earned += total
        else if (r.type === 'given') given += total
        else if (r.type === 'redeemed') redeemed += total
        else if (r.type === 'granted') granted += total
    }
    const available = earned + granted - redeemed
    return { earned, given, redeemed, available }
}

export async function listUserPointsLedger(tenantId: string, userId: string, params: { limit: number; offset: number }) {
    const { limit, offset } = params
    const rows = await db.select({
        ...getTableColumns(recognitionPoints),
        totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
    })
        .from(recognitionPoints)
        .where(and(eq(recognitionPoints.tenantId, tenantId), eq(recognitionPoints.userId, userId)))
        .orderBy(desc(recognitionPoints.createdAt))
        .limit(limit).offset(offset)
    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return { data: rows, total, limit, offset, hasMore: offset + limit < total }
}

/**
 * Compute balance_after atomically inside a transaction using a single SQL
 * expression. This avoids the classic read-modify-write race: under concurrent
 * writes both readers would see the same stale balance and both write `b + d`,
 * losing one. By computing inside the INSERT and using SUM over the ledger,
 * Postgres serializes via the row-level lock on the new insert.
 */
async function insertPointsAtomic(
    tx: any,
    row: {
        tenantId: string
        userId: string
        employeeId: string | null
        recognitionId: string | null
        points: number
        type: 'earned' | 'given' | 'granted' | 'redeemed' | 'reversed'
        description: string
        createdByUserId: string | null
    },
) {
    // Use a CTE to compute current available + delta in the same INSERT.
    // Available = earned + granted - redeemed (matches getUserPointsBalance).
    const res = await tx.execute(sql`
        WITH cur AS (
            SELECT COALESCE(SUM(CASE WHEN type IN ('earned','granted') THEN points
                                     WHEN type = 'redeemed' THEN -points
                                     ELSE 0 END), 0)::int AS available
            FROM recognition_points
            WHERE tenant_id = ${row.tenantId} AND user_id = ${row.userId}
        )
        INSERT INTO recognition_points
            (tenant_id, user_id, employee_id, recognition_id, points, type, description, balance_after, created_by_user_id)
        SELECT
            ${row.tenantId}, ${row.userId}, ${row.employeeId}, ${row.recognitionId},
            ${row.points}, ${row.type}, ${row.description},
            CASE
                WHEN ${row.type} IN ('earned','granted') THEN cur.available + ${row.points}
                WHEN ${row.type} = 'redeemed' THEN cur.available - ${row.points}
                ELSE cur.available
            END,
            ${row.createdByUserId}
        FROM cur
        RETURNING *
    `)
    return (((res as any).rows ?? res) as any[])[0]
}

export async function grantPoints(
    tenantId: string,
    userId: string,
    employeeId: string | null,
    points: number,
    description: string,
    grantedByUserId: string,
) {
    const safe = Math.max(0, Math.floor(Number(points) || 0))
    return db.transaction(async (tx) => insertPointsAtomic(tx, {
        tenantId,
        userId,
        employeeId: employeeId ?? null,
        recognitionId: null,
        points: safe,
        type: 'granted',
        description,
        createdByUserId: grantedByUserId,
    }))
}

export async function recordRecognitionPoints(
    tenantId: string,
    recognitionId: string,
    giverUserId: string | null,
    giverEmployeeId: string | null,
    points: number,
    recipientUserIds: string[],
    recipientEmployeeIds: string[],
) {
    const safe = Math.max(0, Math.floor(Number(points) || 0))
    if (!safe) return
    await db.transaction(async (tx) => {
        // Credit each recipient user (earned) — sequential inside tx so balance
        // computations are serialized per user.
        for (let i = 0; i < recipientUserIds.length; i++) {
            const uid = recipientUserIds[i]
            if (!uid) continue
            await insertPointsAtomic(tx, {
                tenantId,
                userId: uid,
                employeeId: recipientEmployeeIds[i] ?? null,
                recognitionId,
                points: safe,
                type: 'earned',
                description: 'Recognition received',
                createdByUserId: giverUserId,
            })
        }
        // Track giver allocation — bookkeeping only (not counted toward 'available').
        if (giverUserId) {
            await tx.insert(recognitionPoints).values({
                tenantId,
                userId: giverUserId,
                employeeId: giverEmployeeId,
                recognitionId,
                points: safe * Math.max(1, recipientUserIds.length),
                type: 'given',
                description: 'Recognition given',
                balanceAfter: null,
                createdByUserId: giverUserId,
            })
        }
    })
}

/** Redeem points (deduct from available). Used by future redemption flows. */
export async function redeemPoints(
    tenantId: string,
    userId: string,
    points: number,
    description: string,
    redeemedByUserId: string,
) {
    const safe = Math.max(0, Math.floor(Number(points) || 0))
    if (!safe) return null
    return db.transaction(async (tx) => {
        // Pre-check balance — block if insufficient.
        const cur = await getUserPointsBalance(tenantId, userId)
        if (cur.available < safe) {
            const err = new Error('Insufficient points balance')
            ;(err as any).statusCode = 400
            throw err
        }
        return insertPointsAtomic(tx, {
            tenantId,
            userId,
            employeeId: null,
            recognitionId: null,
            points: safe,
            type: 'redeemed',
            description,
            createdByUserId: redeemedByUserId,
        })
    })
}

/**
 * Resolve the active user account ids for a list of recipient employee ids.
 * Used by recordRecognitionPoints and the notification fan-out.
 */
export async function resolveRecipientUserIds(tenantId: string, employeeIds: string[]) {
    if (!employeeIds.length) return [] as Array<{ employeeId: string; userId: string }>
    const rows = await db.select({ employeeId: users.employeeId, userId: users.id })
        .from(users)
        .where(and(
            eq(users.tenantId, tenantId),
            eq(users.isActive, true),
            inArray(users.employeeId, employeeIds),
        ))
    return rows
        .filter((r) => r.employeeId)
        .map((r) => ({ employeeId: r.employeeId as string, userId: r.userId }))
}

// ── Approvals ────────────────────────────────────────────────────────────────

export async function submitForApproval(tenantId: string, id: string) {
    // Only `draft` can transition into `pending`. Reject silent re-submits of
    // already-published / rejected rows (would corrupt the workflow trail).
    const [row] = await db.update(recognitions)
        .set({ status: 'pending' as any, workflowState: 'manager_review' as any, submittedAt: new Date(), updatedAt: new Date() })
        .where(and(
            eq(recognitions.id, id),
            eq(recognitions.tenantId, tenantId),
            isNull(recognitions.deletedAt),
            eq(recognitions.status, 'draft' as any),
        ))
        .returning()
    return row ?? null
}

/**
 * "Return for revision" — moves a pending recognition back to `draft` so the
 * giver can edit and resubmit. Recorded in the approvals trail.
 */
export async function returnRecognition(
    tenantId: string,
    id: string,
    approverUserId: string,
    approverName: string,
    comment?: string,
) {
    return db.transaction(async (tx) => {
        await tx.insert(recognitionApprovals).values({
            tenantId,
            recognitionId: id,
            approverUserId,
            approverName,
            step: 'hr',
            action: 'return',
            comment: comment ?? null,
        })
        const [row] = await tx.update(recognitions)
            .set({
                status: 'draft' as any,
                workflowState: null as any,
                updatedAt: new Date(),
            })
            .where(and(
                eq(recognitions.id, id),
                eq(recognitions.tenantId, tenantId),
                isNull(recognitions.deletedAt),
                eq(recognitions.status, 'pending' as any),
            ))
            .returning()
        return row ?? null
    })
}

export async function approveRecognition(
    tenantId: string,
    id: string,
    approverUserId: string,
    approverName: string,
    step: 'manager' | 'hr',
    comment?: string,
) {
    return db.transaction(async (tx) => {
        await tx.insert(recognitionApprovals).values({
            tenantId,
            recognitionId: id,
            approverUserId,
            approverName,
            step,
            action: 'approve',
            comment: comment ?? null,
        })
        // manager → hr_approval; hr → completed + published
        const nextState: WorkflowState = step === 'manager' ? 'hr_approval' : 'completed'
        const nextStatus: Status = step === 'hr' ? 'published' : 'approved'
        const patch: Record<string, unknown> = {
            workflowState: nextState as any,
            status: nextStatus as any,
            updatedAt: new Date(),
            approvedAt: new Date(),
        }
        if (step === 'hr') patch.publishedAt = new Date()
        const [row] = await tx.update(recognitions)
            .set(patch)
            .where(and(
                eq(recognitions.id, id),
                eq(recognitions.tenantId, tenantId),
                isNull(recognitions.deletedAt),
            ))
            .returning()
        return row ?? null
    })
}

export async function rejectRecognition(
    tenantId: string,
    id: string,
    approverUserId: string,
    approverName: string,
    reason: string,
) {
    return db.transaction(async (tx) => {
        await tx.insert(recognitionApprovals).values({
            tenantId,
            recognitionId: id,
            approverUserId,
            approverName,
            step: 'hr',
            action: 'reject',
            comment: reason,
        })
        const [row] = await tx.update(recognitions)
            .set({
                status: 'rejected' as any,
                workflowState: 'completed' as any,
                rejectedAt: new Date(),
                rejectionReason: reason,
                updatedAt: new Date(),
            })
            .where(and(
                eq(recognitions.id, id),
                eq(recognitions.tenantId, tenantId),
                isNull(recognitions.deletedAt),
            ))
            .returning()
        return row ?? null
    })
}

export async function holdRecognition(
    tenantId: string,
    id: string,
    approverUserId: string,
    approverName: string,
    comment?: string,
) {
    return db.transaction(async (tx) => {
        await tx.insert(recognitionApprovals).values({
            tenantId,
            recognitionId: id,
            approverUserId,
            approverName,
            step: 'hr',
            action: 'hold',
            comment: comment ?? null,
        })
        const [row] = await tx.update(recognitions)
            .set({ workflowState: 'manager_review' as any, updatedAt: new Date() })
            .where(and(
                eq(recognitions.id, id),
                eq(recognitions.tenantId, tenantId),
                isNull(recognitions.deletedAt),
            ))
            .returning()
        return row ?? null
    })
}

export async function listPendingApprovals(
    tenantId: string,
    currentUserId: string,
    role: string,
    params: { limit: number; offset: number },
) {
    const { limit, offset } = params
    const isHr = role === 'hr_manager' || role === 'super_admin'
    const conds: any[] = [
        eq(recognitions.tenantId, tenantId),
        isNull(recognitions.deletedAt),
        eq(recognitions.status, 'pending' as any),
    ]
    if (!isHr) {
        // Managers see pending where any recipient reports to them
        conds.push(sql`EXISTS (
            SELECT 1 FROM recognition_recipients rr
            JOIN employees e ON e.id = rr.employee_id
            JOIN users u ON u.employee_id = e.reporting_to
            WHERE rr.recognition_id = ${recognitions.id} AND u.id = ${currentUserId}
        )`)
    }
    const rows = await db.select({
        ...getTableColumns(recognitions),
        totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
    })
        .from(recognitions)
        .where(and(...conds))
        .orderBy(desc(recognitions.submittedAt), desc(recognitions.createdAt))
        .limit(limit).offset(offset)
    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    const data = await annotateRecognitions(tenantId, rows, currentUserId)
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

// ── Analytics ────────────────────────────────────────────────────────────────

export async function getAnalyticsSummary(tenantId: string, periodDays: number) {
    const period = periodSql(periodDays)
    const baseWhere = and(
        eq(recognitions.tenantId, tenantId),
        isNull(recognitions.deletedAt),
        eq(recognitions.status, 'published' as any),
        sql`${recognitions.publishedAt} >= ${period}`,
    )

    const [totals] = await db.select({
        totalRecognitions: sql<number>`COUNT(*)`.as('totalRecognitions'),
        totalGivers: sql<number>`COUNT(DISTINCT ${recognitions.giverEmployeeId})`.as('totalGivers'),
    }).from(recognitions).where(baseWhere)

    const recipientAgg = await db.execute(sql`
        SELECT COUNT(DISTINCT rr.employee_id)::int AS total_recipients
        FROM recognition_recipients rr
        JOIN recognitions r ON r.id = rr.recognition_id
        WHERE r.tenant_id = ${tenantId}
          AND r.deleted_at IS NULL
          AND r.status = 'published'
          AND r.published_at >= ${period}
    `)
    const totalRecipients = Number(((recipientAgg as any).rows ?? recipientAgg)[0]?.total_recipients ?? 0)

    const byCategoryRes = await db.execute(sql`
        SELECT r.category_key AS key,
               COALESCE(c.label, INITCAP(REPLACE(r.category_key, '_', ' '))) AS label,
               COALESCE(c.color, '#6366f1') AS color,
               COUNT(*)::int AS count
        FROM recognitions r
        LEFT JOIN recognition_categories c
          ON c.tenant_id = r.tenant_id AND c.key = r.category_key
        WHERE r.tenant_id = ${tenantId}
          AND r.deleted_at IS NULL
          AND r.status = 'published'
          AND r.published_at >= ${period}
        GROUP BY r.category_key, c.label, c.color
        ORDER BY count DESC
    `)
    const byCategory = (((byCategoryRes as any).rows ?? byCategoryRes) as any[]).map((r) => ({
        key: r.key as string,
        label: r.label as string,
        color: r.color as string,
        count: Number(r.count),
    }))

    const byDepartmentRes = await db.execute(sql`
        SELECT COALESCE(e.department_id::text, e.department, 'unassigned') AS org_unit_id,
               COALESCE(e.department, 'Unassigned') AS name,
               COUNT(*)::int AS count
        FROM recognitions r
        JOIN recognition_recipients rr ON rr.recognition_id = r.id
        JOIN employees e ON e.id = rr.employee_id
        WHERE r.tenant_id = ${tenantId}
          AND r.deleted_at IS NULL
          AND r.status = 'published'
          AND r.published_at >= ${period}
        GROUP BY 1, 2
        ORDER BY count DESC
    `)
    const byDepartment = (((byDepartmentRes as any).rows ?? byDepartmentRes) as any[]).map((r) => ({
        orgUnitId: r.org_unit_id as string,
        name: r.name as string,
        count: Number(r.count),
    }))

    const byMonthRes = await db.execute(sql`
        SELECT to_char(date_trunc('month', published_at), 'YYYY-MM') AS month,
               COUNT(*)::int AS count
        FROM recognitions
        WHERE tenant_id = ${tenantId}
          AND deleted_at IS NULL
          AND status = 'published'
          AND published_at >= ${period}
        GROUP BY 1
        ORDER BY 1
    `)
    const byMonth = (((byMonthRes as any).rows ?? byMonthRes) as any[]).map((r) => ({
        month: r.month as string,
        count: Number(r.count),
    }))

    const totalRecognitions = Number(totals?.totalRecognitions ?? 0)
    const totalGivers = Number(totals?.totalGivers ?? 0)
    const avgPerEmployee = totalRecipients > 0 ? Math.round((totalRecognitions / totalRecipients) * 100) / 100 : 0

    return {
        totalRecognitions,
        totalRecipients,
        totalGivers,
        avgPerEmployee,
        byCategory,
        byDepartment,
        byMonth,
    }
}

export async function getLeaderboard(
    tenantId: string,
    periodDays: number,
    type: 'received' | 'given',
    limit: number,
) {
    const cap = Math.min(Math.max(limit, 1), 50)
    const period = periodSql(periodDays)
    if (type === 'received') {
        const rows = await db.execute(sql`
            SELECT
                e.id AS employee_id,
                e.first_name AS first_name,
                e.last_name AS last_name,
                e.designation AS designation,
                e.department AS department,
                e.avatar_url AS avatar_url,
                COUNT(*)::int AS count,
                COALESCE(SUM(rr.points_awarded), 0)::int AS points
            FROM recognition_recipients rr
            JOIN recognitions r ON r.id = rr.recognition_id
            JOIN employees e ON e.id = rr.employee_id
            WHERE r.tenant_id = ${tenantId}
              AND r.deleted_at IS NULL
              AND r.status = 'published'
              AND r.published_at >= ${period}
            GROUP BY e.id, e.first_name, e.last_name, e.designation, e.department, e.avatar_url
            ORDER BY count DESC, points DESC
            LIMIT ${cap}
        `)
        return (((rows as any).rows ?? rows) as any[]).map((r) => ({
            employeeId: r.employee_id as string,
            name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'Employee',
            designation: r.designation as string | null,
            department: r.department as string | null,
            avatarUrl: r.avatar_url as string | null,
            count: Number(r.count),
            points: Number(r.points),
        }))
    }
    const rows = await db.execute(sql`
        SELECT
            e.id AS employee_id,
            e.first_name AS first_name,
            e.last_name AS last_name,
            e.designation AS designation,
            e.department AS department,
            e.avatar_url AS avatar_url,
            COUNT(*)::int AS count
        FROM recognitions r
        JOIN employees e ON e.id = r.giver_employee_id
        WHERE r.tenant_id = ${tenantId}
          AND r.deleted_at IS NULL
          AND r.status = 'published'
          AND r.published_at >= ${period}
          AND r.giver_employee_id IS NOT NULL
        GROUP BY e.id, e.first_name, e.last_name, e.designation, e.department, e.avatar_url
        ORDER BY count DESC
        LIMIT ${cap}
    `)
    return (((rows as any).rows ?? rows) as any[]).map((r) => ({
        employeeId: r.employee_id as string,
        name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'Employee',
        designation: r.designation as string | null,
        department: r.department as string | null,
        avatarUrl: r.avatar_url as string | null,
        count: Number(r.count),
        points: 0,
    }))
}

export async function getTopRecognized(tenantId: string, periodDays: number, limit: number) {
    return getLeaderboard(tenantId, periodDays, 'received', limit)
}

export async function getTopGivers(tenantId: string, periodDays: number, limit: number) {
    return getLeaderboard(tenantId, periodDays, 'given', limit)
}

export async function getBadgesDistribution(tenantId: string, periodDays: number) {
    const period = periodSql(periodDays)
    const rows = await db.execute(sql`
        SELECT r.badge_key AS badge_key,
               COALESCE(b.label, INITCAP(REPLACE(r.badge_key, '_', ' '))) AS label,
               COALESCE(b.level, 'bronze') AS level,
               COALESCE(b.color, '#f59e0b') AS color,
               COUNT(*)::int AS count
        FROM recognitions r
        LEFT JOIN recognition_badges b
          ON b.tenant_id = r.tenant_id AND b.key = r.badge_key
        WHERE r.tenant_id = ${tenantId}
          AND r.deleted_at IS NULL
          AND r.status = 'published'
          AND r.published_at >= ${period}
          AND r.badge_key IS NOT NULL
        GROUP BY r.badge_key, b.label, b.level, b.color
        ORDER BY count DESC
    `)
    return (((rows as any).rows ?? rows) as any[]).map((r) => ({
        badgeKey: r.badge_key as string,
        label: r.label as string,
        level: r.level as BadgeLevel,
        color: r.color as string,
        count: Number(r.count),
    }))
}

// ── Employee profile ─────────────────────────────────────────────────────────

export async function getEmployeeRecognitionProfile(tenantId: string, employeeId: string) {
    // Received: any recognition where this employee is a recipient
    const received = await db.execute(sql`
        SELECT r.*
        FROM recognitions r
        JOIN recognition_recipients rr ON rr.recognition_id = r.id
        WHERE r.tenant_id = ${tenantId}
          AND r.deleted_at IS NULL
          AND r.status = 'published'
          AND rr.employee_id = ${employeeId}
        ORDER BY r.published_at DESC NULLS LAST, r.created_at DESC
        LIMIT 50
    `)
    const receivedRows = (((received as any).rows ?? received) as any[])

    // Given: recognitions authored by this employee
    const givenRes = await db.select().from(recognitions)
        .where(and(
            eq(recognitions.tenantId, tenantId),
            isNull(recognitions.deletedAt),
            eq(recognitions.status, 'published' as any),
            eq(recognitions.giverEmployeeId, employeeId),
        ))
        .orderBy(desc(recognitions.publishedAt), desc(recognitions.createdAt))
        .limit(50)

    const annotatedReceived = await annotateRecognitions(tenantId, receivedRows, null)
    const annotatedGiven = await annotateRecognitions(tenantId, givenRes, null)

    // Stats
    const [receivedCountRow] = await db.select({ total: sql<number>`COUNT(*)`.as('total') })
        .from(recognitionRecipients)
        .innerJoin(recognitions, eq(recognitions.id, recognitionRecipients.recognitionId))
        .where(and(
            eq(recognitionRecipients.tenantId, tenantId),
            eq(recognitionRecipients.employeeId, employeeId),
            isNull(recognitions.deletedAt),
            eq(recognitions.status, 'published' as any),
        ))
    const [givenCountRow] = await db.select({ total: sql<number>`COUNT(*)`.as('total') })
        .from(recognitions)
        .where(and(
            eq(recognitions.tenantId, tenantId),
            isNull(recognitions.deletedAt),
            eq(recognitions.status, 'published' as any),
            eq(recognitions.giverEmployeeId, employeeId),
        ))

    const badgesRes = await db.execute(sql`
        SELECT DISTINCT r.badge_key
        FROM recognitions r
        JOIN recognition_recipients rr ON rr.recognition_id = r.id
        WHERE r.tenant_id = ${tenantId}
          AND r.deleted_at IS NULL
          AND r.status = 'published'
          AND rr.employee_id = ${employeeId}
          AND r.badge_key IS NOT NULL
    `)
    const badges = (((badgesRes as any).rows ?? badgesRes) as any[]).map((r) => r.badge_key as string)

    const topCatRes = await db.execute(sql`
        SELECT r.category_key AS key, COUNT(*)::int AS count
        FROM recognitions r
        JOIN recognition_recipients rr ON rr.recognition_id = r.id
        WHERE r.tenant_id = ${tenantId}
          AND r.deleted_at IS NULL
          AND r.status = 'published'
          AND rr.employee_id = ${employeeId}
        GROUP BY r.category_key
        ORDER BY count DESC
        LIMIT 5
    `)
    const topCategories = (((topCatRes as any).rows ?? topCatRes) as any[]).map((r) => ({
        key: r.key as string,
        count: Number(r.count),
    }))

    return {
        received: annotatedReceived,
        given: annotatedGiven,
        stats: {
            receivedCount: Number(receivedCountRow?.total ?? 0),
            givenCount: Number(givenCountRow?.total ?? 0),
            badgesEarned: badges.length,
            topCategories,
        },
    }
}

// ── Tenant-membership validators (cross-tenant injection guard) ──────────────
// Each create/update must verify foreign ids belong to the caller's tenant —
// FKs alone would happily reference rows owned by another tenant. Returns the
// list of ids that DO belong; caller compares lengths to detect a mismatch.
export async function filterEmployeesInTenant(tenantId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return []
    const rows = await db.select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), inArray(employees.id, ids)))
    return rows.map((r) => r.id)
}

export async function filterTeamsInTenant(tenantId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return []
    const rows = await db.select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.tenantId, tenantId), inArray(teams.id, ids)))
    return rows.map((r) => r.id)
}

export async function filterOrgUnitsInTenant(tenantId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return []
    const rows = await db.select({ id: orgUnits.id })
        .from(orgUnits)
        .where(and(eq(orgUnits.tenantId, tenantId), inArray(orgUnits.id, ids)))
    return rows.map((r) => r.id)
}

/**
 * Visibility gate for a single recognition. Returns true if the current user
 * is permitted to view this recognition under its visibility rule. HR roles
 * always pass. Used by GET /:id to prevent unauthorized leakage of private /
 * team / department / manager scoped recognitions.
 */
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
    // Recipient is always allowed
    const [recip] = await db.select({ id: recognitionRecipients.id }).from(recognitionRecipients)
        .where(and(
            eq(recognitionRecipients.tenantId, tenantId),
            eq(recognitionRecipients.recognitionId, recognition.id),
            eq(recognitionRecipients.employeeId, user.employeeId),
        )).limit(1)
    if (recip) return true
    if (recognition.visibility === 'private') return false
    // For team/department/branch/manager, run the equivalent EXISTS check used in listFeed
    if (recognition.visibility === 'team') {
        const [row] = await db.execute(sql`
            SELECT 1 FROM recognition_team_targets rtt
            JOIN team_members tm ON tm.team_id = rtt.team_id
            WHERE rtt.recognition_id = ${recognition.id} AND tm.employee_id = ${user.employeeId}
            LIMIT 1
        `) as any
        return !!((row as any)?.rows?.length ?? (Array.isArray(row) ? row.length : 0) ?? 0)
    }
    if (recognition.visibility === 'department') {
        const res = await db.execute(sql`
            SELECT 1 FROM recognition_recipients rr
            JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognition.id}
              AND e.department_id IS NOT NULL
              AND e.department_id = (SELECT department_id FROM employees WHERE id = ${user.employeeId})
            LIMIT 1
        `)
        const rows = ((res as any).rows ?? res) as any[]
        return Array.isArray(rows) && rows.length > 0
    }
    if (recognition.visibility === 'branch') {
        const res = await db.execute(sql`
            SELECT 1 FROM recognition_recipients rr
            JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognition.id}
              AND e.branch_id IS NOT NULL
              AND e.branch_id = (SELECT branch_id FROM employees WHERE id = ${user.employeeId})
            LIMIT 1
        `)
        const rows = ((res as any).rows ?? res) as any[]
        return Array.isArray(rows) && rows.length > 0
    }
    if (recognition.visibility === 'manager') {
        const res = await db.execute(sql`
            SELECT 1 FROM recognition_recipients rr
            JOIN employees e ON e.id = rr.employee_id
            WHERE rr.recognition_id = ${recognition.id} AND e.reporting_to = ${user.employeeId}
            LIMIT 1
        `)
        const rows = ((res as any).rows ?? res) as any[]
        return Array.isArray(rows) && rows.length > 0
    }
    return false
}

/** True if the current user is the direct manager of any recipient. */
export async function isManagerOfAnyRecipient(tenantId: string, recognitionId: string, currentEmployeeId: string | null): Promise<boolean> {
    if (!currentEmployeeId) return false
    const res = await db.execute(sql`
        SELECT 1 FROM recognition_recipients rr
        JOIN employees e ON e.id = rr.employee_id
        WHERE rr.tenant_id = ${tenantId}
          AND rr.recognition_id = ${recognitionId}
          AND e.reporting_to = ${currentEmployeeId}
        LIMIT 1
    `)
    const rows = ((res as any).rows ?? res) as any[]
    return Array.isArray(rows) && rows.length > 0
}

// Re-exports referenced by routes
export { inArray, eq, and, isNull, sql, desc }
