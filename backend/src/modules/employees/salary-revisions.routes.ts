import { db } from '../../db/index.js'
import { salaryRevisions, employees, employeeSalaryComponents, salaryComponents, users } from '../../db/schema/index.js'
import { OTHER_EARNING_CATEGORIES } from '../../db/schema/salary_components.js'
import { resolveEmployeeEarnings } from '../payroll/payroll.service.js'
import { eq, and, desc, sql, gte, lte, inArray } from 'drizzle-orm'
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

        // Snapshot the previous values from the resolver (catalog assignments
        // are the source of truth payroll reads), falling back to the legacy
        // columns when the employee has no catalog data. Reading purely from
        // the legacy columns could capture a stale value if HR deactivated a
        // catalog component without touching the employee row.
        const resolvedPrev = (await resolveEmployeeEarnings(request.user.tenantId, [id])).get(id)
        const sumByCategory = (cat: string) => resolvedPrev?.earnings
            .filter(e => e.category === cat)
            .reduce((s, e) => s + e.amount, 0) ?? 0
        const sumOtherCategories = () => resolvedPrev?.earnings
            .filter(e => (OTHER_EARNING_CATEGORIES as readonly string[]).includes(e.category))
            .reduce((s, e) => s + e.amount, 0) ?? 0

        const prevBasic = resolvedPrev?.hasBasic
            ? String(resolvedPrev.basic.toFixed(2))
            : (emp.basicSalary ?? null)
        const prevTotal = emp.totalSalary ?? null
        const resolvedHousing = sumByCategory('housing')
        const resolvedTransport = sumByCategory('transport')
        const resolvedOther = sumOtherCategories()
        const prevHousing = String((resolvedHousing > 0 ? resolvedHousing : Number(emp.housingAllowance ?? 0)).toFixed(2))
        const prevTransport = String((resolvedTransport > 0 ? resolvedTransport : Number(emp.transportAllowance ?? 0)).toFixed(2))
        const prevOther = String((resolvedOther > 0 ? resolvedOther : Number(emp.otherAllowances ?? 0)).toFixed(2))

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
            const LEGACY_4FIELD = new Set<string>([
                'basic', 'housing', 'transport',
                ...OTHER_EARNING_CATEGORIES,
            ])
            for (const r of extras) {
                // Skip categories already represented by the 4 legacy inputs.
                if (LEGACY_4FIELD.has(r.category)) continue
                const raw = Number(r.assignmentAmount ?? r.catalogAmount ?? 0)
                extraCatalogTotal += r.calcType === 'percentage_of_basic'
                    ? (newBasicSalary * raw) / 100
                    : raw
            }
        }

        const effectiveTotal = newTotalSalary != null
            ? newTotalSalary
            : newBasicSalary + effHousing + effTransport + effOther + extraCatalogTotal

        // Apply atomically — the revision record, employee row update, and
        // catalog assignment sync must succeed or fail together, otherwise
        // payroll's resolver could read a state that doesn't match the
        // legacy columns or the revision history.
        const today = new Date().toISOString().split('T')[0]!
        const shouldApplyNow = effectiveDate <= today
        const tenantId = request.user.tenantId
        const revision = await db.transaction(async (tx) => {
            const [rev] = await tx.insert(salaryRevisions).values({
                tenantId,
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

            if (!shouldApplyNow) return rev

            await tx.update(employees).set({
                basicSalary: String(newBasicSalary),
                totalSalary: String(effectiveTotal),
                housingAllowance: String(effHousing),
                transportAllowance: String(effTransport),
                otherAllowances: String(effOther),
                updatedAt: new Date(),
            }).where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))

            // One round-trip pulls catalog rows + flags which ones the
            // employee already has assigned. Saves a second SELECT.
            const components = await tx
                .select({
                    id: salaryComponents.id,
                    category: salaryComponents.category,
                    hasAssignment: sql<boolean>`${employeeSalaryComponents.componentId} IS NOT NULL`,
                })
                .from(salaryComponents)
                .leftJoin(employeeSalaryComponents, and(
                    eq(employeeSalaryComponents.componentId, salaryComponents.id),
                    eq(employeeSalaryComponents.employeeId, id),
                    eq(employeeSalaryComponents.tenantId, tenantId),
                ))
                .where(and(
                    eq(salaryComponents.tenantId, tenantId),
                    eq(salaryComponents.kind, 'earning'),
                    eq(salaryComponents.isActive, true),
                ))
            const firstByCategory = (cat: string) => components.find(c => c.category === cat)
            const otherBucket = components.filter(c => (OTHER_EARNING_CATEGORIES as readonly string[]).includes(c.category))
            // Prefer a bucket the employee already uses so HR doesn't see a
            // different "other" label appear after the revision.
            const otherTargetId = otherBucket.find(c => c.hasAssignment)?.id
                ?? otherBucket[0]?.id

            const targets: { componentId: string | undefined; amount: number }[] = [
                { componentId: firstByCategory('basic')?.id, amount: newBasicSalary },
                { componentId: firstByCategory('housing')?.id, amount: effHousing },
                { componentId: firstByCategory('transport')?.id, amount: effTransport },
                { componentId: otherTargetId, amount: effOther },
            ]
            const upserts = targets
                .filter((t): t is { componentId: string; amount: number } => !!t.componentId)
                .map(t => ({
                    tenantId,
                    employeeId: id,
                    componentId: t.componentId,
                    amount: String(t.amount.toFixed(2)),
                    isActive: true,
                    updatedAt: new Date(),
                }))
            if (upserts.length > 0) {
                await tx
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

            // Zero sibling other-bucket assignments so the resolved gross
            // can't drift above effOther when a tenant has >1 custom row.
            const siblingIds = otherBucket.map(c => c.id).filter(cid => cid !== otherTargetId)
            if (siblingIds.length > 0) {
                await tx
                    .update(employeeSalaryComponents)
                    .set({ amount: '0.00', updatedAt: new Date() })
                    .where(and(
                        eq(employeeSalaryComponents.tenantId, tenantId),
                        eq(employeeSalaryComponents.employeeId, id),
                        inArray(employeeSalaryComponents.componentId, siblingIds),
                    ))
            }
            return rev
        })

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

        // Mirror onto the employee's Updates tab. The ActivityFeed renders
        // entityType:'employee' rows whose metadata.kind is in the handled set
        // — reuse the already-handled 'payroll' kind so the salary change
        // surfaces under the employee without inventing a new kind.
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: id,
            action: 'update',
            metadata: { kind: 'payroll', subKind: 'update' },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.code(201).send({ data: revision })
    })
}
