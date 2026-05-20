import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { employees, orgUnits, teamMembers, teams } from '../../db/schema/index.js'
import { e403, e404 } from '../../lib/errors.js'
import { parseUuidParam } from '../../lib/validation.js'
import { canAccessEmployee } from '../../lib/scoping.js'

export default async function teamsRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/teams — list teams for current tenant (filter via optional departmentId query)
    fastify.get('/', { ...auth }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const departmentId = (request.query as any)?.departmentId as string | undefined

        const conditions: any[] = [eq(teams.tenantId, tenantId), eq(teams.isActive, true)]
        if (departmentId) conditions.push(eq(teams.departmentId, departmentId))

        const rows = await db.select().from(teams).where(and(...conditions)).orderBy(teams.name)
        return reply.send({ data: rows })
    })

    // Shared query — used by GET /my and GET /by-employee/:id. Resolves the
    // team's department through the org_units FK (falling back to the legacy
    // text column) so the wire format matches the canonical department naming
    // used everywhere else in the portal.
    async function listTeamsForEmployee(tenantId: string, employeeId: string) {
        return db
            .select({
                id: teams.id,
                name: teams.name,
                description: teams.description,
                departmentId: teams.departmentId,
                department: sql<string | null>`COALESCE(${orgUnits.name}, ${teams.department})`,
                memberRole: teamMembers.role,
                joinedAt: teamMembers.joinedAt,
            })
            .from(teamMembers)
            // Defence in depth: every join filters by tenant too, so a stray
            // cross-tenant FK can't leak a name from another tenant's data.
            // The DB trigger (migration 0039) now blocks new cross-tenant
            // team_members rows, but the team.tenantId / orgUnits.tenantId
            // guards here protect against any historical drift on other FKs.
            .innerJoin(teams, and(
                eq(teamMembers.teamId, teams.id),
                eq(teams.tenantId, tenantId),
            ))
            .leftJoin(orgUnits, and(
                eq(teams.departmentId, orgUnits.id),
                eq(orgUnits.tenantId, tenantId),
            ))
            .where(
                and(
                    eq(teamMembers.tenantId, tenantId),
                    eq(teamMembers.employeeId, employeeId),
                    eq(teams.isActive, true),
                ),
            )
            .orderBy(teams.name)
    }

    // GET /api/v1/teams/my — teams the current user is a member of
    fastify.get('/my', { ...auth }, async (request: any, reply: any) => {
        const { tenantId, employeeId } = request.user
        if (!employeeId) return reply.send({ data: [] })
        const rows = await listTeamsForEmployee(tenantId, employeeId)
        return reply.send({ data: rows })
    })

    // GET /api/v1/teams/by-employee/:employeeId — teams a teammate belongs to
    //
    // Used by the manager member-detail page so a dept_head can see which
    // cross-functional teams someone on their team participates in. Access
    // is gated by `canAccessEmployee` so a regular employee can only ask
    // about themselves and a dept_head can only see their own subtree.
    fastify.get('/by-employee/:employeeId', { ...auth }, async (request: any, reply: any) => {
        const employeeId = parseUuidParam(request.params, 'employeeId', reply)
        if (!employeeId) return
        const user = request.user

        // Verify the employee exists in this tenant before the access check
        // — otherwise canAccessEmployee on a non-existent ID returns false
        // and we'd send a misleading 403 instead of 404.
        const [exists] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, employeeId)))
            .limit(1)
        if (!exists) return reply.code(404).send(e404('Employee not found'))

        if (!(await canAccessEmployee(user, employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to view this employee'))
        }

        const rows = await listTeamsForEmployee(user.tenantId, employeeId)
        return reply.send({ data: rows })
    })

    // GET /api/v1/teams/:id — team details with members
    fastify.get('/:id', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return
        const tenantId = request.user.tenantId

        const [team] = await db
            .select()
            .from(teams)
            .where(and(eq(teams.tenantId, tenantId), eq(teams.id, id)))
            .limit(1)
        if (!team) return reply.code(404).send(e404('Team not found'))

        const members = await db
            .select()
            .from(teamMembers)
            .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.teamId, id)))

        return reply.send({ data: { ...team, members } })
    })
}
