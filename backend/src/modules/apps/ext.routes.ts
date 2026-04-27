/**
 * External API routes — /api/ext/:appKey/*
 *
 * Third-party apps authenticate using their appKey (in the URL) +
 * app secret (X-API-Secret header or Authorization: Bearer).
 *
 * All endpoints are read-only and respect the scopes granted in
 * Connected Apps → Edit Permissions.
 *
 * Pagination: ?page=1&limit=20 (default limit: 20, max: 100)
 */

import { extAuthenticate, requireScope, clientIp } from './ext.middleware.js'
import { listEmployees, getEmployee } from '../employees/employees.service.js'
import { listPayrollRuns, getPayrollRun, getPayslipsWithEmployees } from '../payroll/payroll.service.js'
import { listLeaveRequests } from '../leave/leave.service.js'
import { getAttendance } from '../attendance/attendance.service.js'
import { listDocuments } from '../documents/documents.service.js'
import { db } from '../../db/index.js'
import { employees, tenants, appRequestLogs } from '../../db/schema/index.js'
import { eq, count } from 'drizzle-orm'

/** Convert page + limit → offset */
function pagination(query: any): { limit: number; offset: number } {
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)))
    const page = Math.max(1, Number(query.page ?? 1))
    return { limit, offset: (page - 1) * limit }
}

export default async function extRoutes(fastify: any): Promise<void> {
    const auth = [extAuthenticate]

    // ── Request logger — fires after every response in this plugin ────────────
    fastify.addHook('onResponse', async (request: any, reply: any) => {
        const ctx = request.appCtx
        if (!ctx) return // unauthenticated request — skip

        const latencyMs = request.extStart != null ? Date.now() - (request.extStart as number) : undefined
        const statusCode: number = reply.statusCode

        // Strip query string and /api/ext/:appKey prefix → normalised path
        const withoutQuery = (request.url as string).split('?')[0]
        const parts = withoutQuery.split('/')
        // ['', 'api', 'ext', 'app_live_xxx', ...rest]
        const pathParts = parts.slice(4)
        const path = pathParts.length > 0 ? '/' + pathParts.join('/') : '/'

        db.insert(appRequestLogs)
            .values({
                appId: ctx.appId,
                tenantId: ctx.tenantId,
                method: request.method,
                path,
                statusCode,
                latencyMs,
                ipAddress: clientIp(request),
            })
            .catch(() => { /* non-fatal */ })
    })

    // ── GET /api/ext/:appKey — app info & granted scopes ─────────────────────
    fastify.get('/:appKey', {
        config: { auth: false },
        preHandler: auth,
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const ctx = request.appCtx
        return reply.send({
            data: {
                app: ctx.name,
                tenantId: ctx.tenantId,
                scopes: ctx.scopes,
                apiVersion: 'v1',
            },
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // EMPLOYEES  (scope: employees:read)
    // ─────────────────────────────────────────────────────────────────────────

    fastify.get('/:appKey/employees', {
        preHandler: [...auth, requireScope('employees:read')],
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const { limit, offset } = pagination(request.query)
        const q = request.query as any
        const result = await listEmployees({
            tenantId: request.appCtx.tenantId,
            limit,
            offset,
            ...(q.search ? { search: q.search } : {}),
            ...(q.status ? { status: q.status } : {}),
            ...(q.department ? { department: q.department } : {}),
        })
        return reply.send({
            data: result.data,
            meta: { page: Math.floor(offset / limit) + 1, limit, total: result.total ?? result.data.length },
        })
    })

    fastify.get('/:appKey/employees/:id', {
        preHandler: [...auth, requireScope('employees:read')],
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string; appKey: string }
        const data = await getEmployee(request.appCtx.tenantId, id)
        return reply.send({ data })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // PAYROLL  (scope: payroll:read)
    // ─────────────────────────────────────────────────────────────────────────

    fastify.get('/:appKey/payroll', {
        preHandler: [...auth, requireScope('payroll:read')],
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const { limit, offset } = pagination(request.query)
        const runs = await listPayrollRuns(request.appCtx.tenantId, { limit, offset })
        return reply.send({
            data: runs.data,
            meta: { page: Math.floor(offset / limit) + 1, limit, total: runs.total },
        })
    })

    fastify.get('/:appKey/payroll/:id', {
        preHandler: [...auth, requireScope('payroll:read')],
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string; appKey: string }
        const data = await getPayrollRun(request.appCtx.tenantId, id)
        return reply.send({ data })
    })

    fastify.get('/:appKey/payroll/:id/payslips', {
        preHandler: [...auth, requireScope('payroll:read')],
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string; appKey: string }
        const { limit, offset } = pagination(request.query)
        const all = await getPayslipsWithEmployees(request.appCtx.tenantId, id)
        return reply.send({
            data: all.slice(offset, offset + limit),
            meta: { page: Math.floor(offset / limit) + 1, limit, total: all.length },
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // LEAVE  (scope: leave:read)
    // ─────────────────────────────────────────────────────────────────────────

    fastify.get('/:appKey/leave', {
        preHandler: [...auth, requireScope('leave:read')],
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const { limit, offset } = pagination(request.query)
        const q = request.query as any
        const result = await listLeaveRequests(request.appCtx.tenantId, {
            limit,
            offset,
            ...(q.status ? { status: q.status } : {}),
            ...(q.employeeId ? { employeeId: q.employeeId } : {}),
        })
        return reply.send({
            data: result.data,
            meta: { page: Math.floor(offset / limit) + 1, limit, total: result.total },
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // ATTENDANCE  (scope: attendance:read)
    // ─────────────────────────────────────────────────────────────────────────

    fastify.get('/:appKey/attendance', {
        preHandler: [...auth, requireScope('attendance:read')],
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const { limit, offset } = pagination(request.query)
        const q = request.query as any
        const result = await getAttendance(request.appCtx.tenantId, {
            limit,
            page: Math.floor(offset / limit) + 1,
            ...(q.from ? { startDate: q.from } : {}),
            ...(q.to ? { endDate: q.to } : {}),
            ...(q.employeeId ? { employeeId: q.employeeId } : {}),
            ...(q.status ? { status: q.status } : {}),
        })
        return reply.send({
            data: result.items,
            meta: { page: Math.floor(offset / limit) + 1, limit, total: result.total ?? result.items.length },
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // DOCUMENTS  (scope: documents:read)
    // ─────────────────────────────────────────────────────────────────────────

    fastify.get('/:appKey/documents', {
        preHandler: [...auth, requireScope('documents:read')],
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const { limit, offset } = pagination(request.query)
        const q = request.query as any
        const result = await listDocuments(request.appCtx.tenantId, {
            limit,
            offset,
            ...(q.status ? { status: q.status } : {}),
            ...(q.employeeId ? { employeeId: q.employeeId } : {}),
            ...(q.category ? { category: q.category } : {}),
        })
        return reply.send({
            data: result.data,
            meta: { page: Math.floor(offset / limit) + 1, limit, total: result.total ?? result.data.length },
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // ORGANIZATION  (scope: organization:read)
    // ─────────────────────────────────────────────────────────────────────────

    fastify.get('/:appKey/organization', {
        preHandler: [...auth, requireScope('settings:read')],
        schema: { tags: ['External API'] },
    }, async (request: any, reply: any) => {
        const tenantId = request.appCtx.tenantId

        const [tenant] = await db
            .select()
            .from(tenants)
            .where(eq(tenants.id, tenantId))
            .limit(1)

        const [{ value: employeeCount }] = await db
            .select({ value: count() })
            .from(employees)
            .where(eq(employees.tenantId, tenantId))

        return reply.send({
            data: {
                id: tenant.id,
                name: tenant.name,
                tradeLicenseNo: tenant.tradeLicenseNo,
                jurisdiction: tenant.jurisdiction,
                industryType: tenant.industryType,
                phone: tenant.phone,
                companySize: tenant.companySize,
                subscriptionPlan: tenant.subscriptionPlan,
                employeeCount,
            },
        })
    })
}
