import { eq, and, inArray, desc } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { onboardingChecklists, onboardingSteps, employees } from '../../db/schema/index.js'

const DEFAULT_TEMPLATE_STEPS = [
    { stepOrder: 1, title: 'HR documentation & contracts', owner: 'HR', slaDays: 1 },
    { stepOrder: 2, title: 'IT equipment setup & laptop handover', owner: 'IT', slaDays: 1 },
    { stepOrder: 3, title: 'System access & account creation', owner: 'IT', slaDays: 2 },
    { stepOrder: 4, title: 'Access card & office orientation', owner: 'Admin', slaDays: 2 },
    { stepOrder: 5, title: 'Introduction to team & manager', owner: 'Manager', slaDays: 3 },
    { stepOrder: 6, title: 'Employee handbook & policy review', owner: 'HR', slaDays: 5 },
    { stepOrder: 7, title: 'Benefits enrollment & payroll setup', owner: 'HR', slaDays: 7 },
    { stepOrder: 8, title: 'Compliance & safety training', owner: 'HR', slaDays: 10 },
    { stepOrder: 9, title: '30-day check-in with manager', owner: 'Manager', slaDays: 30 },
] as const

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
        avatarUrl: row.avatarUrl,
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
        .where(eq(onboardingChecklists.id, checklistId))

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

    return { step, progress }
}

export async function listChecklists(tenantId: string, params: { limit: number; offset: number }) {
    // Join employee for display fields and load all steps in one extra query.
    const rows = await db
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
            employeeStatus: employees.status,
        })
        .from(onboardingChecklists)
        .leftJoin(employees, eq(onboardingChecklists.employeeId, employees.id))
        .where(eq(onboardingChecklists.tenantId, tenantId))
        .orderBy(desc(onboardingChecklists.createdAt))
        .limit(params.limit)
        .offset(params.offset)

    if (rows.length === 0) return []

    const ids = rows.map(r => r.id)
    const allSteps = await db.select().from(onboardingSteps)
        .where(inArray(onboardingSteps.checklistId, ids))
        .orderBy(onboardingSteps.stepOrder)

    const stepsByChecklist = new Map<string, typeof allSteps>()
    for (const s of allSteps) {
        const arr = stepsByChecklist.get(s.checklistId) ?? []
        arr.push(s)
        stepsByChecklist.set(s.checklistId, arr)
    }

    return rows.map(r => {
        const steps = stepsByChecklist.get(r.id) ?? []
        const completedCount = steps.filter(s => s.status === 'completed').length
        const totalCount = steps.length
        return {
            id: r.id,
            employeeId: r.employeeId,
            employeeName: [r.firstName, r.lastName].filter(Boolean).join(' ') || 'Unknown employee',
            employeeNo: r.employeeNo,
            designation: r.designation,
            department: r.department,
            avatarUrl: r.avatarUrl,
            email: r.email,
            phone: r.phone,
            joinDate: r.joinDate,
            employeeStatus: r.employeeStatus,
            progress: r.progress,
            startDate: r.startDate,
            dueDate: r.dueDate,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            completedCount,
            totalCount,
            steps,
        }
    })
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
        const startMs = data.startDate ? new Date(data.startDate).getTime() : Date.now()
        const templateSteps = DEFAULT_TEMPLATE_STEPS.map(s => ({
            checklistId: checklist.id,
            stepOrder: s.stepOrder,
            title: s.title,
            owner: s.owner,
            slaDays: s.slaDays,
            status: 'pending' as const,
            dueDate: new Date(startMs + s.slaDays * 24 * 3600 * 1000).toISOString().split('T')[0],
        }))
        await db.insert(onboardingSteps).values(templateSteps)
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
