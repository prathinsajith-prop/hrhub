import {
    listTeams, getTeam, createTeam, updateTeam, deleteTeam,
    getTeamMembers, addTeamMembers, removeTeamMember, getMyTeams,
    getEligibleEmployees,
} from './teams.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function teamsRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const canManage = {
        preHandler: [fastify.authenticate, fastify.requireRole('super_admin', 'hr_manager', 'dept_head')],
    }

    // List all teams (dept_head sees only their department's teams via filter param from frontend)
    fastify.get('/teams', { ...auth, schema: { tags: ['Teams'] } }, async (request: any) => {
        const { departmentId } = request.query as { departmentId?: string }
        // dept_head: enforce filtering to their own department on the client;
        // server doesn't auto-scope here since we need to support "my teams" cross-dept.
        const rows = await listTeams(request.user.tenantId, departmentId)
        return { data: rows }
    })

    // My teams — employee's memberships
    fastify.get('/teams/my', { ...auth, schema: { tags: ['Teams'] } }, async (request: any) => {
        const rows = await getMyTeams(request.user.tenantId, request.user.employeeId)
        return { data: rows }
    })

    // Get single team
    fastify.get('/teams/:id', { ...auth, schema: { tags: ['Teams'] } }, async (request: any, reply: any) => {
        const team = await getTeam(request.user.tenantId, request.params.id)
        if (!team) return reply.code(404).send({ message: 'Team not found' })
        return { data: team }
    })

    // Create team
    fastify.post('/teams', { ...canManage, schema: { tags: ['Teams'] } }, async (request: any, reply: any) => {
        const { name, description, departmentId } = request.body as {
            name: string; description?: string; departmentId?: string
        }
        if (!name?.trim()) return reply.code(400).send({ message: 'name is required' })

        const team = await createTeam(request.user.tenantId, {
            name, description, departmentId,
            createdById: request.user.id,
        })
        return reply.code(201).send({ data: team })
    })

    // Update team
    fastify.patch('/teams/:id', { ...canManage, schema: { tags: ['Teams'] } }, async (request: any, reply: any) => {
        const team = await getTeam(request.user.tenantId, request.params.id)
        if (!team) return reply.code(404).send({ message: 'Team not found' })

        const { name, description } = request.body as { name?: string; description?: string }
        const updated = await updateTeam(request.user.tenantId, request.params.id, { name, description })
        return { data: updated }
    })

    // Soft-delete team
    fastify.delete('/teams/:id', { ...canManage, schema: { tags: ['Teams'] } }, async (request: any, reply: any) => {
        const team = await getTeam(request.user.tenantId, request.params.id)
        if (!team) return reply.code(404).send({ message: 'Team not found' })
        await deleteTeam(request.user.tenantId, request.params.id)
        return reply.code(204).send()
    })

    // List team members
    fastify.get('/teams/:id/members', { ...auth, schema: { tags: ['Teams'] } }, async (request: any, reply: any) => {
        const team = await getTeam(request.user.tenantId, request.params.id)
        if (!team) return reply.code(404).send({ message: 'Team not found' })
        const members = await getTeamMembers(request.user.tenantId, request.params.id)
        return { data: members }
    })

    // Eligible employees to add to a team
    fastify.get('/teams/:id/eligible', { ...canManage, schema: { tags: ['Teams'] } }, async (request: any, reply: any) => {
        const team = await getTeam(request.user.tenantId, request.params.id)
        if (!team) return reply.code(404).send({ message: 'Team not found' })
        const rows = await getEligibleEmployees(request.user.tenantId, request.params.id)
        return { data: rows }
    })

    // Add members
    fastify.post('/teams/:id/members', { ...canManage, schema: { tags: ['Teams'] } }, async (request: any, reply: any) => {
        const { employeeIds } = request.body as { employeeIds: string[] }
        if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
            return reply.code(400).send({ message: 'employeeIds array is required' })
        }
        const added = await addTeamMembers(request.user.tenantId, request.params.id, employeeIds)
        return reply.code(201).send({ data: added })
    })

    // Remove a member
    fastify.delete('/teams/:id/members/:employeeId', { ...canManage, schema: { tags: ['Teams'] } }, async (request: any, reply: any) => {
        await removeTeamMember(request.user.tenantId, request.params.id, request.params.employeeId)
        return reply.code(204).send()
    })
}
