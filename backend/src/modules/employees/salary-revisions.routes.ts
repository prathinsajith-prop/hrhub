import { db } from '../../db/index.js'
import { salaryRevisions, employees } from '../../db/schema/index.js'
import { eq, and, desc } from 'drizzle-orm'

export default async function salaryRevisionsRoutes(fastify: any): Promise<void> {
    const hrAdmin = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /employees/:id/salary-history
    fastify.get('/:id/salary-history', { ...hrAdmin, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const rows = await db
            .select()
            .from(salaryRevisions)
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
        const {
            effectiveDate,
            revisionType,
            newBasicSalary,
            newTotalSalary,
            reason,
        } = request.body as {
            effectiveDate: string
            revisionType: string
            newBasicSalary: string | number
            newTotalSalary?: string | number
            reason?: string
        }

        if (!effectiveDate || !newBasicSalary) {
            return reply.code(400).send({ message: 'effectiveDate and newBasicSalary are required' })
        }

        // Load current salary for diff
        const [emp] = await db.select({
            basicSalary: employees.basicSalary,
            totalSalary: employees.totalSalary,
        }).from(employees)
            .where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)

        if (!emp) return reply.code(404).send({ message: 'Employee not found' })

        // Write revision record
        const [revision] = await db.insert(salaryRevisions).values({
            tenantId: request.user.tenantId,
            employeeId: id,
            effectiveDate,
            revisionType: (revisionType ?? 'increment') as 'increment' | 'decrement' | 'promotion' | 'annual_review' | 'probation_completion' | 'correction',
            previousBasicSalary: emp.basicSalary ?? null,
            newBasicSalary: String(newBasicSalary),
            previousTotalSalary: emp.totalSalary ?? null,
            newTotalSalary: newTotalSalary ? String(newTotalSalary) : null,
            reason: reason ?? null,
            approvedBy: request.user.id,
        }).returning()

        // Update employee record (only if effectiveDate <= today)
        if (effectiveDate <= new Date().toISOString().split('T')[0]) {
            await db.update(employees).set({
                basicSalary: String(newBasicSalary),
                ...(newTotalSalary ? { totalSalary: String(newTotalSalary) } : {}),
                updatedAt: new Date(),
            }).where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
        }

        return reply.code(201).send({ data: revision })
    })
}
