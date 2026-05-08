import { eq, and, desc, isNull, isNotNull, gte, lte, sql, getTableColumns, aliasedTable } from 'drizzle-orm'
import { withTimestamp, encodeCursor, decodeCursor } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { resolveAvatarUrl, resolveAvatarUrls } from '../../plugins/s3.js'
import { documents, employees, users } from '../../db/schema/index.js'
import { Conditions } from '../../lib/filters.js'
import type { InferInsertModel } from 'drizzle-orm'

const DOCUMENT_FIELD_MAP = {
    category: documents.category,
    status: documents.status,
    docType: documents.docType,
    expiryDate: documents.expiryDate,
    verified: documents.verified,
}
const DOCUMENT_ALLOWED = new Set(Object.keys(DOCUMENT_FIELD_MAP))

// Maps docType strings → which employee expiry/date/number fields to update on verify.
// Only doc types that carry meaningful employee-level data are listed.
const DOC_EXPIRY_MAP: Record<string, {
    expiryField: 'passportExpiry' | 'emiratesIdExpiry' | 'visaExpiry' | 'labourCardExpiry'
    issueDateField?: 'visaIssueDate'
    /** Employee column that holds the document's identifier (visa number, EID, etc.). */
    numberField?: 'passportNo' | 'emiratesId' | 'visaNumber' | 'labourCardNumber'
}> = {
    'Passport':       { expiryField: 'passportExpiry', numberField: 'passportNo' },
    'Emirates ID':    { expiryField: 'emiratesIdExpiry', numberField: 'emiratesId' },
    'Visa':           { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate', numberField: 'visaNumber' },
    'Residence Visa': { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate', numberField: 'visaNumber' },
    'Entry Permit':   { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate', numberField: 'visaNumber' },
    'Work Permit':    { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate', numberField: 'visaNumber' },
    'Visit Visa':     { expiryField: 'visaExpiry', issueDateField: 'visaIssueDate', numberField: 'visaNumber' },
    'Labour Card':    { expiryField: 'labourCardExpiry', numberField: 'labourCardNumber' },
}

type NewDocument = InferInsertModel<typeof documents>

const verifierUsers = aliasedTable(users, 'verifier')

export async function listDocuments(tenantId: string, params: { employeeId?: string; category?: string; status?: string; from?: string; to?: string; search?: string; filter?: string; limit: number; offset: number; after?: string }) {
    const { employeeId, category, status, from, to, search, filter, limit, offset, after } = params

    // Base conditions (no cursor) — used for count query.
    const baseConds = Conditions.create()
        .tenant(documents.tenantId, tenantId)
        .notDeleted(documents.deletedAt)
        .match(documents.employeeId, employeeId)
        .match(documents.category, category)
        .match(documents.status, status)
        // Calendar uses expiryDate as the event date; filter by [from, to] when provided.
        .dateRange(documents.expiryDate, from, to)
        .nameSearch(search, employees.firstName, employees.lastName, documents.docType)
        .filterWithName(filter, DOCUMENT_FIELD_MAP, DOCUMENT_ALLOWED, employees.firstName, employees.lastName)

    const cursor = after ? decodeCursor(after) : null

    let total = 0
    if (!cursor) {
        const [countRow] = await db
            .select({ count: sql<number>`COUNT(*)`.as('count') })
            .from(documents)
            .leftJoin(employees, eq(employees.id, documents.employeeId))
            .where(baseConds.where())
        total = Number(countRow?.count ?? 0)
    }

    // Extend base with cursor condition for the data query.
    baseConds.cursor(after, documents.createdAt, documents.id)

    const pageSize = limit + 1
    const rows = await db.select({
        ...getTableColumns(documents),
        employeeName: sql<string | null>`CASE WHEN ${employees.id} IS NULL THEN NULL ELSE ${employees.firstName} || ' ' || ${employees.lastName} END`,
        employeeNo: employees.employeeNo,
        employeeAvatarUrl: employees.avatarUrl,
        employeeDepartment: employees.department,
        uploadedByName: users.name,
        verifiedByName: verifierUsers.name,
    })
        .from(documents)
        .leftJoin(employees, eq(employees.id, documents.employeeId))
        .leftJoin(users, eq(users.id, documents.uploadedBy))
        .leftJoin(verifierUsers, eq(verifierUsers.id, documents.verifiedBy))
        .where(baseConds.where())
        .orderBy(desc(documents.createdAt), desc(documents.id))
        .limit(cursor ? pageSize : limit)
        .offset(cursor ? 0 : offset)

    const hasMore = cursor ? rows.length > limit : false
    const pageRows = cursor ? rows.slice(0, limit) : rows
    const lastRow = pageRows.at(-1)
    const nextCursor = (cursor && hasMore && lastRow)
        ? encodeCursor(lastRow.createdAt, lastRow.id)
        : undefined

    // Batch-resolve avatars: dedupe unique keys, sign each once, map back.
    // Avoids N sequential awaits when multiple rows share the same employee.
    const resolvedAvatars = await resolveAvatarUrls(pageRows.map(r => r.employeeAvatarUrl))
    const resolvedRows = pageRows.map((r, i) => ({ ...r, employeeAvatarUrl: resolvedAvatars[i] }))
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

        // Propagate the document's identifier and expiry/issue dates back to
        // the employee record on verify, so the Visa & ID tab, compliance
        // alerts, and expiry workers stay in sync.
        if (row.employeeId && row.docType) {
            const mapping = DOC_EXPIRY_MAP[row.docType]
            if (mapping) {
                const patch: Record<string, unknown> = { updatedAt: new Date() }
                if (row.expiryDate) patch[mapping.expiryField] = row.expiryDate
                if (mapping.issueDateField && row.issueDate) patch[mapping.issueDateField] = row.issueDate
                if (mapping.numberField && row.docNumber && row.docNumber.trim()) {
                    patch[mapping.numberField] = row.docNumber.trim()
                }
                // Only update if at least one real field beyond updatedAt is set.
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
