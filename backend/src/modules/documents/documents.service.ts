import { eq, and, count, desc, lte, isNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { documents } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewDocument = InferInsertModel<typeof documents>

export async function listDocuments(tenantId: string, params: { employeeId?: string; category?: string; status?: string; limit: number; offset: number }) {
    const { employeeId, category, status, limit, offset } = params
    const conditions = [eq(documents.tenantId, tenantId), isNull(documents.deletedAt)]
    if (employeeId) conditions.push(eq(documents.employeeId, employeeId))
    if (category) conditions.push(eq(documents.category, category as never))
    if (status) conditions.push(eq(documents.status, status as never))

    const [{ total }] = await db.select({ total: count() }).from(documents).where(and(...conditions))

    const data = await db.select().from(documents)
        .where(and(...conditions))
        .orderBy(desc(documents.createdAt))
        .limit(limit).offset(offset)

    return { data, total: Number(total), limit, offset, hasMore: offset + limit < Number(total) }
}

export async function getDocument(tenantId: string, id: string) {
    const [row] = await db.select().from(documents)
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
        .limit(1)
    return row ?? null
}

export async function softDeleteDocument(tenantId: string, id: string) {
    const [row] = await db.update(documents)
        .set({ deletedAt: new Date(), updatedAt: new Date() } as any)
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
        .returning()
    return row ?? null
}

export async function createDocument(tenantId: string, uploadedBy: string, data: Omit<NewDocument, 'tenantId' | 'id' | 'uploadedBy'>) {
    const [row] = await db.insert(documents).values({ ...data, tenantId, uploadedBy } as any).returning()
    return row
}

export async function updateDocument(tenantId: string, id: string, data: Partial<NewDocument>) {
    const [row] = await db.update(documents)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function verifyDocument(tenantId: string, id: string, verifiedBy: string) {
    const [row] = await db.update(documents)
        .set({ verified: true, verifiedBy, verifiedAt: new Date(), status: 'valid', updatedAt: new Date() } as any)
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function getExpiringDocuments(tenantId: string, daysAhead = 90) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + daysAhead)

    return db.select().from(documents)
        .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt), lte(documents.expiryDate, cutoff.toISOString().split('T')[0])))
        .orderBy(documents.expiryDate)
        .limit(100)
}
