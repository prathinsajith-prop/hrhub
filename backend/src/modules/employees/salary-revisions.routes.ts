import { db } from '../../db/index.js'
import { salaryRevisions, employees, users } from '../../db/schema/index.js'
import { eq, and, desc, sql } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'
import { z } from 'zod'

const createRevisionSchema = z.object({
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveDate must be YYYY-MM-DD'),
    revisionType: z.enum(['increment', 'decrement', 'promotion', 'annual_review', 'probation_completion', 'correction']).default('increment'),
    newBasicSalary: z.number().positive(),
    newHousingAllowance: z.number().min(0).optional().nullable(),
    newTransportAllowance: z.number().min(0).optional().nullable(),
    newOtherAllowances: z.number().min(0).optional().nullable(),
    newTotalSalary: z.number().positive().optional().nullable(),
    reason: z.string().max(500).optional().nullable(),
})

export default async function salaryRevisionsRoutes(fastify: any): Promise<void> {
    const hrAdmin = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /employees/:id/salary-history
    fastify.get('/:id/salary-history', { ...hrAdmin, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const rows = await db
            .select({
                id: salaryRevisions.id,
                employeeId: salaryRevisions.employeeId,
                effectiveDate: salaryRevisions.effectiveDate,
                revisionType: salaryRevisions.revisionType,
                previousBasicSalary: salaryRevisions.previousBasicSalary,
                newBasicSalary: salaryRevisions.newBasicSalary,
                previousTotalSalary: salaryRevisions.previousTotalSalary,
                newTotalSalary: salaryRevisions.newTotalSalary,
                previousHousingAllowance: salaryRevisions.previousHousingAllowance,
                newHousingAllowance: salaryRevisions.newHousingAllowance,
                previousTransportAllowance: salaryRevisions.previousTransportAllowance,
                newTransportAllowance: salaryRevisions.newTransportAllowance,
                previousOtherAllowances: salaryRevisions.previousOtherAllowances,
                newOtherAllowances: salaryRevisions.newOtherAllowances,
                reason: salaryRevisions.reason,
                approvedBy: salaryRevisions.approvedBy,
                approvedByName: sql<string | null>`${users.name}`,
                createdAt: salaryRevisions.createdAt,
            })
            .from(salaryRevisions)
            .leftJoin(users, eq(users.id, salaryRevisions.approvedBy))
            .where(and(
                eq(salaryRevisions.employeeId, id),
                eq(salaryRevisions.tenantId, request.user.tenantId),
            ))
            .orderBy(desc(salaryRevisions.effectiveDate))
        return reply.send({ data: rows })
    })

    // POST /employees/:id/salary-revision — record a salary change
    fastify.post('/:id/salary-revision', { ...hrAdmin, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }

        const parsed = createRevisionSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Invalid input' })
        }
        const { effectiveDate, revisionType, newBasicSalary, newHousingAllowance, newTransportAllowance, newOtherAllowances, newTotalSalary, reason } = parsed.data

        // Load current salary for snapshot
        const [emp] = await db
            .select({
                basicSalary: employees.basicSalary,
                totalSalary: employees.totalSalary,
                housingAllowance: employees.housingAllowance,
                transportAllowance: employees.transportAllowance,
                otherAllowances: employees.otherAllowances,
            })
            .from(employees)
            .where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)

        if (!emp) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        // Auto-calculate total if not provided: basic + housing + transport + other
        const effectiveTotal = newTotalSalary != null
            ? newTotalSalary
            : newBasicSalary + (newHousingAllowance ?? 0) + (newTransportAllowance ?? 0) + (newOtherAllowances ?? 0)

        const [revision] = await db.insert(salaryRevisions).values({
            tenantId: request.user.tenantId,
            employeeId: id,
            effectiveDate,
            revisionType,
            previousBasicSalary: emp.basicSalary ?? null,
            newBasicSalary: String(newBasicSalary),
            previousTotalSalary: emp.totalSalary ?? null,
            newTotalSalary: String(effectiveTotal),
            previousHousingAllowance: emp.housingAllowance ?? null,
            newHousingAllowance: newHousingAllowance != null ? String(newHousingAllowance) : null,
            previousTransportAllowance: emp.transportAllowance ?? null,
            newTransportAllowance: newTransportAllowance != null ? String(newTransportAllowance) : null,
            previousOtherAllowances: emp.otherAllowances ?? null,
            newOtherAllowances: newOtherAllowances != null ? String(newOtherAllowances) : null,
            reason: reason ?? null,
            approvedBy: request.user.id,
        }).returning()

        // Apply to employee record if effectiveDate <= today
        const today = new Date().toISOString().split('T')[0]!
        if (effectiveDate <= today) {
            await db.update(employees).set({
                basicSalary: String(newBasicSalary),
                totalSalary: String(effectiveTotal),
                ...(newHousingAllowance != null ? { housingAllowance: String(newHousingAllowance) } : {}),
                ...(newTransportAllowance != null ? { transportAllowance: String(newTransportAllowance) } : {}),
                ...(newOtherAllowances != null ? { otherAllowances: String(newOtherAllowances) } : {}),
                updatedAt: new Date(),
            }).where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
        }

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: id,
            action: 'update',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.code(201).send({ data: revision })
    })
}
