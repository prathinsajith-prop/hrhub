import {
    listEmployees, getEmployee, createEmployee,
    updateEmployee, archiveEmployee, getExpiringVisas, getOrgChart,
} from './employees.service.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // GET /api/v1/employees
    fastify.get('/', { ...auth, schema: { tags: ['Employees'] } }, async (request, reply) => {
        const { search, status, department, limit = '20', offset = '0' } = request.query as Record<string, string>

        const result = await listEmployees({
            tenantId: request.user.tenantId,
            search,
            status: status as never,
            department,
            limit: Math.min(Number(limit), 100),
            offset: Number(offset),
        })

        return reply.send(result)
    })

    // GET /api/v1/employees/org-chart
    fastify.get('/org-chart', { ...auth, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        return reply.send(await getOrgChart(request.user.tenantId))
    })

    // GET /api/v1/employees/expiring-visas
    fastify.get('/expiring-visas', { ...auth, schema: { tags: ['Employees'] } }, async (request, reply) => {
        const { days = '90' } = request.query as { days?: string }
        const data = await getExpiringVisas(request.user.tenantId, Number(days))
        return reply.send({ data })
    })

    // GET /api/v1/employees/:id
    fastify.get('/:id', { ...auth, schema: { tags: ['Employees'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const employee = await getEmployee(request.user.tenantId, id)
        if (!employee) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
        return reply.send({ data: employee })
    })

    // POST /api/v1/employees
    fastify.post('/', {
        ...auth,
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: {
            tags: ['Employees'],
            body: {
                type: 'object',
                required: ['entityId', 'employeeNo', 'firstName', 'lastName', 'joinDate'],
                properties: {
                    entityId: { type: 'string', format: 'uuid' },
                    employeeNo: { type: 'string' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    nationality: { type: 'string' },
                    passportNo: { type: 'string' },
                    emiratesId: { type: 'string' },
                    dateOfBirth: { type: 'string' },
                    gender: { type: 'string', enum: ['male', 'female'] },
                    department: { type: 'string' },
                    designation: { type: 'string' },
                    joinDate: { type: 'string' },
                    basicSalary: { type: 'number' },
                    totalSalary: { type: 'number' },
                    passportExpiry: { type: 'string' },
                    emiratisationCategory: { type: 'string', enum: ['emirati', 'expat'] },
                },
            },
        },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const employee = await createEmployee(request.user.tenantId, body as never)
        return reply.code(201).send({ data: employee })
    })

    // PATCH /api/v1/employees/:id
    fastify.patch('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const body = request.body as Record<string, unknown>
        const updated = await updateEmployee(request.user.tenantId, id, body as never)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
        return reply.send({ data: updated })
    })

    // DELETE /api/v1/employees/:id
    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const archived = await archiveEmployee(request.user.tenantId, id)
        if (!archived) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
        return reply.code(204).send()
    })

    // POST /api/v1/employees/bulk-import
    // Body: { employees: Array<{firstName, lastName, email, employeeNo, joinDate, entityId, department?, designation?, basicSalary?}> }
    fastify.post('/bulk-import', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Employees'] },
    }, async (request: any, reply: any) => {
        const { employees: rows } = request.body as { employees: Record<string, string>[] }
        if (!Array.isArray(rows) || rows.length === 0) {
            return reply.code(400).send({ error: 'employees array is required' })
        }
        if (rows.length > 500) {
            return reply.code(400).send({ error: 'Max 500 employees per import' })
        }
        const results = await Promise.allSettled(
            rows.map((row) => createEmployee(request.user.tenantId, row as never))
        )
        const created = results.filter(r => r.status === 'fulfilled').length
        const failed = results.filter(r => r.status === 'rejected').length
        const errors = results
            .map((r, i) => r.status === 'rejected' ? { row: i + 1, error: (r as PromiseRejectedResult).reason?.message } : null)
            .filter(Boolean)
        return reply.code(201).send({ created, failed, errors })
    })
}

