import { db } from '../../db/index.js'
import { salaryRevisions, employees, employeeSalaryComponents, salaryComponents, users } from '../../db/schema/index.js'
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'
import { z } from 'zod'

const VALID_REVISION_TYPES = ['increment', 'decrement', 'promotion', 'annual_review', 'probation_completion', 'correction'] as const

const createRevisionSchema = z.object({
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveDate must be YYYY-MM-DD'),
    revisionType: z.enum(VALID_REVISION_TYPES).default('increment'),
    newBasicSalary: z.number().positive(),
    newHousingAllowance: z.number().min(0).optional().nullable(),
    newTransportAllowance: z.number().min(0).optional().nullable(),
    newOtherAllowances: z.number().min(0).optional().nullable(),
    newTotalSalary: z.number().positive().optional().nullable(),
    reason: z.string().max(500).optional().nullable(),
})

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default async function salaryRevisionsRoutes(fastify: any): Promise<void> {
    const hrAdmin = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /employees/:id/salary-history
    // Optional query params: type (revision type), from (YYYY-MM-DD), to (YYYY-MM-DD)
    fastify.get('/:id/salary-history', { ...hrAdmin, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const { type, from, to } = request.query as { type?: string; from?: string; to?: string }

        // Build WHERE conditions — always scope by employee + tenant first
        const conditions = [
            eq(salaryRevisions.employeeId, id),
            eq(salaryRevisions.tenantId, request.user.tenantId),
        ]

        // Optional: filter by revision type (validated against known values)
        if (type && (VALID_REVISION_TYPES as readonly string[]).includes(type)) {
            conditions.push(eq(salaryRevisions.revisionType, type as typeof VALID_REVISION_TYPES[number]))
        }

        // Optional: filter by effective date range (both bounds are inclusive)
        if (from && DATE_RE.test(from)) {
            conditions.push(gte(salaryRevisions.effectiveDate, from))
        }
        if (to && DATE_RE.test(to)) {
            conditions.push(lte(salaryRevisions.effectiveDate, to))
        }

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
                approvedByName: sql<string | null>`${users.name}`.as('approved_by_name'),
                createdAt: salaryRevisions.createdAt,
            })
            .from(salaryRevisions)
            .leftJoin(users, eq(users.id, salaryRevisions.approvedBy))
            .where(and(...conditions))
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

        // Allowances default to 0 when not previously set on the employee — ensures
        // the revision record is always fully populated so the detail view has complete data.
        const prevBasic = emp.basicSalary ?? null
        const prevTotal = emp.totalSalary ?? null
        const prevHousing = String(emp.housingAllowance != null ? emp.housingAllowance : '0')
        const prevTransport = String(emp.transportAllowance != null ? emp.transportAllowance : '0')
        const prevOther = String(emp.otherAllowances != null ? emp.otherAllowances : '0')

        // Effective new values: use explicit input if provided, otherwise carry the previous value forward
        const effHousing = newHousingAllowance ?? (emp.housingAllowance != null ? parseFloat(emp.housingAllowance) : 0)
        const effTransport = newTransportAllowance ?? (emp.transportAllowance != null ? parseFloat(emp.transportAllowance) : 0)
        const effOther = newOtherAllowances ?? (emp.otherAllowances != null ? parseFloat(emp.otherAllowances) : 0)

        // Auto-calculate total if not provided. The 4 legacy fields the
        // revision input accepts (basic/housing/transport/other) only cover
        // the standard UAE WPS allowances. Tenants may also have custom
        // catalog components (e.g. "Communication Allowance") that the
        // employee is paid each month — those have to be included in the
        // total so the new total reflects what's actually owed.
        let extraCatalogTotal = 0
        if (newTotalSalary == null) {
            const extras = await db
                .select({
                    category: salaryComponents.category,
                    calcType: salaryComponents.calculationType,
                    catalogAmount: salaryComponents.amount,
                    assignmentAmount: employeeSalaryComponents.amount,
                })
                .from(employeeSalaryComponents)
                .innerJoin(salaryComponents, eq(salaryComponents.id, employeeSalaryComponents.componentId))
                .where(and(
                    eq(employeeSalaryComponents.tenantId, request.user.tenantId),
                    eq(employeeSalaryComponents.employeeId, id),
                    eq(employeeSalaryComponents.isActive, true),
                    eq(salaryComponents.isActive, true),
                    eq(salaryComponents.kind, 'earning'),
                ))
            for (const r of extras) {
                // Skip categories already represented by the 4 legacy inputs —
                // those are summed explicitly below.
                if (['basic', 'housing', 'transport'].includes(r.category)) continue
                if (['custom_allowance', 'cost_of_living'].includes(r.category)) continue
                const raw = Number(r.assignmentAmount ?? r.catalogAmount ?? 0)
                extraCatalogTotal += r.calcType === 'percentage_of_basic'
                    ? (newBasicSalary * raw) / 100
                    : raw
            }
        }

        const effectiveTotal = newTotalSalary != null
            ? newTotalSalary
            : newBasicSalary + effHousing + effTransport + effOther + extraCatalogTotal

        const [revision] = await db.insert(salaryRevisions).values({
            tenantId: request.user.tenantId,
            employeeId: id,
            effectiveDate,
            revisionType,
            previousBasicSalary: prevBasic,
            newBasicSalary: String(newBasicSalary),
            previousTotalSalary: prevTotal,
            newTotalSalary: String(effectiveTotal),
            previousHousingAllowance: prevHousing,
            newHousingAllowance: String(effHousing),
            previousTransportAllowance: prevTransport,
            newTransportAllowance: String(effTransport),
            previousOtherAllowances: prevOther,
            newOtherAllowances: String(effOther),
            reason: reason ?? null,
            approvedBy: request.user.id,
        }).returning()

        // Apply to employee record if effectiveDate <= today
        const today = new Date().toISOString().split('T')[0]!
        if (effectiveDate <= today) {
            await db.update(employees).set({
                basicSalary: String(newBasicSalary),
                totalSalary: String(effectiveTotal),
                housingAllowance: String(effHousing),
                transportAllowance: String(effTransport),
                otherAllowances: String(effOther),
                updatedAt: new Date(),
            }).where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))

            // Sync the catalog assignments so payroll's resolver sees the new
            // amounts. Maps by category — basic/housing/transport go to their
            // first matching active component; everything legacy-"other"
            // goes to the tenant's custom_allowance component (or
            // cost_of_living as a fallback if HR replaced the seed).
            const components = await db
                .select({ id: salaryComponents.id, category: salaryComponents.category })
                .from(salaryComponents)
                .where(and(
                    eq(salaryComponents.tenantId, request.user.tenantId),
                    eq(salaryComponents.kind, 'earning'),
                    eq(salaryComponents.isActive, true),
                ))
            const firstByCategory = (cat: string) => components.find(c => c.category === cat)
            const targets: { category: string; amount: number }[] = [
                { category: 'basic', amount: newBasicSalary },
                { category: 'housing', amount: effHousing },
                { category: 'transport', amount: effTransport },
            ]
            const otherTarget = firstByCategory('custom_allowance') ?? firstByCategory('cost_of_living')
            const upserts = targets
                .map(t => ({ comp: firstByCategory(t.category), amount: t.amount }))
                .concat(otherTarget ? [{ comp: otherTarget, amount: effOther }] : [])
                .filter(x => !!x.comp)
                .map(x => ({
                    tenantId: request.user.tenantId,
                    employeeId: id,
                    componentId: x.comp!.id,
                    amount: String(x.amount.toFixed(2)),
                    isActive: true,
                    updatedAt: new Date(),
                }))
            if (upserts.length > 0) {
                await db
                    .insert(employeeSalaryComponents)
                    .values(upserts)
                    .onConflictDoUpdate({
                        target: [employeeSalaryComponents.employeeId, employeeSalaryComponents.componentId],
                        set: {
                            amount: sql`excluded.amount`,
                            isActive: sql`excluded.is_active`,
                            updatedAt: sql`excluded.updated_at`,
                        },
                    })
            }
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
