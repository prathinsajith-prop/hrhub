import { recordActivity } from '../audit/audit.service.js'
import {
    createAnnouncement, updateAnnouncement, getAnnouncement, listAnnouncements,
    softDeleteAnnouncement, setStatus, listFeedForEmployee, employeeCanView,
    getReceiptStats, markViewed, markRead, acknowledge, notifyAnnouncementPublished,
    type AudienceRule,
} from './announcements.service.js'

export default async function announcementsRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const manage = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    const audit = (request: any, action: any, id: string, title: string, metadata?: Record<string, unknown>) =>
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'announcement', entityId: id, entityName: title, action, metadata,
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })

    function parseAudiences(body: any): AudienceRule[] {
        const raw = Array.isArray(body?.audiences) ? body.audiences : []
        return raw
            .filter((a: any) => a && typeof a.kind === 'string')
            .map((a: any) => ({ kind: a.kind, value: a.value ?? null }))
    }

    // ── Admin: list / detail ────────────────────────────────────────────────
    fastify.get('/', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { status, category, priority, q, limit = '20', offset = '0' } = request.query as Record<string, string>
        const result = await listAnnouncements(request.user.tenantId, {
            status, category, priority, q, limit: Math.min(Number(limit) || 20, 100), offset: Number(offset) || 0,
        })
        return reply.send(result)
    })

    fastify.get('/:id', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await getAnnouncement(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        return reply.send({ data: row })
    })

    fastify.get('/:id/receipts', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const stats = await getReceiptStats(request.user.tenantId, id)
        return reply.send({ data: stats })
    })

    // ── Admin: create / update / delete ──────────────────────────────────────
    fastify.post('/', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const b = request.body as any
        if (!b?.title || !String(b.title).trim()) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Title is required' })
        const row = await createAnnouncement(request.user.tenantId, request.user.id, request.user.name, {
            title: String(b.title).trim(), body: b.body, category: b.category, priority: b.priority,
            pinned: b.pinned, requireAck: b.requireAck, attachments: b.attachments, publishAt: b.publishAt, expireAt: b.expireAt,
        }, parseAudiences(b))
        audit(request, 'create', row.id, row.title, { category: row.category, priority: row.priority })
        return reply.code(201).send({ data: row })
    })

    fastify.patch('/:id', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = request.body as any
        const audiences = b?.audiences !== undefined ? parseAudiences(b) : undefined
        const row = await updateAnnouncement(request.user.tenantId, id, {
            title: b.title, body: b.body, category: b.category, priority: b.priority,
            pinned: b.pinned, requireAck: b.requireAck, attachments: b.attachments, publishAt: b.publishAt, expireAt: b.expireAt,
        }, audiences)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        audit(request, 'update', row.id, row.title)
        return reply.send({ data: row })
    })

    fastify.delete('/:id', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await softDeleteAnnouncement(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        audit(request, 'delete', row.id, row.title)
        return reply.code(204).send()
    })

    // ── Admin: lifecycle transitions ─────────────────────────────────────────
    fastify.post('/:id/publish', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await setStatus(request.user.tenantId, id, 'published')
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        audit(request, 'publish', row.id, row.title, { priority: row.priority })

        // Fan out notifications to the resolved audience (fire-and-forget).
        notifyAnnouncementPublished(request.user.tenantId, row, request.log).catch((err: unknown) => {
            request.log?.warn?.({ err, announcementId: id }, 'announcement publish fan-out failed')
        })

        return reply.send({ data: row })
    })

    fastify.post('/:id/schedule', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const existing = await getAnnouncement(request.user.tenantId, id)
        if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        if (!existing.publishAt) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Set a publish date before scheduling' })
        const row = await setStatus(request.user.tenantId, id, 'scheduled')
        audit(request, 'schedule', id, existing.title, { publishAt: existing.publishAt })
        return reply.send({ data: row })
    })

    fastify.post('/:id/archive', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await setStatus(request.user.tenantId, id, 'archived')
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        audit(request, 'archive', row.id, row.title)
        return reply.send({ data: row })
    })

    fastify.post('/:id/expire', { ...manage, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await setStatus(request.user.tenantId, id, 'expired')
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        audit(request, 'expire', row.id, row.title)
        return reply.send({ data: row })
    })

    // ── Employee feed (any authenticated user with an employee record) ───────
    fastify.get('/feed', { ...auth, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const employeeId = request.user.employeeId
        if (!employeeId) return reply.send({ data: [], total: 0, limit: 0, offset: 0, hasMore: false })
        const { category, limit = '20', offset = '0' } = request.query as Record<string, string>
        const result = await listFeedForEmployee(request.user.tenantId, employeeId, {
            category, limit: Math.min(Number(limit) || 20, 50), offset: Number(offset) || 0,
        })
        return reply.send(result)
    })

    fastify.get('/feed/:id', { ...auth, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const employeeId = request.user.employeeId
        if (!employeeId || !(await employeeCanView(request.user.tenantId, employeeId, id))) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        }
        const row = await getAnnouncement(request.user.tenantId, id)
        markViewed(request.user.tenantId, id, employeeId).catch(() => { })
        markRead(request.user.tenantId, id, employeeId).catch(() => { })
        return reply.send({ data: row })
    })

    fastify.post('/:id/read', { ...auth, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        if (!request.user.employeeId) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'No employee record linked' })
        await markRead(request.user.tenantId, id, request.user.employeeId)
        return reply.send({ data: { ok: true } })
    })

    fastify.post('/:id/acknowledge', { ...auth, schema: { tags: ['Announcements'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const employeeId = request.user.employeeId
        if (!employeeId || !(await employeeCanView(request.user.tenantId, employeeId, id))) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Announcement not found' })
        }
        await acknowledge(request.user.tenantId, id, employeeId)
        // Acknowledgement is compliance-relevant → audit (mirrored onto the employee).
        const ann = await getAnnouncement(request.user.tenantId, id)
        audit(request, 'acknowledge', id, ann?.title ?? 'Announcement')
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: employeeId, entityName: ann?.title ?? 'Announcement', action: 'acknowledge',
            metadata: { kind: 'announcement', subKind: 'acknowledge', announcementId: id },
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: { ok: true } })
    })
}
