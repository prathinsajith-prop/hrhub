import { db } from '../../db/index.js'
import { complaints, employees, users } from '../../db/schema/index.js'
import { eq, and, desc, isNull, sql, ilike, or, inArray, aliasedTable } from 'drizzle-orm'
import { sendEmail } from '../../plugins/email.js'
import { Conditions } from '../../lib/filters.js'

// SLA calendar days per severity (approximate working-day equivalent)
const SLA_DAYS: Record<string, number> = {
    critical: 7,   // 5 working days
    high: 14,  // 10 working days
    medium: 21,  // 15 working days
    low: 42,  // 30 working days
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
}

export type ComplaintCategory = 'harassment' | 'pay_dispute' | 'leave_dispute' | 'working_conditions' | 'discrimination' | 'other'
export type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical'
export type ComplaintConfidentiality = 'anonymous' | 'named' | 'confidential'
export type ComplaintStatus = 'draft' | 'submitted' | 'under_review' | 'escalated' | 'resolved'

export interface CreateComplaintInput {
    submittedByEmployeeId: string
    subjectEmployeeId?: string | null
    title: string
    category: ComplaintCategory
    severity: ComplaintSeverity
    confidentiality: ComplaintConfidentiality
    description: string
}

export interface UpdateComplaintInput {
    title?: string
    category?: ComplaintCategory
    severity?: ComplaintSeverity
    confidentiality?: ComplaintConfidentiality
    description?: string
    subjectEmployeeId?: string | null
}

// Aliased table for the subject employee join (avoids ambiguous column references)
const subjectEmp = aliasedTable(employees, 'subject_emp')

const COMPLAINT_FIELD_MAP = {
    status: complaints.status,
    severity: complaints.severity,
    category: complaints.category,
}
const COMPLAINT_ALLOWED = new Set(Object.keys(COMPLAINT_FIELD_MAP))

const COMPLAINT_SELECT = {
    id: complaints.id,
    tenantId: complaints.tenantId,
    submittedByEmployeeId: complaints.submittedByEmployeeId,
    subjectEmployeeId: complaints.subjectEmployeeId,
    title: complaints.title,
    category: complaints.category,
    severity: complaints.severity,
    confidentiality: complaints.confidentiality,
    description: complaints.description,
    status: complaints.status,
    assignedToId: complaints.assignedToId,
    resolutionNotes: complaints.resolutionNotes,
    acknowledgedAt: complaints.acknowledgedAt,
    resolvedAt: complaints.resolvedAt,
    slaDueAt: complaints.slaDueAt,
    createdAt: complaints.createdAt,
    updatedAt: complaints.updatedAt,
    submitterFirst: employees.firstName,
    submitterLast: employees.lastName,
    subjectFirst: subjectEmp.firstName,
    subjectLast: subjectEmp.lastName,
    assigneeName: users.name,
}

function mapRow(row: {
    id: string; tenantId: string; submittedByEmployeeId: string | null; subjectEmployeeId: string | null
    title: string; category: string; severity: string; confidentiality: string; description: string; status: string
    assignedToId: string | null; resolutionNotes: string | null; acknowledgedAt: Date | null; resolvedAt: Date | null
    slaDueAt: Date | null; createdAt: Date; updatedAt: Date
    submitterFirst: string | null; submitterLast: string | null
    subjectFirst: string | null; subjectLast: string | null; assigneeName: string | null
}) {
    const isAnon = row.confidentiality === 'anonymous'
    return {
        id: row.id,
        tenantId: row.tenantId,
        submittedByEmployeeId: row.submittedByEmployeeId,
        subjectEmployeeId: row.subjectEmployeeId,
        title: row.title,
        category: row.category,
        severity: row.severity,
        confidentiality: row.confidentiality,
        description: isAnon ? '[Redacted]' : row.description,
        status: row.status,
        assignedToId: row.assignedToId,
        resolutionNotes: row.resolutionNotes,
        acknowledgedAt: row.acknowledgedAt,
        resolvedAt: row.resolvedAt,
        slaDueAt: row.slaDueAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        submittedByName: isAnon ? 'Anonymous' : [row.submitterFirst, row.submitterLast].filter(Boolean).join(' ') || null,
        subjectName: [row.subjectFirst, row.subjectLast].filter(Boolean).join(' ') || null,
        assigneeName: row.assigneeName,
    }
}

export async function listComplaints(tenantId: string, params: {
    limit: number
    offset: number
    search?: string
    filter?: string
    status?: string
    severity?: string
    category?: string
    employeeId?: string
}) {
    const conds = Conditions.create()
        .tenant(complaints.tenantId, tenantId)
        .notDeleted(complaints.deletedAt)
        .match(complaints.submittedByEmployeeId, params.employeeId)
        .match(complaints.status, params.status)
        .match(complaints.severity, params.severity)
        .match(complaints.category, params.category)
        .filter(params.filter, COMPLAINT_FIELD_MAP, COMPLAINT_ALLOWED)

    if (params.search?.trim()) {
        const q = `%${params.search.trim()}%`
        conds.add(or(ilike(complaints.title, q), ilike(complaints.description, q)))
    }

    const [rows, countRows] = await Promise.all([
        db.select(COMPLAINT_SELECT)
            .from(complaints)
            .leftJoin(employees, eq(complaints.submittedByEmployeeId, employees.id))
            .leftJoin(subjectEmp, eq(complaints.subjectEmployeeId, subjectEmp.id))
            .leftJoin(users, eq(complaints.assignedToId, users.id))
            .where(conds.where())
            .orderBy(desc(complaints.createdAt))
            .limit(params.limit)
            .offset(params.offset),
        db.select({ count: sql<number>`COUNT(*)::int` })
            .from(complaints)
            .where(conds.where()),
    ])

    const total = Number(countRows[0]?.count ?? 0)
    return {
        data: rows.map(mapRow),
        total,
        limit: params.limit,
        offset: params.offset,
        hasMore: params.offset + rows.length < total,
    }
}

export async function getComplaint(tenantId: string, id: string, employeeId?: string) {
    const conds = Conditions.create()
        .tenant(complaints.tenantId, tenantId)
        .notDeleted(complaints.deletedAt)
        .match(complaints.id, id)
        .match(complaints.submittedByEmployeeId, employeeId)

    const [row] = await db.select(COMPLAINT_SELECT)
        .from(complaints)
        .leftJoin(employees, eq(complaints.submittedByEmployeeId, employees.id))
        .leftJoin(subjectEmp, eq(complaints.subjectEmployeeId, subjectEmp.id))
        .leftJoin(users, eq(complaints.assignedToId, users.id))
        .where(conds.where())
        .limit(1)

    return row ? mapRow(row) : null
}

export async function createComplaint(tenantId: string, input: CreateComplaintInput) {
    const [row] = await db.insert(complaints).values({
        tenantId,
        submittedByEmployeeId: input.submittedByEmployeeId,
        subjectEmployeeId: input.subjectEmployeeId ?? null,
        title: input.title.trim(),
        category: input.category,
        severity: input.severity,
        confidentiality: input.confidentiality,
        description: input.description.trim(),
        status: 'draft',
    }).returning()
    return row
}

export async function updateComplaint(tenantId: string, id: string, input: UpdateComplaintInput, employeeId?: string) {
    const whereClause = employeeId
        ? and(eq(complaints.id, id), eq(complaints.tenantId, tenantId), eq(complaints.submittedByEmployeeId, employeeId))
        : and(eq(complaints.id, id), eq(complaints.tenantId, tenantId))

    const [row] = await db.update(complaints).set({
        ...(input.title !== undefined && { title: input.title.trim() }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.severity !== undefined && { severity: input.severity }),
        ...(input.confidentiality !== undefined && { confidentiality: input.confidentiality }),
        ...(input.description !== undefined && { description: input.description.trim() }),
        ...(input.subjectEmployeeId !== undefined && { subjectEmployeeId: input.subjectEmployeeId }),
        updatedAt: new Date(),
    }).where(whereClause!).returning()

    return row ?? null
}

export async function submitComplaint(tenantId: string, id: string, employeeId: string) {
    const now = new Date()
    const [existing] = await db.select({ severity: complaints.severity, status: complaints.status, title: complaints.title })
        .from(complaints)
        .where(and(eq(complaints.id, id), eq(complaints.tenantId, tenantId), eq(complaints.submittedByEmployeeId, employeeId)))
        .limit(1)

    if (!existing) return null
    if (existing.status !== 'draft') return { error: 'not_draft' as const }

    const slaDays = SLA_DAYS[existing.severity] ?? 42
    const [row] = await db.update(complaints).set({
        status: 'submitted',
        slaDueAt: addDays(now, slaDays),
        updatedAt: now,
    }).where(and(eq(complaints.id, id), eq(complaints.tenantId, tenantId))).returning()

    if (!row) return null

    // Notify HR managers and super admins — acknowledgement SLA is 2 working days
    try {
        const hrUsers = await db.select({ name: users.name, email: users.email })
            .from(users)
            .where(and(
                eq(users.tenantId, tenantId),
                eq(users.isActive, true),
                inArray(users.role, ['hr_manager', 'super_admin'] as never[]),
            ))
            .limit(10)

        for (const u of hrUsers) {
            if (!u.email) continue
            sendEmail({
                to: u.email,
                subject: `New Complaint Submitted — ${existing.severity.toUpperCase()} severity`,
                html: `<p>Hi ${u.name ?? 'HR Manager'},</p>
<p>A new complaint has been submitted and requires acknowledgement within <strong>2 working days</strong>.</p>
<ul>
  <li><strong>Title:</strong> ${existing.title}</li>
  <li><strong>Severity:</strong> ${existing.severity}</li>
  <li><strong>SLA deadline:</strong> ${row.slaDueAt?.toISOString().split('T')[0] ?? 'N/A'}</li>
</ul>
<p>Please log in to HRHub to review and acknowledge the complaint.</p>`,
                text: `New ${existing.severity} complaint submitted: "${existing.title}". SLA deadline: ${row.slaDueAt?.toISOString().split('T')[0] ?? 'N/A'}. Please acknowledge within 2 working days.`,
            }).catch(() => { /* non-fatal */ })
        }
    } catch { /* non-fatal — submission already persisted */ }

    return row
}

export async function acknowledgeComplaint(tenantId: string, id: string) {
    const [row] = await db.update(complaints).set({
        status: 'under_review',
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
    }).where(and(
        eq(complaints.id, id),
        eq(complaints.tenantId, tenantId),
        sql`status = 'submitted'`,
    )).returning()
    return row ?? null
}

export async function assignComplaint(tenantId: string, id: string, assignedToId: string) {
    const [row] = await db.update(complaints).set({
        assignedToId,
        updatedAt: new Date(),
    }).where(and(eq(complaints.id, id), eq(complaints.tenantId, tenantId), isNull(complaints.deletedAt))).returning()
    return row ?? null
}

export async function escalateComplaint(tenantId: string, id: string) {
    const [row] = await db.update(complaints).set({
        status: 'escalated',
        updatedAt: new Date(),
    }).where(and(
        eq(complaints.id, id),
        eq(complaints.tenantId, tenantId),
        isNull(complaints.deletedAt),
        sql`status IN ('submitted','under_review')`,
    )).returning()
    return row ?? null
}

export async function resolveComplaint(tenantId: string, id: string, resolutionNotes: string) {
    const now = new Date()
    const [row] = await db.update(complaints).set({
        status: 'resolved',
        resolutionNotes: resolutionNotes.trim(),
        resolvedAt: now,
        updatedAt: now,
    }).where(and(
        eq(complaints.id, id),
        eq(complaints.tenantId, tenantId),
        isNull(complaints.deletedAt),
        sql`status != 'resolved'`,
    )).returning()
    return row ?? null
}

export async function deleteComplaint(tenantId: string, id: string) {
    const [row] = await db
        .update(complaints)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(complaints.id, id), eq(complaints.tenantId, tenantId), isNull(complaints.deletedAt)))
        .returning()
    return row ?? null
}

export async function getComplaintStats(tenantId: string) {
    const [counts] = await db
        .select({
            total: sql<number>`COUNT(*)::int`,
            open: sql<number>`COUNT(*) FILTER (WHERE ${complaints.status} != 'resolved')::int`,
            critical: sql<number>`COUNT(*) FILTER (WHERE ${complaints.severity} = 'critical' AND ${complaints.status} != 'resolved')::int`,
            overdue: sql<number>`COUNT(*) FILTER (WHERE ${complaints.slaDueAt} < NOW() AND ${complaints.status} NOT IN ('resolved'))::int`,
        })
        .from(complaints)
        .where(and(eq(complaints.tenantId, tenantId), isNull(complaints.deletedAt)))

    return {
        total: Number(counts?.total ?? 0),
        open: Number(counts?.open ?? 0),
        critical: Number(counts?.critical ?? 0),
        overdue: Number(counts?.overdue ?? 0),
    }
}
