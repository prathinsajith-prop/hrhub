import { z } from 'zod'
import { listTransfers, createTransfer } from './transfers.service.js'
import { recordActivity } from '../audit/audit.service.js'
import { employees, orgUnits } from '../../db/schema/index.js'
import { db } from '../../db/index.js'
import { eq, and, inArray } from 'drizzle-orm'

const transferSchema = z.object({
    transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transferDate must be YYYY-MM-DD'),
    toDesignation: z.string().max(200).optional().nullable(),
    toBranchId: z.string().uuid().optional().nullable(),
    toDivisionId: z.string().uuid().optional().nullable(),
    toDepartmentId: z.string().uuid({ message: 'toDepartmentId must be a valid UUID' }),
    newSalary: z.number().positive().optional().nullable(),
    reason: z.string().max(500).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
})

export default async function transfersRoutes(fastify: any): Promise<void> {
    const hrAdmin = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /employees/:id/transfers
    fastify.get('/:id/transfers', { ...hrAdmin, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const rows = await listTransfers(request.user.tenantId, id)
        return reply.send({ data: rows })
    })

    // POST /employees/:id/transfer
    fastify.post('/:id/transfer', { ...hrAdmin, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const parsed = transferSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Validation Error', message: parsed.error.issues[0]?.message ?? 'Invalid input' })
        }

        const body = parsed.data

        // Load current employee state for snapshot
        const [emp] = await db
            .select({
                designation: employees.designation,
                department: employees.department,
                branchId: employees.branchId,
                divisionId: employees.divisionId,
                departmentId: employees.departmentId,
            })
            .from(employees)
            .where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)

        if (!emp) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        // Resolve org unit names for "to" fields so history is self-contained
        const unitIdsToResolve = [body.toBranchId, body.toDivisionId, body.toDepartmentId].filter(Boolean) as string[]
        const unitNameMap = new Map<string, string>()
        if (unitIdsToResolve.length > 0) {
            const units = await db
                .select({ id: orgUnits.id, name: orgUnits.name })
                .from(orgUnits)
                .where(and(
                    inArray(orgUnits.id, unitIdsToResolve),
                    eq(orgUnits.tenantId, request.user.tenantId),
                ))
            units.forEach(u => unitNameMap.set(u.id, u.name))
        }

        const transfer = await createTransfer(request.user.tenantId, {
            employeeId: id,
            transferDate: body.transferDate,
            fromDesignation: emp.designation ?? null,
            fromDepartment: emp.department ?? null,
            fromBranchId: emp.branchId ?? null,
            fromDivisionId: emp.divisionId ?? null,
            fromDepartmentId: emp.departmentId ?? null,
            toDesignation: body.toDesignation ?? null,
            toDepartment: body.toDepartmentId ? (unitNameMap.get(body.toDepartmentId) ?? null) : null,
            toBranchId: body.toBranchId ?? null,
            toDivisionId: body.toDivisionId ?? null,
            toDepartmentId: body.toDepartmentId ?? null,
            newSalary: body.newSalary != null ? String(body.newSalary) : null,
            reason: body.reason ?? null,
            notes: body.notes ?? null,
            approvedBy: request.user.id,
        })

        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee_transfer',
            entityId: transfer.id,
            entityName: `Transfer for employee ${id}`,
            action: 'create',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.code(201).send({ data: transfer })
    })
}
