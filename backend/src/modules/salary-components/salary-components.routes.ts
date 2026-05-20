import { z } from 'zod'
import {
    createSalaryComponent,
    deleteSalaryComponent,
    getSalaryComponent,
    listSalaryComponents,
    updateSalaryComponent,
} from './salary-components.service.js'
import {
    BENEFIT_CATEGORIES,
    CORRECTION_CATEGORIES,
    DEDUCTION_CATEGORIES,
    EARNING_CATEGORIES,
    SALARY_COMPONENT_KINDS,
    SOCIAL_SECURITY_SCHEMES,
    type SalaryComponentKind,
} from '../../db/schema/salary_components.js'
import { recordActivity } from '../audit/audit.service.js'

// All possible categories pooled — the service enforces the per-kind match;
// zod here just gates obvious garbage strings.
const ALL_CATEGORIES = [
    ...EARNING_CATEGORIES, ...DEDUCTION_CATEGORIES, ...BENEFIT_CATEGORIES, ...CORRECTION_CATEGORIES,
] as const

const createSchema = z.object({
    kind: z.enum(SALARY_COMPONENT_KINDS as unknown as [string, ...string[]]),
    category: z.enum(ALL_CATEGORIES as unknown as [string, ...string[]]),
    name: z.string().min(1).max(120),
    nameInPayslip: z.string().min(1).max(120),
    nameInPayslipAr: z.string().max(120).nullable().optional(),
    payType: z.enum(['fixed', 'variable']).nullable().optional(),
    calculationType: z.enum(['flat', 'percentage_of_basic']).nullable().optional(),
    amount: z.union([z.number(), z.string()]).nullable().optional(),
    proRata: z.boolean().optional(),
    applicableSocialSecurity: z.array(z.enum(SOCIAL_SECURITY_SCHEMES as unknown as [string, ...string[]])).optional(),
    frequency: z.enum(['one_time', 'recurring']).nullable().optional(),
    isActive: z.boolean().optional(),
})

const updateSchema = createSchema.partial().omit({ kind: true })

export async function salaryComponentsRoutes(fastify: any) {
    const adminAuth = {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }

    // GET /api/v1/salary-components?kind=earning
    fastify.get('/salary-components', { ...adminAuth, schema: { tags: ['SalaryComponents'] } }, async (req: any, reply: any) => {
        const kind = (req.query as any)?.kind as SalaryComponentKind | undefined
        if (kind && !SALARY_COMPONENT_KINDS.includes(kind)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `Unknown kind: ${kind}` })
        }
        const data = await listSalaryComponents(req.user.tenantId, kind)
        return reply.send({ data })
    })

    // POST /api/v1/salary-components
    fastify.post('/salary-components', { ...adminAuth, schema: { tags: ['SalaryComponents'] } }, async (req: any, reply: any) => {
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        try {
            const data = await createSalaryComponent(req.user.tenantId, parsed.data as any, req.user.id)
            recordActivity({
                tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role,
                entityType: 'salary_component', entityId: data.id, entityName: data.name, action: 'create',
                metadata: { kind: data.kind, category: data.category },
                ipAddress: req.ip, userAgent: req.headers['user-agent'],
            }).catch(() => { })
            return reply.code(201).send({ data })
        } catch (err: any) {
            const status = err?.statusCode ?? 500
            return reply.code(status).send({ statusCode: status, error: status === 409 ? 'Conflict' : 'Bad Request', message: err.message ?? 'Could not create component' })
        }
    })

    // GET /api/v1/salary-components/:id
    fastify.get('/salary-components/:id', { ...adminAuth, schema: { tags: ['SalaryComponents'] } }, async (req: any, reply: any) => {
        const data = await getSalaryComponent(req.user.tenantId, req.params.id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Component not found' })
        return reply.send({ data })
    })

    // PATCH /api/v1/salary-components/:id
    fastify.patch('/salary-components/:id', { ...adminAuth, schema: { tags: ['SalaryComponents'] } }, async (req: any, reply: any) => {
        const parsed = updateSchema.safeParse(req.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        try {
            const data = await updateSalaryComponent(req.user.tenantId, req.params.id, parsed.data as any)
            if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Component not found' })
            recordActivity({
                tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role,
                entityType: 'salary_component', entityId: data.id, entityName: data.name, action: 'update',
                metadata: { fields: Object.keys(parsed.data) },
                ipAddress: req.ip, userAgent: req.headers['user-agent'],
            }).catch(() => { })
            return reply.send({ data })
        } catch (err: any) {
            const status = err?.statusCode ?? 500
            return reply.code(status).send({ statusCode: status, error: status === 409 ? 'Conflict' : 'Bad Request', message: err.message ?? 'Could not update component' })
        }
    })

    // DELETE /api/v1/salary-components/:id
    fastify.delete('/salary-components/:id', { ...adminAuth, schema: { tags: ['SalaryComponents'] } }, async (req: any, reply: any) => {
        const data = await deleteSalaryComponent(req.user.tenantId, req.params.id)
        if (!data) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Component not found or is a system component (protected)' })
        }
        recordActivity({
            tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role,
            entityType: 'salary_component', entityId: data.id, entityName: data.name, action: 'delete',
            ipAddress: req.ip, userAgent: req.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })
}
