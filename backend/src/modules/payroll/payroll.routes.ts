// @ts-nocheck
import type { FastifyPluginAsync } from 'fastify/types/plugin.js'
import { listPayrollRuns, getPayrollRun, createPayrollRun, updatePayrollRun, getPayslips, calculateGratuity } from './payroll.service.js'

const payrollRoutes: FastifyPluginAsync = async (fastify) => {
    const auth = { preHandler: [fastify.authenticate] }
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    fastify.get('/', { ...auth, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { year, limit = '12', offset = '0' } = request.query as Record<string, string>
        const result = await listPayrollRuns(request.user.tenantId, { year: year ? Number(year) : undefined, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
    })

    fastify.get('/:id', { ...auth, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const run = await getPayrollRun(request.user.tenantId, id)
        if (!run) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Payroll run not found' })
        return reply.send({ data: run })
    })

    fastify.get('/:id/payslips', { ...auth, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const data = await getPayslips(request.user.tenantId, id)
        return reply.send({ data })
    })

    fastify.post('/', {
        ...hrOnly,
        schema: {
            tags: ['Payroll'],
            body: {
                type: 'object',
                required: ['month', 'year'],
                properties: {
                    month: { type: 'integer', minimum: 1, maximum: 12 },
                    year: { type: 'integer', minimum: 2020 },
                },
            },
        },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const run = await createPayrollRun(request.user.tenantId, body as never)
        return reply.code(201).send({ data: run })
    })

    fastify.patch('/:id', { ...hrOnly, schema: { tags: ['Payroll'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await updatePayrollRun(request.user.tenantId, id, request.body as never)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Payroll run not found' })
        return reply.send({ data: updated })
    })

    // GET /api/v1/payroll/gratuity-calc?basicSalary=10000&yearsOfService=3
    fastify.get('/gratuity-calc', {
        ...auth,
        schema: {
            tags: ['Payroll'],
            querystring: {
                type: 'object',
                required: ['basicSalary', 'yearsOfService'],
                properties: {
                    basicSalary: { type: 'number' },
                    yearsOfService: { type: 'number' },
                },
            },
        },
    }, async (request, reply) => {
        const { basicSalary, yearsOfService } = request.query as { basicSalary: number; yearsOfService: number }
        const gratuity = calculateGratuity(Number(basicSalary), Number(yearsOfService))
        return reply.send({ data: { gratuity, basicSalary: Number(basicSalary), yearsOfService: Number(yearsOfService) } })
    })
}

export default payrollRoutes
