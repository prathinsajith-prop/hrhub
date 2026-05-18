import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { teamMembers, teams } from '../../db/schema/index.js'
import { e404 } from '../../lib/errors.js'
import { parseUuidParam } from '../../lib/validation.js'

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

    // GET /api/v1/teams/my — teams the current user is a member of
    fastify.get('/my', { ...auth }, async (request: any, reply: any) => {
        const { tenantId, employeeId } = request.user
        if (!employeeId) return reply.send({ data: [] })

        const rows = await db
            .select({
                id: teams.id,
                name: teams.name,
                description: teams.description,
                departmentId: teams.departmentId,
                department: teams.department,
                memberRole: teamMembers.role,
            })
            .from(teamMembers)
            .innerJoin(teams, eq(teamMembers.teamId, teams.id))
            .where(
                and(
                    eq(teamMembers.tenantId, tenantId),
                    eq(teamMembers.employeeId, employeeId),
                    eq(teams.isActive, true),
                ),
            )

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
