import { alias } from 'drizzle-orm/pg-core'
import { and, eq, ilike, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { employees } from '../../db/schema/index.js'
import { e400, e403, e404 } from '../../lib/errors.js'
import { paginationSchema, parseUuidParam, updateMyProfileSchema, validate } from '../../lib/validation.js'
import { recordActivity } from '../../lib/audit.js'
import { canAccessEmployee, getReportingSubtreeIds, isDeptHead } from '../../lib/scoping.js'

const ALLOWED_SELF_UPDATE_FIELDS = [
    'phone',
    'mobileNo',
    'personalEmail',
    'emergencyContact',
    'emergencyContactName',
    'emergencyContactPhone',
    'homeCountryAddress',
] as const

async function getEmployeeById(tenantId: string, id: string) {
    const [row] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
        .limit(1)
    return row ?? null
}

/**
 * Same as getEmployeeById but also resolves the reporting-to manager via a self-join
 * so the manager-detail screen can render "Reports to: Alex Thompson · Director" without
 * a second round-trip. Returns the full employee row plus the four extra fields.
 */
async function getEmployeeWithReportingTo(tenantId: string, id: string) {
    const manager = alias(employees, 'manager') as any
    const [row] = await db
        .select({
            employee: employees,
            reportingToName: sql<string | null>`CASE
                WHEN ${manager.id} IS NULL THEN NULL
                ELSE ${manager.firstName} || ' ' || ${manager.lastName}
            END`,
            reportingToEmployeeNo: manager.employeeNo,
            reportingToDesignation: manager.designation,
            reportingToDepartment: manager.department,
        })
        .from(employees)
        .leftJoin(manager, eq(employees.reportingTo, manager.id))
        .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
        .limit(1)
    if (!row) return null
    return {
        ...row.employee,
        reportingToName: row.reportingToName,
        reportingToEmployeeNo: row.reportingToEmployeeNo,
        reportingToDesignation: row.reportingToDesignation,
        reportingToDepartment: row.reportingToDepartment,
    }
}

export default async function employeesRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/employees/me — current user's own employee record (incl. their manager's name)
    fastify.get('/me', { ...auth }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.code(404).send(e404('No employee record linked to this account'))
        const employee = await getEmployeeWithReportingTo(tenantId, employeeId)
        if (!employee) return reply.code(404).send(e404('Employee not found'))
        return reply.send({ data: employee })
    })

    // PATCH /api/v1/employees/me — update own personal details (restricted field set)
    fastify.patch('/me', { ...auth }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.code(404).send(e404('No employee record linked to this account'))
        const body = validate(updateMyProfileSchema, request.body)
        const patch: Record<string, unknown> = {}
        for (const key of ALLOWED_SELF_UPDATE_FIELDS) {
            if (key in body && (body as any)[key] !== undefined) patch[key] = (body as any)[key]
        }
        if (Object.keys(patch).length === 0) return reply.code(400).send(e400('No allowed fields provided'))
        patch.updatedAt = new Date()

        const [updated] = await db
            .update(employees)
            .set(patch as any)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
            .returning()

        if (!updated) return reply.code(404).send(e404('Employee not found'))

        recordActivity({
            tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: employeeId,
            entityName: `${updated.firstName} ${updated.lastName}`,
            action: 'update',
            metadata: { fields: Object.keys(patch).filter((k) => k !== 'updatedAt') },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        return reply.send({ data: updated })
    })

    // GET /api/v1/employees — manager-scoped list (dept_head sees own subtree; everyone else sees only themselves)
    fastify.get('/', { ...auth }, async (request: any, reply: any) => {
        const query = validate(paginationSchema, request.query ?? {})
        const search = ((request.query as any)?.search as string | undefined)?.trim() || undefined

        const user = request.user
        const allowedIds: string[] =
            isDeptHead(user) && user.employeeId
                ? await getReportingSubtreeIds(user.tenantId, user.employeeId, request)
                : user.employeeId
                  ? [user.employeeId]
                  : []

        if (allowedIds.length === 0) {
            return reply.send({ data: [], total: 0, limit: query.limit, offset: query.offset, hasMore: false })
        }

        const inList = sql`(${sql.join(
            allowedIds.map((id) => sql`${id}`),
            sql`, `,
        )})`

        const whereExpr = and(
            eq(employees.tenantId, user.tenantId),
            sql`${employees.id} IN ${inList}`,
            search
                ? or(
                      ilike(employees.firstName, `%${search}%`),
                      ilike(employees.lastName, `%${search}%`),
                      ilike(employees.employeeNo, `%${search}%`),
                  )
                : undefined,
        )

        // Project only the fields the team/list views actually render — keeps the
        // wire payload small (no salary/passport/bank fields leaking into a list response).
        const rows = await db
            .select({
                id: employees.id,
                employeeNo: employees.employeeNo,
                firstName: employees.firstName,
                lastName: employees.lastName,
                email: employees.email,
                phone: employees.phone,
                mobileNo: employees.mobileNo,
                department: employees.department,
                designation: employees.designation,
                avatarUrl: employees.avatarUrl,
                status: employees.status,
                joinDate: employees.joinDate,
                reportingTo: employees.reportingTo,
                total: sql<number>`COUNT(*) OVER()`,
            })
            .from(employees)
            .where(whereExpr)
            .orderBy(employees.firstName)
            .limit(query.limit)
            .offset(query.offset)

        const total = rows[0]?.total ?? 0
        const data = rows.map(({ total: _t, ...rest }) => rest)
        return reply.send({
            data,
            total: Number(total),
            limit: query.limit,
            offset: query.offset,
            hasMore: query.offset + data.length < Number(total),
        })
    })

    // GET /api/v1/employees/:id — own record or someone in your reporting subtree
    fastify.get('/:id', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return

        const user = request.user
        const employee = await getEmployeeWithReportingTo(user.tenantId, id)
        if (!employee) return reply.code(404).send(e404('Employee not found'))

        if (!(await canAccessEmployee(user, employee.id, request))) {
            return reply.code(403).send(e403('Not authorized to view this employee'))
        }
        return reply.send({ data: employee })
    })
}
