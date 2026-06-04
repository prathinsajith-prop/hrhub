import { recordActivity } from '../audit/audit.service.js'
import { notifyEmployeesBulk } from '../notifications/notifications.service.js'
import {
    createRecognition,
    updateRecognition,
    softDeleteRecognition,
    getRecognition,
    listRecognitions,
    listFeed,
    listTrending,
    setStatus,
    pinRecognition,
    setReaction,
    removeReaction,
    listComments,
    addComment,
    editComment,
    deleteComment,
    getComment,
    listCategories,
    createCategory,
    updateCategory,
    archiveCategory,
    seedDefaultCategories,
    listBadges,
    createBadge,
    updateBadge,
    archiveBadge,
    seedDefaultBadges,
    getUserPointsBalance,
    listUserPointsLedger,
    grantPoints,
    redeemPoints,
    recordRecognitionPoints,
    resolveRecipientUserIds,
    resolveManagersOfRecipients,
    submitForApproval,
    approveRecognition,
    rejectRecognition,
    holdRecognition,
    returnRecognition,
    listPendingApprovals,
    getAnalyticsSummary,
    getLeaderboard,
    getTopRecognized,
    getTopGivers,
    getBadgesDistribution,
    getEmployeeRecognitionProfile,
    filterEmployeesInTenant,
    filterTeamsInTenant,
    filterOrgUnitsInTenant,
    canViewRecognition,
    isManagerOfAnyRecipient,
    type RecognitionInput,
    type ReactionType,
} from './recognition.service.js'

export default async function recognitionRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const manage = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    const audit = (request: any, action: any, id: string, name: string, metadata?: Record<string, unknown>) =>
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'recognition',
            entityId: id,
            entityName: name,
            action,
            metadata,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

    const isHrRole = (role: string) => role === 'hr_manager' || role === 'super_admin'

    function bad(reply: any, message: string) {
        return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
    }
    function forbidden(reply: any, message = 'Forbidden') {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message })
    }
    function notFound(reply: any, message = 'Not found') {
        return reply.code(404).send({ statusCode: 404, error: 'Not Found', message })
    }

    function parseLimitOffset(q: any) {
        const limit = Math.min(Math.max(Number(q?.limit) || 20, 1), 100)
        const offset = Math.max(Number(q?.offset) || 0, 0)
        return { limit, offset }
    }

    // Fire-and-forget publish fan-out
    async function fanOutPublishedNotifications(request: any, recognition: any) {
        try {
            const recipientEmployeeIds: string[] = Array.isArray(recognition?.recipients)
                ? recognition.recipients.map((r: any) => r.employeeId).filter(Boolean)
                : []
            if (!recipientEmployeeIds.length) return
            const giverName = recognition.giverName || request.user.name || 'Someone'
            await notifyEmployeesBulk(request.user.tenantId, recipientEmployeeIds, {
                type: 'success',
                title: 'You received a recognition',
                message: `${giverName} appreciated you: ${recognition.title}`,
                // Recipients are employees who read in the portal — deep-link to the
                // portal recognition detail (not the admin /recognition route, which 404s there).
                actionUrl: `/me/recognition/${recognition.id}`,
            })
            // Also notify the recipients' direct managers (excluding the giver).
            const managerIds = (await resolveManagersOfRecipients(request.user.tenantId, recipientEmployeeIds))
                // Exclude the giver and anyone already notified as a recipient,
                // so a manager who is also a recipient isn't double-notified.
                .filter((id) => id !== recognition.giverEmployeeId && !recipientEmployeeIds.includes(id))
            if (managerIds.length) {
                await notifyEmployeesBulk(request.user.tenantId, managerIds, {
                    type: 'info',
                    title: 'A team member was recognized',
                    message: `${recognition.title}`,
                    actionUrl: `/me/recognition/${recognition.id}`,
                })
            }
        } catch (err) {
            request.log?.warn?.({ err, recognitionId: recognition?.id }, 'recognition publish fan-out failed')
        }
    }

    // Fire-and-forget points ledger write for published recognitions
    async function awardPointsForPublished(request: any, recognition: any) {
        try {
            const points = Number(recognition?.points || 0)
            if (!points) return
            const recipientEmployeeIds: string[] = Array.isArray(recognition?.recipients)
                ? recognition.recipients.map((r: any) => r.employeeId).filter(Boolean)
                : []
            if (!recipientEmployeeIds.length) return
            const resolved = await resolveRecipientUserIds(request.user.tenantId, recipientEmployeeIds)
            const userIds = resolved.map((r) => r.userId)
            const empIds = resolved.map((r) => r.employeeId)
            await recordRecognitionPoints(
                request.user.tenantId,
                recognition.id,
                recognition.giverUserId ?? request.user.id ?? null,
                recognition.giverEmployeeId ?? request.user.employeeId ?? null,
                points,
                userIds,
                empIds,
            )
        } catch (err) {
            request.log?.warn?.({ err, recognitionId: recognition?.id }, 'recognition points write failed')
        }
    }

    // ── List / detail ────────────────────────────────────────────────────────
    fastify.get('/', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const q = request.query as Record<string, string>
        const { limit, offset } = parseLimitOffset(q)
        const result = await listRecognitions(request.user.tenantId, {
            status: q.status, category: q.category, visibility: q.visibility, q: q.q,
            dateFrom: q.dateFrom, dateTo: q.dateTo, recipientId: q.recipientId, giverId: q.giverId,
            limit, offset,
        })
        return reply.send(result)
    })

    fastify.get('/feed', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const q = request.query as Record<string, string>
        const { limit, offset } = parseLimitOffset(q)
        const result = await listFeed(request.user.tenantId, {
            userId: request.user.id,
            employeeId: request.user.employeeId ?? null,
            role: request.user.role,
            department: request.user.department ?? null,
        }, { limit, offset })
        return reply.send(result)
    })

    fastify.get('/trending', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const q = request.query as Record<string, string>
        const limit = Math.min(Math.max(Number(q?.limit) || 10, 1), 50)
        const data = await listTrending(request.user.tenantId, limit, request.user.id)
        return reply.send({ data })
    })

    fastify.get('/:id', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await getRecognition(request.user.tenantId, id, request.user.id)
        if (!row) return notFound(reply, 'Recognition not found')
        // Visibility gate: prevent leakage of private/team/dept/etc. recognitions
        // to users who shouldn't see them, even if they know the id.
        const allowed = await canViewRecognition(request.user.tenantId, row, {
            userId: request.user.id ?? null,
            employeeId: request.user.employeeId ?? null,
            role: request.user.role,
        })
        if (!allowed) return notFound(reply, 'Recognition not found')
        return reply.send({ data: row })
    })

    // ── Create / update / delete ─────────────────────────────────────────────
    fastify.post('/', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const b = (request.body ?? {}) as any
        const title = typeof b.title === 'string' ? b.title.trim() : ''
        const message = typeof b.message === 'string' ? b.message.trim() : ''
        const categoryKey = typeof b.categoryKey === 'string' ? b.categoryKey.trim() : ''
        const recipientIds = Array.isArray(b.recipientEmployeeIds) ? b.recipientEmployeeIds.filter((x: any) => typeof x === 'string' && x) : []
        if (!title) return bad(reply, 'Title is required')
        if (!message) return bad(reply, 'Message is required')
        if (!categoryKey) return bad(reply, 'categoryKey is required')
        if (!recipientIds.length) return bad(reply, 'At least one recipient is required')

        // Validate enums to prevent garbage values from reaching the DB.
        const validVisibilities = ['public', 'team', 'department', 'branch', 'manager', 'hr', 'private'] as const
        const validNominations = ['peer', 'manager', 'leadership', 'self_nomination', 'employee_of_month'] as const
        const visibility = validVisibilities.includes(b.visibility) ? b.visibility : 'public'
        const nominationType = validNominations.includes(b.nominationType) ? b.nominationType : 'peer'

        // Cross-tenant injection guard: every employee/team/org-unit id MUST
        // belong to the caller's tenant. FKs alone don't enforce this.
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

        audit(request, 'create', row.id, row.title, {
            category: row.categoryKey,
            recipientCount: recipientIds.length,
            requiresApproval,
        })

        // If instant publish — fan out notifications & points
        if (row.status === 'published') {
            const full = await getRecognition(request.user.tenantId, row.id, request.user.id)
            if (full) {
                fanOutPublishedNotifications(request, full)
                awardPointsForPublished(request, full)
                audit(request, 'publish', row.id, row.title)
            }
        }

        const fullRow = await getRecognition(request.user.tenantId, row.id, request.user.id)
        return reply.code(201).send({ data: fullRow ?? row })
    })

    fastify.patch('/:id', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const existing = await getRecognition(request.user.tenantId, id, request.user.id)
        if (!existing) return notFound(reply, 'Recognition not found')
        const isOwner = existing.giverUserId && existing.giverUserId === request.user.id
        const isMod = isHrRole(request.user.role)
        if (!isOwner && !isMod) return forbidden(reply)
        if (isOwner && !isMod && existing.status !== 'draft') {
            return forbidden(reply, 'Only drafts can be edited by the author')
        }
        const b = (request.body ?? {}) as any
        const patch: Partial<RecognitionInput> = {}
        if (b.categoryKey !== undefined) patch.categoryKey = b.categoryKey
        if (b.badgeKey !== undefined) patch.badgeKey = b.badgeKey
        if (b.title !== undefined) patch.title = String(b.title).trim()
        if (b.message !== undefined) patch.message = String(b.message).trim()
        if (b.achievementDate !== undefined) patch.achievementDate = b.achievementDate
        if (b.visibility !== undefined) patch.visibility = b.visibility
        if (b.visibilityScopeId !== undefined) patch.visibilityScopeId = b.visibilityScopeId
        if (b.nominationType !== undefined) patch.nominationType = b.nominationType
        if (b.points !== undefined) patch.points = Number(b.points) || 0
        if (b.attachments !== undefined) patch.attachments = Array.isArray(b.attachments) ? b.attachments : []
        if (b.commentsDisabled !== undefined) patch.commentsDisabled = !!b.commentsDisabled

        // Enum guards on visibility / nominationType when present.
        const validVisibilities = ['public', 'team', 'department', 'branch', 'manager', 'hr', 'private'] as const
        const validNominations = ['peer', 'manager', 'leadership', 'self_nomination', 'employee_of_month'] as const
        if (patch.visibility !== undefined && !validVisibilities.includes(patch.visibility)) {
            return bad(reply, 'Invalid visibility')
        }
        if (patch.nominationType !== undefined && !validNominations.includes(patch.nominationType)) {
            return bad(reply, 'Invalid nomination type')
        }

        // Cross-tenant injection guard for any provided lists.
        if (Array.isArray(b.recipientEmployeeIds)) {
            const raw = b.recipientEmployeeIds.filter(Boolean)
            const valid = await filterEmployeesInTenant(request.user.tenantId, raw)
            if (valid.length !== raw.length) return bad(reply, 'One or more recipient ids are invalid')
            patch.recipientEmployeeIds = valid
        }
        if (Array.isArray(b.teamIds)) {
            const raw = b.teamIds.filter(Boolean)
            const valid = await filterTeamsInTenant(request.user.tenantId, raw)
            if (valid.length !== raw.length) return bad(reply, 'One or more team ids are invalid')
            patch.teamIds = valid
        }
        if (Array.isArray(b.orgUnitIds)) {
            const raw = b.orgUnitIds.filter(Boolean)
            const valid = await filterOrgUnitsInTenant(request.user.tenantId, raw)
            if (valid.length !== raw.length) return bad(reply, 'One or more department ids are invalid')
            patch.orgUnitIds = valid
        }

        const row = await updateRecognition(request.user.tenantId, id, patch)
        if (!row) return notFound(reply, 'Recognition not found')
        audit(request, 'update', row.id, row.title)
        const full = await getRecognition(request.user.tenantId, id, request.user.id)
        return reply.send({ data: full ?? row })
    })

    fastify.delete('/:id', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const existing = await getRecognition(request.user.tenantId, id, request.user.id)
        if (!existing) return notFound(reply, 'Recognition not found')
        const isOwner = existing.giverUserId && existing.giverUserId === request.user.id
        if (!isOwner && !isHrRole(request.user.role)) return forbidden(reply)
        const row = await softDeleteRecognition(request.user.tenantId, id)
        if (!row) return notFound(reply, 'Recognition not found')
        audit(request, 'delete', row.id, row.title)
        return reply.code(204).send()
    })

    fastify.post('/:id/publish', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const existing = await getRecognition(request.user.tenantId, id, request.user.id)
        if (!existing) return notFound(reply, 'Recognition not found')
        const isOwner = existing.giverUserId && existing.giverUserId === request.user.id
        const isMod = isHrRole(request.user.role)
        if (!isOwner && !isMod) return forbidden(reply)
        if (!isMod && existing.status !== 'draft') {
            return forbidden(reply, 'Only drafts can be published by the author')
        }
        // Idempotency: never re-publish an already-published recognition — doing
        // so would re-award points and re-fire notifications. Applies to everyone.
        if (existing.status === 'published') {
            return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Recognition is already published' })
        }
        const row = await setStatus(request.user.tenantId, id, 'published', { workflowState: 'completed' })
        if (!row) return notFound(reply, 'Recognition not found')
        audit(request, 'publish', row.id, row.title)
        const full = await getRecognition(request.user.tenantId, id, request.user.id)
        if (full) {
            fanOutPublishedNotifications(request, full)
            awardPointsForPublished(request, full)
        }
        return reply.send({ data: full ?? row })
    })

    // ── Approvals ────────────────────────────────────────────────────────────
    fastify.post('/:id/approve', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = (request.body ?? {}) as any
        const step: 'manager' | 'hr' = b.step === 'hr' ? 'hr' : (b.step === 'manager' ? 'manager' : (isHrRole(request.user.role) ? 'hr' : 'manager'))
        const existing = await getRecognition(request.user.tenantId, id, request.user.id)
        if (!existing) return notFound(reply, 'Recognition not found')
        // Only an in-flight recognition can be approved — block re-approving a
        // published/rejected one (which would double-award points + re-notify).
        if (existing.status !== 'pending' && existing.status !== 'approved') {
            return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Recognition is not awaiting approval' })
        }
        // HR step requires HR role
        if (step === 'hr' && !isHrRole(request.user.role)) return forbidden(reply, 'HR step requires HR role')
        // Manager step requires the approver to actually be the direct manager
        // of at least one recipient — or HR. Without this gate, any authenticated
        // user could approve at the manager tier.
        if (step === 'manager' && !isHrRole(request.user.role)) {
            const isManager = await isManagerOfAnyRecipient(request.user.tenantId, id, request.user.employeeId ?? null)
            if (!isManager) return forbidden(reply, 'Only the recipient\'s manager can approve at the manager step')
        }
        const row = await approveRecognition(
            request.user.tenantId,
            id,
            request.user.id,
            request.user.name ?? 'Unknown',
            step,
            b.comment ?? undefined,
        )
        if (!row) return notFound(reply, 'Recognition not found')
        audit(request, 'approve', row.id, row.title, { step })
        if (row.status === 'published') {
            const full = await getRecognition(request.user.tenantId, id, request.user.id)
            if (full) {
                fanOutPublishedNotifications(request, full)
                awardPointsForPublished(request, full)
            }
        }
        const full = await getRecognition(request.user.tenantId, id, request.user.id)
        return reply.send({ data: full ?? row })
    })

    fastify.post('/:id/reject', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = (request.body ?? {}) as any
        const reason = typeof b.reason === 'string' ? b.reason.trim() : ''
        if (!reason) return bad(reply, 'Reason is required')
        if (!isHrRole(request.user.role)) return forbidden(reply, 'HR role required to reject')
        const row = await rejectRecognition(
            request.user.tenantId,
            id,
            request.user.id,
            request.user.name ?? 'Unknown',
            reason,
        )
        if (!row) return notFound(reply, 'Recognition not found')
        audit(request, 'reject', row.id, row.title, { reason })
        const full = await getRecognition(request.user.tenantId, id, request.user.id)
        return reply.send({ data: full ?? row })
    })

    fastify.post('/:id/hold', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = (request.body ?? {}) as any
        if (!isHrRole(request.user.role)) return forbidden(reply, 'HR role required')
        const row = await holdRecognition(
            request.user.tenantId,
            id,
            request.user.id,
            request.user.name ?? 'Unknown',
            b.comment ?? undefined,
        )
        if (!row) return notFound(reply, 'Recognition not found')
        // 'hold' isn't in the AuditAction union — emit as 'update' with metadata
        audit(request, 'update', row.id, row.title, { subAction: 'hold', comment: b.comment ?? null })
        const full = await getRecognition(request.user.tenantId, id, request.user.id)
        return reply.send({ data: full ?? row })
    })

    fastify.post('/:id/submit', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const existing = await getRecognition(request.user.tenantId, id, request.user.id)
        if (!existing) return notFound(reply, 'Recognition not found')
        const isOwner = existing.giverUserId && existing.giverUserId === request.user.id
        if (!isOwner && !isHrRole(request.user.role)) return forbidden(reply)
        const row = await submitForApproval(request.user.tenantId, id)
        if (!row) return notFound(reply, 'Recognition not found')
        audit(request, 'submit', row.id, row.title)
        const full = await getRecognition(request.user.tenantId, id, request.user.id)
        return reply.send({ data: full ?? row })
    })

    fastify.post('/:id/return', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = (request.body ?? {}) as any
        if (!isHrRole(request.user.role)) return forbidden(reply, 'HR role required')
        const row = await returnRecognition(
            request.user.tenantId,
            id,
            request.user.id,
            request.user.name ?? 'Unknown',
            b.comment ?? undefined,
        )
        if (!row) return notFound(reply, 'Recognition not found or not pending')
        audit(request, 'update', row.id, row.title, { subAction: 'return', comment: b.comment ?? null })
        const full = await getRecognition(request.user.tenantId, id, request.user.id)
        return reply.send({ data: full ?? row })
    })

    fastify.get('/approvals/pending', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const q = request.query as Record<string, string>
        const { limit, offset } = parseLimitOffset(q)
        const result = await listPendingApprovals(
            request.user.tenantId,
            request.user.id,
            request.user.role,
            { limit, offset },
        )
        return reply.send(result)
    })

    // ── Pin / Unpin ──────────────────────────────────────────────────────────
    fastify.post('/:id/pin', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await pinRecognition(request.user.tenantId, id, true)
        if (!row) return notFound(reply, 'Recognition not found')
        audit(request, 'update', row.id, row.title, { subAction: 'pin' })
        return reply.send({ data: row })
    })

    fastify.post('/:id/unpin', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await pinRecognition(request.user.tenantId, id, false)
        if (!row) return notFound(reply, 'Recognition not found')
        audit(request, 'update', row.id, row.title, { subAction: 'unpin' })
        return reply.send({ data: row })
    })

    // ── Reactions ────────────────────────────────────────────────────────────
    fastify.post('/:id/reactions', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = (request.body ?? {}) as any
        const allowed: ReactionType[] = ['like', 'celebrate', 'love', 'support', 'congrats']
        if (!b?.type || !allowed.includes(b.type)) return bad(reply, 'Invalid reaction type')
        const existing = await getRecognition(request.user.tenantId, id, request.user.id)
        if (!existing) return notFound(reply, 'Recognition not found')
        await setReaction(request.user.tenantId, id, request.user.id, b.type)
        audit(request, 'update', id, existing.title, { subAction: 'react', reactionType: b.type })
        return reply.send({ data: { ok: true, type: b.type } })
    })

    fastify.delete('/:id/reactions', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await removeReaction(request.user.tenantId, id, request.user.id)
        return reply.code(204).send()
    })

    // ── Comments ─────────────────────────────────────────────────────────────
    fastify.get('/:id/comments', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const rows = await listComments(request.user.tenantId, id)
        return reply.send({ data: rows })
    })

    fastify.post('/:id/comments', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = (request.body ?? {}) as any
        const body = typeof b.body === 'string' ? b.body.trim() : ''
        if (!body) return bad(reply, 'Body is required')
        const existing = await getRecognition(request.user.tenantId, id, request.user.id)
        if (!existing) return notFound(reply, 'Recognition not found')
        if (existing.commentsDisabled) return forbidden(reply, 'Comments are disabled')
        const row = await addComment(
            request.user.tenantId,
            id,
            request.user.id,
            request.user.name ?? null,
            body,
            b.parentId ?? null,
        )
        audit(request, 'create', row.id, `Comment on ${existing.title}`, { recognitionId: id, parentId: b.parentId ?? null })
        return reply.code(201).send({ data: row })
    })

    fastify.patch('/:id/comments/:commentId', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id, commentId } = request.params as { id: string; commentId: string }
        const b = (request.body ?? {}) as any
        const body = typeof b.body === 'string' ? b.body.trim() : ''
        if (!body) return bad(reply, 'Body is required')
        const existing = await getComment(request.user.tenantId, commentId)
        if (!existing) return notFound(reply, 'Comment not found')
        // Scope the comment to the recognition in the URL — prevents editing
        // a comment from one recognition via another's URL path.
        if (existing.recognitionId !== id) return notFound(reply, 'Comment not found')
        if (existing.userId !== request.user.id) return forbidden(reply, 'You can only edit your own comments')
        const row = await editComment(request.user.tenantId, commentId, request.user.id, body)
        if (!row) return notFound(reply, 'Comment not found')
        audit(request, 'update', row.id, 'Recognition comment')
        return reply.send({ data: row })
    })

    fastify.delete('/:id/comments/:commentId', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id, commentId } = request.params as { id: string; commentId: string }
        const existing = await getComment(request.user.tenantId, commentId)
        if (!existing) return notFound(reply, 'Comment not found')
        if (existing.recognitionId !== id) return notFound(reply, 'Comment not found')
        const isOwner = existing.userId === request.user.id
        const isMod = isHrRole(request.user.role)
        if (!isOwner && !isMod) return forbidden(reply)
        const row = await deleteComment(request.user.tenantId, commentId, request.user.id, isMod)
        if (!row) return notFound(reply, 'Comment not found')
        audit(request, 'delete', row.id, 'Recognition comment')
        return reply.code(204).send()
    })

    // ── Categories ───────────────────────────────────────────────────────────
    fastify.get('/categories', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const rows = await listCategories(request.user.tenantId)
        return reply.send({ data: rows })
    })

    fastify.post('/categories', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const b = (request.body ?? {}) as any
        const key = typeof b.key === 'string' ? b.key.trim() : ''
        const label = typeof b.label === 'string' ? b.label.trim() : ''
        if (!key) return bad(reply, 'key is required')
        if (!label) return bad(reply, 'label is required')
        try {
            const row = await createCategory(request.user.tenantId, {
                key, label,
                description: b.description ?? null,
                icon: b.icon, color: b.color, sortOrder: b.sortOrder,
            })
            audit(request, 'create', row.id, row.label, { entityKind: 'recognition_category', key: row.key })
            return reply.code(201).send({ data: row })
        } catch (err: any) {
            if (err?.code === '23505') return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Category key already exists' })
            throw err
        }
    })

    fastify.patch('/categories/:id', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = (request.body ?? {}) as any
        const row = await updateCategory(request.user.tenantId, id, {
            key: b.key,
            label: b.label,
            description: b.description,
            icon: b.icon,
            color: b.color,
            sortOrder: b.sortOrder,
        })
        if (!row) return notFound(reply, 'Category not found')
        audit(request, 'update', row.id, row.label, { entityKind: 'recognition_category' })
        return reply.send({ data: row })
    })

    fastify.delete('/categories/:id', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await archiveCategory(request.user.tenantId, id)
        if (!row) return notFound(reply, 'Category not found')
        audit(request, 'archive', row.id, row.label, { entityKind: 'recognition_category' })
        return reply.code(204).send()
    })

    fastify.post('/categories/seed-defaults', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const result = await seedDefaultCategories(request.user.tenantId)
        // Use the tenant id as the entity id — activity_logs.entity_id is uuid-typed.
        audit(request, 'create', request.user.tenantId, 'Seed default categories', { ...result })
        return reply.send({ data: result })
    })

    // ── Badges ───────────────────────────────────────────────────────────────
    fastify.get('/badges', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const rows = await listBadges(request.user.tenantId)
        return reply.send({ data: rows })
    })

    // Allow PATCH to validate badge level too
    fastify.post('/badges', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const b = (request.body ?? {}) as any
        const key = typeof b.key === 'string' ? b.key.trim() : ''
        const label = typeof b.label === 'string' ? b.label.trim() : ''
        const level = typeof b.level === 'string' ? b.level : 'bronze'
        if (!key) return bad(reply, 'key is required')
        if (!label) return bad(reply, 'label is required')
        if (!['bronze', 'silver', 'gold', 'platinum', 'diamond'].includes(level)) return bad(reply, 'Invalid level')
        try {
            const row = await createBadge(request.user.tenantId, {
                key, label, description: b.description ?? null,
                icon: b.icon, color: b.color, level: level as any,
                categoryKey: b.categoryKey ?? null,
                defaultPoints: b.defaultPoints, sortOrder: b.sortOrder,
            })
            audit(request, 'create', row.id, row.label, { entityKind: 'recognition_badge', key: row.key })
            return reply.code(201).send({ data: row })
        } catch (err: any) {
            if (err?.code === '23505') return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Badge key already exists' })
            throw err
        }
    })

    fastify.patch('/badges/:id', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = (request.body ?? {}) as any
        if (b.level !== undefined && !['bronze', 'silver', 'gold', 'platinum', 'diamond'].includes(b.level)) {
            return bad(reply, 'Invalid level')
        }
        const row = await updateBadge(request.user.tenantId, id, {
            key: b.key,
            label: b.label,
            description: b.description,
            icon: b.icon,
            color: b.color,
            level: b.level,
            categoryKey: b.categoryKey,
            defaultPoints: b.defaultPoints,
            sortOrder: b.sortOrder,
        })
        if (!row) return notFound(reply, 'Badge not found')
        audit(request, 'update', row.id, row.label, { entityKind: 'recognition_badge' })
        return reply.send({ data: row })
    })

    fastify.delete('/badges/:id', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await archiveBadge(request.user.tenantId, id)
        if (!row) return notFound(reply, 'Badge not found')
        audit(request, 'archive', row.id, row.label, { entityKind: 'recognition_badge' })
        return reply.code(204).send()
    })

    fastify.post('/badges/seed-defaults', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const result = await seedDefaultBadges(request.user.tenantId)
        audit(request, 'create', request.user.tenantId, 'Seed default badges', { ...result })
        return reply.send({ data: result })
    })

    // ── Points ───────────────────────────────────────────────────────────────
    fastify.get('/points/balance/:userId', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { userId } = request.params as { userId: string }
        // Allow self or HR
        if (userId !== request.user.id && !isHrRole(request.user.role)) return forbidden(reply)
        const balance = await getUserPointsBalance(request.user.tenantId, userId)
        return reply.send({ data: balance })
    })

    fastify.get('/points/me', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const q = request.query as Record<string, string>
        const { limit, offset } = parseLimitOffset(q)
        const [balance, ledger] = await Promise.all([
            getUserPointsBalance(request.user.tenantId, request.user.id),
            listUserPointsLedger(request.user.tenantId, request.user.id, { limit, offset }),
        ])
        return reply.send({ data: { balance, ledger } })
    })

    fastify.post('/points/redeem', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const b = (request.body ?? {}) as any
        const points = Number(b.points)
        const description = typeof b.description === 'string' ? b.description.trim() : ''
        if (!Number.isFinite(points) || points <= 0) return bad(reply, 'points must be a positive number')
        if (!description) return bad(reply, 'description is required')
        try {
            const row = await redeemPoints(request.user.tenantId, request.user.id, points, description, request.user.id)
            if (!row) return bad(reply, 'Redemption failed')
            audit(request, 'update', row.id, 'Points redeemed', { points, description })
            return reply.code(201).send({ data: row })
        } catch (err: any) {
            if (err?.statusCode === 400) return bad(reply, err.message)
            throw err
        }
    })

    fastify.post('/points/grant', { ...manage, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const b = (request.body ?? {}) as any
        const userId = typeof b.userId === 'string' ? b.userId : ''
        const points = Number(b.points)
        const description = typeof b.description === 'string' ? b.description.trim() : ''
        if (!userId) return bad(reply, 'userId is required')
        if (!Number.isFinite(points) || points <= 0) return bad(reply, 'points must be a positive number')
        if (!description) return bad(reply, 'description is required')
        const row = await grantPoints(
            request.user.tenantId,
            userId,
            b.employeeId ?? null,
            points,
            description,
            request.user.id,
        )
        audit(request, 'create', row.id, 'Points grant', { targetUserId: userId, points, description })
        return reply.code(201).send({ data: row })
    })

    // ── Analytics ────────────────────────────────────────────────────────────
    function parsePeriodDays(q: Record<string, string>) {
        const p = (q.period ?? '30d').toString()
        const match = /^(\d+)d$/i.exec(p)
        const days = match ? Number(match[1]) : Number(p) || 30
        return Math.max(1, Math.min(days, 365))
    }

    fastify.get('/analytics/summary', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        if (!isHrRole(request.user.role) && request.user.role !== 'dept_head') return forbidden(reply)
        const q = request.query as Record<string, string>
        const data = await getAnalyticsSummary(request.user.tenantId, parsePeriodDays(q))
        return reply.send({ data })
    })

    fastify.get('/analytics/leaderboard', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const q = request.query as Record<string, string>
        const type: 'received' | 'given' = q.type === 'given' ? 'given' : 'received'
        const limit = Math.min(Math.max(Number(q.limit) || 10, 1), 50)
        const data = await getLeaderboard(request.user.tenantId, parsePeriodDays(q), type, limit)
        return reply.send({ data })
    })

    fastify.get('/analytics/top-recognized', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const q = request.query as Record<string, string>
        const limit = Math.min(Math.max(Number(q.limit) || 10, 1), 50)
        const data = await getTopRecognized(request.user.tenantId, parsePeriodDays(q), limit)
        return reply.send({ data })
    })

    fastify.get('/analytics/top-givers', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const q = request.query as Record<string, string>
        const limit = Math.min(Math.max(Number(q.limit) || 10, 1), 50)
        const data = await getTopGivers(request.user.tenantId, parsePeriodDays(q), limit)
        return reply.send({ data })
    })

    fastify.get('/analytics/badges-distribution', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const q = request.query as Record<string, string>
        const data = await getBadgesDistribution(request.user.tenantId, parsePeriodDays(q))
        return reply.send({ data })
    })

    // ── Employee profile integration ─────────────────────────────────────────
    fastify.get('/employee/:employeeId', { ...auth, schema: { tags: ['Recognition'] } }, async (request: any, reply: any) => {
        const { employeeId } = request.params as { employeeId: string }
        // Validate target employee belongs to caller's tenant — surface 404
        // instead of silently returning empty results for a foreign id.
        const valid = await filterEmployeesInTenant(request.user.tenantId, [employeeId])
        if (!valid.length) return notFound(reply, 'Employee not found')
        const data = await getEmployeeRecognitionProfile(request.user.tenantId, employeeId)
        return reply.send({ data })
    })
}
