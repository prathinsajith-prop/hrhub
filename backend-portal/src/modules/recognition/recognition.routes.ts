import type { FastifyInstance } from 'fastify'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { employees } from '../../db/schema/index.js'
import { e400, e404 } from '../../lib/errors.js'
import { recordActivity } from '../../lib/audit.js'
import { notifyRequester } from '../../lib/notify.js'
import {
    createRecognition, getRecognition, listFeed, listTeamFeed,
    setReaction, removeReaction, listComments, addComment,
    listCategories, listBadges, canViewRecognition,
    resolveRecipientUserIds, recordRecognitionPoints,
    filterEmployeesInTenant, filterTeamsInTenant, filterOrgUnitsInTenant,
    type RecognitionInput, type ReactionType,
} from './recognition.service.js'

// Employee-portal recognition surface. Employees view their feed + give
// recognition to colleagues; managers additionally see recognitions for their
// direct reports. Heavy lifting (visibility, points, fan-out) mirrors the admin
// recognition service — see backend/src/modules/recognition/.

const VALID_VISIBILITY = ['public', 'team', 'department', 'branch', 'manager', 'hr', 'private'] as const
const VALID_NOMINATION = ['peer', 'manager', 'leadership', 'self_nomination', 'employee_of_month'] as const
const VALID_REACTIONS: ReactionType[] = ['like', 'celebrate', 'love', 'support', 'congrats']

const bad = (reply: any, message: string) => reply.code(400).send(e400(message))
const notFound = (reply: any, message: string) => reply.code(404).send(e404(message))

function parseLimitOffset(q: any) {
    return {
        limit: Math.min(Math.max(Number(q?.limit) || 20, 1), 50),
        offset: Math.max(Number(q?.offset) || 0, 0),
    }
}

/**
 * Publish fan-out for a portal-given recognition (fire-and-forget):
 *  - each recipient: "You received a recognition" → /me/recognition/:id
 *  - the giver: a "Recognition sent" confirmation
 *  - each recipient's direct manager: "A team member was recognized" → /team/recognition
 */
async function fanOutGiveNotifications(
    tenantId: string,
    recognition: any,
    giverEmployeeId: string | null,
    giverName: string,
) {
    try {
        const recipientIds: string[] = Array.isArray(recognition?.recipients)
            ? recognition.recipients.map((r: any) => r.employeeId).filter(Boolean)
            : []
        if (!recipientIds.length) return
        const detailUrl = `/me/recognition/${recognition.id}`

        await Promise.all(
            recipientIds.map((employeeId) =>
                notifyRequester({
                    tenantId, employeeId, type: 'success',
                    title: 'You received a recognition',
                    message: `${giverName} appreciated you: ${recognition.title}`,
                    actionUrl: detailUrl,
                }).catch(() => {}),
            ),
        )

        // Giver confirmation
        if (giverEmployeeId) {
            notifyRequester({
                tenantId, employeeId: giverEmployeeId, type: 'info',
                title: 'Recognition sent',
                message: `Your recognition "${recognition.title}" has been posted.`,
                actionUrl: detailUrl,
            }).catch(() => {})
        }

        // Recipients' direct managers (distinct, excluding the giver themselves)
        const mgrRows = await db
            .select({ managerId: employees.reportingTo })
            .from(employees)
            .where(and(eq(employees.tenantId, tenantId), inArray(employees.id, recipientIds)))
        const managerIds = Array.from(new Set(mgrRows.map((r) => r.managerId).filter((id): id is string => !!id && id !== giverEmployeeId)))
        await Promise.all(
            managerIds.map((employeeId) =>
                notifyRequester({
                    tenantId, employeeId, type: 'info',
                    title: 'A team member was recognized',
                    message: `${recognition.title}`,
                    actionUrl: '/team/recognition',
                }).catch(() => {}),
            ),
        )
    } catch {
        /* never block the give on notification fan-out */
    }
}

async function awardPoints(tenantId: string, recognition: any, giverUserId: string | null, giverEmployeeId: string | null) {
    try {
        const points = Number(recognition?.points || 0)
        if (!points) return
        const recipientIds: string[] = Array.isArray(recognition?.recipients)
            ? recognition.recipients.map((r: any) => r.employeeId).filter(Boolean)
            : []
        if (!recipientIds.length) return
        const resolved = await resolveRecipientUserIds(tenantId, recipientIds)
        await recordRecognitionPoints(
            tenantId, recognition.id, giverUserId, giverEmployeeId, points,
            resolved.map((r) => r.userId), resolved.map((r) => r.employeeId),
        )
    } catch {
        /* points are best-effort */
    }
}

export default async function recognitionRoutes(fastify: FastifyInstance): Promise<void> {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // ── Feed (employee) ──────────────────────────────────────────────────────
    fastify.get('/feed', { ...auth }, async (request: any, reply: any) => {
        const { limit, offset } = parseLimitOffset(request.query)
        const category = typeof request.query?.category === 'string' ? request.query.category : undefined
        const result = await listFeed(
            request.user.tenantId,
            { userId: request.user.id, employeeId: request.user.employeeId ?? null, role: request.user.role },
            { limit, offset, category },
        )
        return reply.send(result)
    })

    // ── Team feed (manager: recognitions for direct reports) ─────────────────
    fastify.get('/team/feed', { ...auth }, async (request: any, reply: any) => {
        const empId = request.user.employeeId
        if (!empId) return reply.send({ data: [], total: 0, limit: 0, offset: 0, hasMore: false })
        const { limit, offset } = parseLimitOffset(request.query)
        const result = await listTeamFeed(request.user.tenantId, empId, request.user.id, { limit, offset })
        return reply.send(result)
    })

    // ── Categories / badges (for the give form) ──────────────────────────────
    fastify.get('/categories', { ...auth }, async (request: any, reply: any) => {
        return reply.send({ data: await listCategories(request.user.tenantId) })
    })
    fastify.get('/badges', { ...auth }, async (request: any, reply: any) => {
        return reply.send({ data: await listBadges(request.user.tenantId) })
    })

    // Visibility helper.
    //
    // Recognitions can be scoped to private / team / department / manager /
    // hr audiences — it's not enough to check tenant scoping at the SQL
    // layer. Every interaction surface that takes a `:id` (detail, reactions,
    // comments) needs to clear `canViewRecognition`, otherwise a portal
    // caller who learnt or guessed a UUID could react/comment on a
    // recognition that was never surfaced to them in the feed (which would
    // also leak its existence + comment thread back to legitimate viewers).
    // Centralised here so the four endpoints below can't drift.
    async function loadVisibleRecognition(req: any): Promise<any | null> {
        const { id } = req.params as { id: string }
        const row = await getRecognition(req.user.tenantId, id, req.user.id)
        if (!row) return null
        const allowed = await canViewRecognition(req.user.tenantId, row as any, {
            userId: req.user.id,
            employeeId: req.user.employeeId ?? null,
            role: req.user.role,
        })
        return allowed ? row : null
    }

    // ── Detail ───────────────────────────────────────────────────────────────
    fastify.get('/:id', { ...auth }, async (request: any, reply: any) => {
        const row = await loadVisibleRecognition(request)
        if (!row) return notFound(reply, 'Recognition not found')
        return reply.send({ data: row })
    })

    // ── Give recognition ──────────────────────────────────────────────────────
    fastify.post('/', { ...auth }, async (request: any, reply: any) => {
        const b = (request.body ?? {}) as any
        const title = typeof b.title === 'string' ? b.title.trim() : ''
        const message = typeof b.message === 'string' ? b.message.trim() : ''
        const categoryKey = typeof b.categoryKey === 'string' ? b.categoryKey.trim() : ''
        const recipientIds = Array.isArray(b.recipientEmployeeIds) ? b.recipientEmployeeIds.filter((x: any) => typeof x === 'string' && x) : []
        if (!title) return bad(reply, 'Title is required')
        if (!message) return bad(reply, 'Message is required')
        if (!categoryKey) return bad(reply, 'categoryKey is required')
        if (!recipientIds.length) return bad(reply, 'At least one recipient is required')

        // Employees cannot recognize themselves.
        if (request.user.employeeId && recipientIds.includes(request.user.employeeId)) {
            return bad(reply, 'You cannot recognize yourself')
        }

        const visibility = VALID_VISIBILITY.includes(b.visibility) ? b.visibility : 'public'
        const nominationType = VALID_NOMINATION.includes(b.nominationType) ? b.nominationType : 'peer'

        const teamIdsRaw: string[] = Array.isArray(b.teamIds) ? b.teamIds.filter(Boolean) : []
        const orgUnitIdsRaw: string[] = Array.isArray(b.orgUnitIds) ? b.orgUnitIds.filter(Boolean) : []
        const [validRecipients, validTeams, validOrgUnits] = await Promise.all([
            filterEmployeesInTenant(request.user.tenantId, recipientIds),
            filterTeamsInTenant(request.user.tenantId, teamIdsRaw),
            filterOrgUnitsInTenant(request.user.tenantId, orgUnitIdsRaw),
        ])
        if (validRecipients.length !== recipientIds.length) return bad(reply, 'One or more recipient ids are invalid')
        if (validTeams.length !== teamIdsRaw.length) return bad(reply, 'One or more team ids are invalid')
        if (validOrgUnits.length !== orgUnitIdsRaw.length) return bad(reply, 'One or more department ids are invalid')

        const input: RecognitionInput = {
            categoryKey,
            badgeKey: b.badgeKey ?? null,
            title,
            message,
            achievementDate: b.achievementDate ?? null,
            visibility,
            visibilityScopeId: b.visibilityScopeId ?? null,
            nominationType,
            points: typeof b.points === 'number' ? b.points : 0,
            attachments: Array.isArray(b.attachments) ? b.attachments : [],
            commentsDisabled: !!b.commentsDisabled,
            recipientEmployeeIds: validRecipients,
            teamIds: validTeams,
            orgUnitIds: validOrgUnits,
        }
        const requiresApproval = !!b.requireApproval
        const row = await createRecognition(
            request.user.tenantId,
            request.user.id ?? null,
            request.user.employeeId ?? null,
            request.user.name ?? null,
            input,
            requiresApproval,
        )

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'recognition', entityId: row.id, entityName: row.title, action: 'create',
            metadata: { kind: 'recognition', recipientCount: validRecipients.length, requiresApproval, source: 'portal' },
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => {})

        const full = await getRecognition(request.user.tenantId, row.id, request.user.id)
        if (row.status === 'published' && full) {
            fanOutGiveNotifications(request.user.tenantId, full, request.user.employeeId ?? null, request.user.name || 'Someone')
            awardPoints(request.user.tenantId, full, request.user.id ?? null, request.user.employeeId ?? null)
        }
        return reply.code(201).send({ data: full ?? row })
    })

    // ── Reactions ──────────────────────────────────────────────────────────────
    fastify.post('/:id/reactions', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const type = (request.body as any)?.type as ReactionType
        if (!VALID_REACTIONS.includes(type)) return bad(reply, 'Invalid reaction type')
        // Audience-gate: must be allowed to view this recognition before
        // we accept a reaction. Returns 404 (not 403) so we don't leak
        // "this recognition exists but you can't see it".
        const rec = await loadVisibleRecognition(request)
        if (!rec) return notFound(reply, 'Recognition not found')
        await setReaction(request.user.tenantId, id, request.user.id, type)
        return reply.send({ data: { ok: true } })
    })

    fastify.delete('/:id/reactions', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        // Same audience-gate as POST — even removing a reaction confirms
        // existence to the caller, so don't allow it on hidden rows.
        const rec = await loadVisibleRecognition(request)
        if (!rec) return notFound(reply, 'Recognition not found')
        await removeReaction(request.user.tenantId, id, request.user.id)
        return reply.send({ data: { ok: true } })
    })

    // ── Comments ────────────────────────────────────────────────────────────────
    fastify.get('/:id/comments', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        // Audience-gate before listing comments — the comment bodies would
        // otherwise leak from a hidden recognition.
        const rec = await loadVisibleRecognition(request)
        if (!rec) return notFound(reply, 'Recognition not found')
        return reply.send({ data: await listComments(request.user.tenantId, id) })
    })

    fastify.post('/:id/comments', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const body = typeof (request.body as any)?.body === 'string' ? (request.body as any).body.trim() : ''
        if (!body) return bad(reply, 'Comment body is required')
        const rec = await loadVisibleRecognition(request)
        if (!rec) return notFound(reply, 'Recognition not found')
        if ((rec as any).commentsDisabled) return bad(reply, 'Comments are disabled for this recognition')
        const parentId = typeof (request.body as any)?.parentId === 'string' ? (request.body as any).parentId : null
        const row = await addComment(request.user.tenantId, id, request.user.id, request.user.name ?? null, body, parentId)
        return reply.code(201).send({ data: row })
    })
}
