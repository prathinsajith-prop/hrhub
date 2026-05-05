import { eq, and, desc, lte, gte, isNull, isNotNull, sql, getTableColumns, or, lt } from 'drizzle-orm'
import { withTimestamp, encodeCursor, decodeCursor } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { resolveAvatarUrl } from '../../plugins/s3.js'
import { documents, employees, users } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

// Maps docType strings → which employee expiry/date fields to update on verify.
// Only doc types that carry meaningful employee-level date data are listed.
const DOC_EXPIRY_MAP: Record<string, {
    expiryField: 'passportExpiry' | 'emiratesIdExpiry' | 'visaExpiry' | 'labourCardExpiry'
    issueDateField?: 'visaIssueDate'
}> = {
    'Passport':       { expiryField: 'passportExpiry' },
    'Emirates ID':    { expiryField: 'emiratesIdExpiry' },
    'Visa':           { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate' },
    'Residence Visa': { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate' },
    'Entry Permit':   { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate' },
    'Work Permit':    { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate' },
    'Visit Visa':     { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate' },
    'Labour Card':    { expiryField: 'labourCardExpiry' },
}

type NewDocument = InferInsertModel<typeof documents>

export async function listDocuments(tenantId: string, params: { employeeId?: string; category?: string; status?: string; from?: string; to?: string; limit: number; offset: number; after?: string }) {
    const { employeeId, category, status, from, to, limit, offset, after } = params
    const conditions = [eq(documents.tenantId, tenantId), isNull(documents.deletedAt)]
    if (employeeId) conditions.push(eq(documents.employeeId, employeeId))
    if (category) conditions.push(eq(documents.category, category as never))
    if (status) conditions.push(eq(documents.status, status as never))
    // Calendar uses expiryDate as the event date; filter by [from, to] when provided.
    if (from) conditions.push(gte(documents.expiryDate, from))
    if (to) conditions.push(lte(documents.expiryDate, to))

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
    const rows = await db.select({
        ...getTableColumns(documents),
        employeeName: sql<string | null>`CASE WHEN ${employees.id} IS NULL THEN NULL ELSE ${employees.firstName} || ' ' || ${employees.lastName} END`,
        employeeNo: employees.employeeNo,
        employeeAvatarUrl: employees.avatarUrl,
        employeeDepartment: employees.department,
        uploadedByName: users.name,
    })
        .from(documents)
        .leftJoin(employees, eq(employees.id, documents.employeeId))
        .leftJoin(users, eq(users.id, documents.uploadedBy))
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

    const resolvedRows = await Promise.all(pageRows.map(async r => ({ ...r, employeeAvatarUrl: await resolveAvatarUrl(r.employeeAvatarUrl) })))
    return {
        data: resolvedRows,
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
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
        .returning()
    return row ?? null
}

export async function verifyDocument(tenantId: string, id: string, verifiedBy: string) {
    return db.transaction(async (tx) => {
        const [row] = await tx.update(documents)
            .set(withTimestamp({ verified: true, verifiedBy, verifiedAt: new Date(), status: 'valid' as const, rejectionReason: null, rejectedAt: null, rejectedBy: null }))
            .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
            .returning()

        if (!row) return null

        // Propagate expiry / issue dates back to the employee record so that
        // the Visa & ID tab, compliance alerts, and expiry workers stay in sync.
        if (row.employeeId && row.docType) {
            const mapping = DOC_EXPIRY_MAP[row.docType]
            if (mapping) {
                const patch: Record<string, unknown> = { updatedAt: new Date() }
                if (row.expiryDate) patch[mapping.expiryField] = row.expiryDate
                if (mapping.issueDateField && row.issueDate) patch[mapping.issueDateField] = row.issueDate
                if (Object.keys(patch).length > 1) {
                    await tx.update(employees)
                        .set(patch as any)
                        .where(and(eq(employees.id, row.employeeId), eq(employees.tenantId, tenantId)))
                }
            }
        }

        return row
    })
}

export async function rejectDocument(tenantId: string, id: string, rejectedBy: string, reason: string) {
    const [row] = await db.update(documents)
        .set(withTimestamp({
            verified: false,
            verifiedBy: null,
            verifiedAt: null,
            rejectedBy,
            rejectedAt: new Date(),
            rejectionReason: reason,
            status: 'rejected' as const,
        }))
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
        .returning()
    return row ?? null
}

export async function getExpiringDocuments(tenantId: string, daysAhead = 90) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + daysAhead)

    const today = new Date().toISOString().split('T')[0]
    return db.select().from(documents)
        .where(and(
            eq(documents.tenantId, tenantId),
            isNull(documents.deletedAt),
            isNotNull(documents.expiryDate),
            gte(documents.expiryDate, today),
            lte(documents.expiryDate, cutoff.toISOString().split('T')[0]),
        ))
        .orderBy(documents.expiryDate)
        .limit(100)
}
