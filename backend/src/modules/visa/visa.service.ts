import { eq, and, count, desc, isNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { visaApplications } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewVisa = InferInsertModel<typeof visaApplications>

export async function listVisas(tenantId: string, params: { status?: string; urgencyLevel?: string; limit: number; offset: number }) {
    const { status, urgencyLevel, limit, offset } = params
    const conditions = [eq(visaApplications.tenantId, tenantId), isNull(visaApplications.deletedAt)]
    if (status) conditions.push(eq(visaApplications.status, status as never))
    if (urgencyLevel) conditions.push(eq(visaApplications.urgencyLevel, urgencyLevel as never))

    const [{ total }] = await db.select({ total: count() }).from(visaApplications).where(and(...conditions))

    const data = await db.select().from(visaApplications)
        .where(and(...conditions))
        .orderBy(desc(visaApplications.updatedAt))
        .limit(limit).offset(offset)

    return { data, total: Number(total), limit, offset, hasMore: offset + limit < Number(total) }
}

export async function getVisa(tenantId: string, id: string) {
    const [row] = await db.select().from(visaApplications)
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId), isNull(visaApplications.deletedAt)))
        .limit(1)
    return row ?? null
}

export async function softDeleteVisa(tenantId: string, id: string) {
    const [row] = await db.update(visaApplications)
        .set({ deletedAt: new Date(), updatedAt: new Date() } as any)
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId), isNull(visaApplications.deletedAt)))
        .returning()
    return row ?? null
}

export async function createVisa(tenantId: string, data: Omit<NewVisa, 'tenantId' | 'id'>) {
    const [row] = await db.insert(visaApplications).values({ ...data, tenantId }).returning()
    return row
}

export async function updateVisa(tenantId: string, id: string, data: Partial<NewVisa>) {
    const [row] = await db.update(visaApplications)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function advanceVisaStep(tenantId: string, id: string) {
    const visa = await getVisa(tenantId, id)
    if (!visa) return null

    const newStep = Math.min(visa.currentStep + 1, visa.totalSteps)
    const newStatus = newStep === visa.totalSteps ? 'active' : visa.status

    const [row] = await db.update(visaApplications)
        .set({ currentStep: newStep, status: newStatus, updatedAt: new Date() } as any)
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId)))
        .returning()

    return row
}
