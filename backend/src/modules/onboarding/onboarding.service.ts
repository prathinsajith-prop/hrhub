import { eq, and } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { onboardingChecklists, onboardingSteps } from '../../db/schema/index.js'

export async function getChecklist(tenantId: string, employeeId: string) {
    const [checklist] = await db.select().from(onboardingChecklists)
        .where(and(eq(onboardingChecklists.tenantId, tenantId), eq(onboardingChecklists.employeeId, employeeId)))
        .limit(1)

    if (!checklist) return null

    const steps = await db.select().from(onboardingSteps)
        .where(eq(onboardingSteps.checklistId, checklist.id))
        .orderBy(onboardingSteps.stepOrder)

    return { ...checklist, steps }
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
    return db.select().from(onboardingChecklists)
        .where(eq(onboardingChecklists.tenantId, tenantId))
        .limit(params.limit)
        .offset(params.offset)
}
