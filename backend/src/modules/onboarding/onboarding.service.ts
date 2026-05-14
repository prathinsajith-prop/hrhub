import { eq, and, inArray, isNotNull, or, desc, sql } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { resolveAvatarUrl } from '../../plugins/s3.js'
import { onboardingChecklists, onboardingSteps, employees, onboardingTemplateSteps, onboardingTemplateStepRequiredDocs, onboardingStepRequiredDocs } from '../../db/schema/index.js'
import { DEFAULT_ONBOARDING_TEMPLATE, buildDefaultOnboardingTemplateRows } from './onboarding.defaults.js'

/* ─── Template steps (per-tenant) ─────────────────────────────────────────── */

/**
 * List template steps, each annotated with `requiredDocsCount` so the
 * Onboarding Steps settings tab can render the badge without an extra round
 * trip per row. The count is the number of `onboarding_template_step_required_docs`
 * rows pointing at the step.
 */
export async function listTemplateSteps(tenantId: string) {
    const rows = await db
        .select({
            id: onboardingTemplateSteps.id,
            tenantId: onboardingTemplateSteps.tenantId,
            stepOrder: onboardingTemplateSteps.stepOrder,
            title: onboardingTemplateSteps.title,
            owner: onboardingTemplateSteps.owner,
            slaDays: onboardingTemplateSteps.slaDays,
            createdAt: onboardingTemplateSteps.createdAt,
            updatedAt: onboardingTemplateSteps.updatedAt,
            requiredDocsCount: sql<number>`COALESCE(COUNT(${onboardingTemplateStepRequiredDocs.id}), 0)::int`,
        })
        .from(onboardingTemplateSteps)
        .leftJoin(
            onboardingTemplateStepRequiredDocs,
            eq(onboardingTemplateStepRequiredDocs.templateStepId, onboardingTemplateSteps.id),
        )
        .where(eq(onboardingTemplateSteps.tenantId, tenantId))
        .groupBy(onboardingTemplateSteps.id)
        .orderBy(onboardingTemplateSteps.stepOrder)
    if (rows.length > 0) return rows

    // Legacy tenant with no template rows — seed inside a transaction with a
    // recheck so concurrent first-reads can't duplicate. Newly-seeded rows
    // have no required docs, so requiredDocsCount is 0 for all.
    return db.transaction(async (tx) => {
        const rechecked = await tx.select().from(onboardingTemplateSteps)
            .where(eq(onboardingTemplateSteps.tenantId, tenantId))
            .orderBy(onboardingTemplateSteps.stepOrder)
        if (rechecked.length > 0) return rechecked.map(r => ({ ...r, requiredDocsCount: 0 }))
        await tx.insert(onboardingTemplateSteps).values(buildDefaultOnboardingTemplateRows(tenantId))
        const seeded = await tx.select().from(onboardingTemplateSteps)
            .where(eq(onboardingTemplateSteps.tenantId, tenantId))
            .orderBy(onboardingTemplateSteps.stepOrder)
        return seeded.map(r => ({ ...r, requiredDocsCount: 0 }))
    })
}

export async function createTemplateStep(tenantId: string, data: { title: string; owner?: string; slaDays?: number }) {
    const existing = await db.select({ stepOrder: onboardingTemplateSteps.stepOrder })
        .from(onboardingTemplateSteps)
        .where(eq(onboardingTemplateSteps.tenantId, tenantId))
    const nextOrder = existing.length > 0 ? Math.max(...existing.map(s => s.stepOrder)) + 1 : 1
    const [row] = await db.insert(onboardingTemplateSteps).values({
        tenantId,
        stepOrder: nextOrder,
        title: data.title,
        owner: data.owner,
        slaDays: data.slaDays,
    }).returning()
    return row
}

export async function updateTemplateStep(tenantId: string, stepId: string, data: { title?: string; owner?: string | null; slaDays?: number | null }) {
    const [row] = await db.update(onboardingTemplateSteps)
        .set(withTimestamp(data as Record<string, unknown>))
        .where(and(eq(onboardingTemplateSteps.id, stepId), eq(onboardingTemplateSteps.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function deleteTemplateStep(tenantId: string, stepId: string) {
    const [row] = await db.delete(onboardingTemplateSteps)
        .where(and(eq(onboardingTemplateSteps.id, stepId), eq(onboardingTemplateSteps.tenantId, tenantId)))
        .returning()
    return row ?? null
}

/**
 * Reorder template steps atomically. Accepts an ordered list of step IDs;
 * positions are re-numbered 1..N. Step IDs not belonging to the tenant
 * are silently ignored. Implemented as a single CASE-based UPDATE so the
 * whole renumber is one round-trip regardless of N (was 1 + N updates).
 */
export async function reorderTemplateSteps(tenantId: string, orderedIds: string[]) {
    return db.transaction(async (tx) => {
        const rows = await tx.select({ id: onboardingTemplateSteps.id })
            .from(onboardingTemplateSteps)
            .where(eq(onboardingTemplateSteps.tenantId, tenantId))
        const allowed = new Set(rows.map(r => r.id))
        const valid = orderedIds.filter(id => allowed.has(id))
        if (valid.length === 0) return []

        const caseClauses = valid.map((id, i) => sql`WHEN ${id}::uuid THEN ${i + 1}`)
        await tx.update(onboardingTemplateSteps)
            .set({
                stepOrder: sql`CASE ${onboardingTemplateSteps.id} ${sql.join(caseClauses, sql` `)} END`,
                updatedAt: new Date(),
            })
            .where(and(
                eq(onboardingTemplateSteps.tenantId, tenantId),
                inArray(onboardingTemplateSteps.id, valid),
            ))
        return tx
            .select({
                id: onboardingTemplateSteps.id,
                tenantId: onboardingTemplateSteps.tenantId,
                stepOrder: onboardingTemplateSteps.stepOrder,
                title: onboardingTemplateSteps.title,
                owner: onboardingTemplateSteps.owner,
                slaDays: onboardingTemplateSteps.slaDays,
                createdAt: onboardingTemplateSteps.createdAt,
                updatedAt: onboardingTemplateSteps.updatedAt,
                requiredDocsCount: sql<number>`COALESCE(COUNT(${onboardingTemplateStepRequiredDocs.id}), 0)::int`,
            })
            .from(onboardingTemplateSteps)
            .leftJoin(
                onboardingTemplateStepRequiredDocs,
                eq(onboardingTemplateStepRequiredDocs.templateStepId, onboardingTemplateSteps.id),
            )
            .where(eq(onboardingTemplateSteps.tenantId, tenantId))
            .groupBy(onboardingTemplateSteps.id)
            .orderBy(onboardingTemplateSteps.stepOrder)
    })
}

/**
 * Reset the tenant's onboarding template back to the system defaults.
 * Deletes existing template rows and reinserts the seed list.
 */
export async function resetTemplateSteps(tenantId: string) {
    return db.transaction(async (tx) => {
        await tx.delete(onboardingTemplateSteps)
            .where(eq(onboardingTemplateSteps.tenantId, tenantId))
        await tx.insert(onboardingTemplateSteps).values(buildDefaultOnboardingTemplateRows(tenantId))
        const seeded = await tx.select().from(onboardingTemplateSteps)
            .where(eq(onboardingTemplateSteps.tenantId, tenantId))
            .orderBy(onboardingTemplateSteps.stepOrder)
        // Reset wipes required docs (cascade), so all counts are 0.
        return seeded.map(r => ({ ...r, requiredDocsCount: 0 }))
    })
}

export async function getChecklist(tenantId: string, employeeId: string) {
    const [row] = await db
        .select({
            id: onboardingChecklists.id,
            employeeId: onboardingChecklists.employeeId,
            progress: onboardingChecklists.progress,
            startDate: onboardingChecklists.startDate,
            dueDate: onboardingChecklists.dueDate,
            createdAt: onboardingChecklists.createdAt,
            updatedAt: onboardingChecklists.updatedAt,
            firstName: employees.firstName,
            lastName: employees.lastName,
            designation: employees.designation,
            department: employees.department,
            avatarUrl: employees.avatarUrl,
            employeeNo: employees.employeeNo,
            email: employees.email,
            phone: employees.phone,
            joinDate: employees.joinDate,
            status: employees.status,
        })
        .from(onboardingChecklists)
        .leftJoin(employees, eq(onboardingChecklists.employeeId, employees.id))
        .where(and(eq(onboardingChecklists.tenantId, tenantId), eq(onboardingChecklists.employeeId, employeeId)))
        .limit(1)

    if (!row) return null

    const steps = await db.select().from(onboardingSteps)
        .where(eq(onboardingSteps.checklistId, row.id))
        .orderBy(onboardingSteps.stepOrder)

    const completedCount = steps.filter(s => s.status === 'completed').length

    return {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: [row.firstName, row.lastName].filter(Boolean).join(' ') || 'Unknown employee',
        employeeNo: row.employeeNo,
        designation: row.designation,
        department: row.department,
        avatarUrl: await resolveAvatarUrl(row.avatarUrl),
        email: row.email,
        phone: row.phone,
        joinDate: row.joinDate,
        employeeStatus: row.status,
        progress: row.progress,
        startDate: row.startDate,
        dueDate: row.dueDate,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        completedCount,
        totalCount: steps.length,
        steps,
    }
}

export async function addStep(tenantId: string, checklistId: string, data: { title: string; owner?: string; dueDate?: string; slaDays?: number }) {
    const [checklist] = await db.select().from(onboardingChecklists)
        .where(and(eq(onboardingChecklists.id, checklistId), eq(onboardingChecklists.tenantId, tenantId)))
        .limit(1)
    if (!checklist) return null

    const existing = await db.select().from(onboardingSteps).where(eq(onboardingSteps.checklistId, checklistId))
    const nextOrder = existing.length > 0 ? Math.max(...existing.map(s => s.stepOrder)) + 1 : 1

    const [step] = await db.insert(onboardingSteps).values({
        checklistId,
        stepOrder: nextOrder,
        title: data.title,
        owner: data.owner,
        slaDays: data.slaDays,
        dueDate: data.dueDate,
        status: 'pending',
    }).returning()

    // Recalculate progress (denominator changed)
    const allSteps = [...existing, step]
    const completedCount = allSteps.filter(s => s.status === 'completed').length
    const progress = Math.round((completedCount / allSteps.length) * 100)
    await db.update(onboardingChecklists)
        .set(withTimestamp({ progress }))
        .where(and(eq(onboardingChecklists.id, checklistId), eq(onboardingChecklists.tenantId, tenantId)))

    return step
}

export async function deleteStep(tenantId: string, checklistId: string, stepId: string) {
    const [checklist] = await db.select().from(onboardingChecklists)
        .where(and(eq(onboardingChecklists.id, checklistId), eq(onboardingChecklists.tenantId, tenantId)))
        .limit(1)
    if (!checklist) return null

    const [deleted] = await db.delete(onboardingSteps)
        .where(and(eq(onboardingSteps.id, stepId), eq(onboardingSteps.checklistId, checklistId)))
        .returning()
    if (!deleted) return null

    const allSteps = await db.select().from(onboardingSteps).where(eq(onboardingSteps.checklistId, checklistId))
    const completedCount = allSteps.filter(s => s.status === 'completed').length
    const progress = allSteps.length === 0 ? 0 : Math.round((completedCount / allSteps.length) * 100)
    await db.update(onboardingChecklists)
        .set(withTimestamp({ progress }))
        .where(eq(onboardingChecklists.id, checklistId))

    return deleted
}

export async function updateStep(tenantId: string, checklistId: string, stepId: string, data: { status?: string; notes?: string; completedDate?: string }) {
    const [checklist] = await db.select().from(onboardingChecklists)
        .where(and(eq(onboardingChecklists.id, checklistId), eq(onboardingChecklists.tenantId, tenantId)))
        .limit(1)

    if (!checklist) return null

    const [step] = await db.update(onboardingSteps)
        .set(data as Record<string, unknown>)
        .where(and(eq(onboardingSteps.id, stepId), eq(onboardingSteps.checklistId, checklistId)))
        .returning()

    if (!step) return null

    // Recalculate progress
    const allSteps = await db.select().from(onboardingSteps)
        .where(eq(onboardingSteps.checklistId, checklistId))

    const completedCount = allSteps.filter(s => s.status === 'completed').length
    const progress = Math.round((completedCount / allSteps.length) * 100)

    await db.update(onboardingChecklists)
        .set(withTimestamp({ progress }))
        .where(eq(onboardingChecklists.id, checklistId))

    // When all steps complete, graduate employee from probation → active
    if (progress === 100 && checklist.employeeId) {
        await db.update(employees)
            .set({ status: 'active', updatedAt: new Date() })
            .where(and(
                eq(employees.id, checklist.employeeId),
                eq(employees.tenantId, tenantId),
                eq(employees.status, 'probation'),
            ))
    }

    return { step, progress }
}

export async function listChecklists(tenantId: string, params: { limit: number; offset: number }) {
    // Drive the query from employees so that onboarding-status employees without a
    // checklist are still included as stub rows (checklist fields will be null).
    const rows = await db
        .select({
            // employee identity (always present)
            employeeId: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            designation: employees.designation,
            department: employees.department,
            avatarUrl: employees.avatarUrl,
            employeeNo: employees.employeeNo,
            email: employees.email,
            phone: employees.phone,
            joinDate: employees.joinDate,
            employeeStatus: employees.status,
            // checklist fields (null when no checklist exists yet)
            checklistId: onboardingChecklists.id,
            progress: onboardingChecklists.progress,
            startDate: onboardingChecklists.startDate,
            dueDate: onboardingChecklists.dueDate,
            checklistCreatedAt: onboardingChecklists.createdAt,
            checklistUpdatedAt: onboardingChecklists.updatedAt,
        })
        .from(employees)
        .leftJoin(
            onboardingChecklists,
            and(
                eq(onboardingChecklists.employeeId, employees.id),
                eq(onboardingChecklists.tenantId, tenantId),
            ),
        )
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            // Include: employees in onboarding status OR employees who have a checklist
            or(eq(employees.status, 'onboarding'), isNotNull(onboardingChecklists.id)),
        ))
        .orderBy(desc(onboardingChecklists.createdAt))
        .limit(params.limit)
        .offset(params.offset)

    if (rows.length === 0) return []

    // Fetch steps only for rows that have a checklist
    const checklistIds = rows.map(r => r.checklistId).filter(Boolean) as string[]
    const allSteps = checklistIds.length > 0
        ? await db.select().from(onboardingSteps)
            .where(inArray(onboardingSteps.checklistId, checklistIds))
            .orderBy(onboardingSteps.stepOrder)
        : []

    const stepsByChecklist = new Map<string, typeof allSteps>()
    for (const s of allSteps) {
        const arr = stepsByChecklist.get(s.checklistId) ?? []
        arr.push(s)
        stepsByChecklist.set(s.checklistId, arr)
    }

    return Promise.all(rows.map(async r => {
        const steps = r.checklistId ? (stepsByChecklist.get(r.checklistId) ?? []) : []
        const completedCount = steps.filter(s => s.status === 'completed').length
        const totalCount = steps.length
        return {
            id: r.checklistId ?? null,           // null = no checklist yet
            employeeId: r.employeeId,
            employeeName: [r.firstName, r.lastName].filter(Boolean).join(' ') || 'Unknown employee',
            employeeNo: r.employeeNo,
            designation: r.designation,
            department: r.department,
            avatarUrl: await resolveAvatarUrl(r.avatarUrl),
            email: r.email,
            phone: r.phone,
            joinDate: r.joinDate,
            employeeStatus: r.employeeStatus,
            progress: r.progress ?? 0,
            startDate: r.startDate ?? null,
            dueDate: r.dueDate ?? null,
            createdAt: r.checklistCreatedAt ?? null,
            updatedAt: r.checklistUpdatedAt ?? null,
            completedCount,
            totalCount,
            steps,
        }
    }))
}

export async function createChecklist(tenantId: string, data: {
    employeeId: string
    startDate?: string
    dueDate?: string
    useTemplate?: boolean
}): Promise<{ error: 'employee_not_found' | 'already_exists' } | { checklist: typeof onboardingChecklists.$inferSelect }> {
    const [employee] = await db.select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, data.employeeId), eq(employees.tenantId, tenantId)))
        .limit(1)
    if (!employee) return { error: 'employee_not_found' }

    const [existing] = await db.select({ id: onboardingChecklists.id })
        .from(onboardingChecklists)
        .where(and(eq(onboardingChecklists.employeeId, data.employeeId), eq(onboardingChecklists.tenantId, tenantId)))
        .limit(1)
    if (existing) return { error: 'already_exists' }

    const [checklist] = await db.insert(onboardingChecklists).values({
        tenantId,
        employeeId: data.employeeId,
        startDate: data.startDate,
        dueDate: data.dueDate,
        progress: 0,
    }).returning()

    if (data.useTemplate) {
        // Pull from this tenant's editable template; fall back to the system
        // defaults only if the tenant has no template rows (legacy tenants).
        const tenantTemplate = await db.select().from(onboardingTemplateSteps)
            .where(eq(onboardingTemplateSteps.tenantId, tenantId))
            .orderBy(onboardingTemplateSteps.stepOrder)
        const usingTenantTemplate = tenantTemplate.length > 0
        const source = usingTenantTemplate
            ? tenantTemplate.map(s => ({ id: s.id, stepOrder: s.stepOrder, title: s.title, owner: s.owner ?? undefined, slaDays: s.slaDays ?? 0 }))
            : DEFAULT_ONBOARDING_TEMPLATE.map(s => ({ id: null as string | null, stepOrder: s.stepOrder, title: s.title, owner: s.owner as string | undefined, slaDays: s.slaDays }))

        const startMs = data.startDate ? new Date(data.startDate).getTime() : Date.now()
        const templateSteps = source.map(s => ({
            checklistId: checklist.id,
            stepOrder: s.stepOrder,
            title: s.title,
            owner: s.owner,
            slaDays: s.slaDays,
            status: 'pending' as const,
            dueDate: new Date(startMs + (s.slaDays ?? 0) * 24 * 3600 * 1000).toISOString().split('T')[0],
        }))
        if (templateSteps.length > 0) {
            const insertedSteps = await db.insert(onboardingSteps).values(templateSteps).returning({
                id: onboardingSteps.id,
                stepOrder: onboardingSteps.stepOrder,
            })

            // Copy template required-docs into the new instance steps. Only
            // applies when we used the tenant's editable template (not the
            // hard-coded fallback for legacy tenants, since those rows have no
            // template-step id to look up against).
            if (usingTenantTemplate) {
                const templateStepIds = source
                    .map(s => s.id)
                    .filter((id): id is string => typeof id === 'string')
                if (templateStepIds.length > 0) {
                    const templateDocs = await db.select().from(onboardingTemplateStepRequiredDocs)
                        .where(and(
                            eq(onboardingTemplateStepRequiredDocs.tenantId, tenantId),
                            inArray(onboardingTemplateStepRequiredDocs.templateStepId, templateStepIds),
                        ))
                    if (templateDocs.length > 0) {
                        // Map: template_step_id → new instance step id (paired by stepOrder).
                        const instanceByOrder = new Map(insertedSteps.map(s => [s.stepOrder, s.id]))
                        const templateOrderById = new Map(source.filter(s => s.id).map(s => [s.id as string, s.stepOrder]))
                        const docRows = templateDocs
                            .map(d => {
                                const order = templateOrderById.get(d.templateStepId)
                                const instanceStepId = order != null ? instanceByOrder.get(order) : undefined
                                if (!instanceStepId) return null
                                return {
                                    tenantId,
                                    stepId: instanceStepId,
                                    category: d.category,
                                    docType: d.docType,
                                    expiryRequired: d.expiryRequired,
                                    isMandatory: d.isMandatory,
                                    hint: d.hint,
                                    sortOrder: d.sortOrder,
                                }
                            })
                            .filter((r): r is NonNullable<typeof r> => r != null)
                        if (docRows.length > 0) {
                            await db.insert(onboardingStepRequiredDocs).values(docRows)
                        }
                    }
                }
            }
        }
    }

    return { checklist }
}

export async function getAnalytics(tenantId: string) {
    const checklists = await db.select({ id: onboardingChecklists.id, progress: onboardingChecklists.progress })
        .from(onboardingChecklists)
        .where(eq(onboardingChecklists.tenantId, tenantId))

    const total = checklists.length
    const completed = checklists.filter(c => c.progress >= 100).length
    const inProgress = checklists.filter(c => c.progress > 0 && c.progress < 100).length
    const notStarted = checklists.filter(c => c.progress === 0).length
    const avgProgress = total === 0 ? 0 : Math.round(checklists.reduce((s, c) => s + c.progress, 0) / total)
    const completionRate = total === 0 ? 0 : Math.round((completed / total) * 100)

    let overdueSteps = 0
    if (total > 0) {
        const today = new Date().toISOString().split('T')[0]
        const steps = await db.select({ status: onboardingSteps.status, dueDate: onboardingSteps.dueDate })
            .from(onboardingSteps)
            .where(inArray(onboardingSteps.checklistId, checklists.map(c => c.id)))
        overdueSteps = steps.filter(s => s.status !== 'completed' && s.dueDate && s.dueDate < today).length
    }

    return { total, completed, inProgress, notStarted, avgProgress, completionRate, overdueSteps }
}
