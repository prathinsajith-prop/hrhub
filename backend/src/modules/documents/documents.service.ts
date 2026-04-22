import { eq, and, desc, lte, isNull, sql, getTableColumns, or, lt } from 'drizzle-orm'
import { withTimestamp, encodeCursor, decodeCursor } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { documents } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewDocument = InferInsertModel<typeof documents>

export async function listDocuments(tenantId: string, params: { employeeId?: string; category?: string; status?: string; limit: number; offset: number; after?: string }) {
    const { employeeId, category, status, limit, offset, after } = params
    const conditions = [eq(documents.tenantId, tenantId), isNull(documents.deletedAt)]
    if (employeeId) conditions.push(eq(documents.employeeId, employeeId))
    if (category) conditions.push(eq(documents.category, category as never))
    if (status) conditions.push(eq(documents.status, status as never))

    const cursor = after ? decodeCursor(after) : null
    if (cursor) {
        const cursorDate = new Date(cursor.c)
        conditions.push(
            or(
                lt(documents.createdAt, cursorDate),
                and(eq(documents.createdAt, cursorDate), lt(documents.id, cursor.i))
            )!
        )
    }

    const pageSize = limit + 1
    const rows = await db.select(getTableColumns(documents))
        .from(documents)
        .where(and(...conditions))
        .orderBy(desc(documents.createdAt), desc(documents.id))
        .limit(cursor ? pageSize : limit)
        .offset(cursor ? 0 : offset)

    const hasMore = cursor ? rows.length > limit : false
    const pageRows = cursor ? rows.slice(0, limit) : rows
    const lastRow = pageRows.at(-1)
    const nextCursor = (cursor && hasMore && lastRow)
        ? encodeCursor(lastRow.createdAt, lastRow.id)
        : undefined

    let total = 0
    if (!cursor) {
        const [countRow] = await db
            .select({ count: sql<number>`COUNT(*)`.as('count') })
            .from(documents)
            .where(and(...conditions))
        total = Number(countRow?.count ?? 0)
    }

    return {
        data: pageRows,
        total: cursor ? undefined : total,
        limit,
        offset: cursor ? undefined : offset,
        hasMore: cursor ? hasMore : offset + limit < total,
        nextCursor,
    }
}

export async function getDocument(tenantId: string, id: string) {
    const [row] = await db.select().from(documents)
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
        .limit(1)
    return row ?? null
}

export async function softDeleteDocument(tenantId: string, id: string) {
    const [row] = await db.update(documents)
        .set(withTimestamp({ deletedAt: new Date() }))
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
        .set(withTimestamp(data))
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function verifyDocument(tenantId: string, id: string, verifiedBy: string) {
    const [row] = await db.update(documents)
        .set(withTimestamp({ verified: true, verifiedBy, verifiedAt: new Date(), status: 'valid' as const }))
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
