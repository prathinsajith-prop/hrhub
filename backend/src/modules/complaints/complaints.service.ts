import { db } from '../../db/index.js'
import { complaints, employees, users } from '../../db/schema/index.js'
import { eq, and, desc, isNull, sql, ilike, or, inArray } from 'drizzle-orm'
import { sendEmail } from '../../plugins/email.js'

// SLA calendar days per severity (approximate working-day equivalent)
const SLA_DAYS: Record<string, number> = {
    critical: 7,   // 5 working days
    high:     14,  // 10 working days
    medium:   21,  // 15 working days
    low:      42,  // 30 working days
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

function withSubmitterNames(row: typeof complaints.$inferSelect & {
    submitterFirst: string | null
    submitterLast: string | null
    subjectFirst: string | null
    subjectLast: string | null
    assigneeName: string | null
}) {
    const isAnonymous = row.confidentiality === 'anonymous'
    return {
        ...row,
        submitterFirst: undefined,
        submitterLast: undefined,
        subjectFirst: undefined,
        subjectLast: undefined,
        assigneeName: row.assigneeName,
        submittedByName: isAnonymous ? 'Anonymous' : [row.submitterFirst, row.submitterLast].filter(Boolean).join(' ') || null,
        subjectName: [row.subjectFirst, row.subjectLast].filter(Boolean).join(' ') || null,
    }
}

const BASE_SELECT = {
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
    subjectFirst: sql<string | null>`s_emp.first_name`,
    subjectLast: sql<string | null>`s_emp.last_name`,
    assigneeName: sql<string | null>`CASE WHEN ${users.id} IS NOT NULL THEN ${users.name} ELSE NULL END`,
}

const submitterEmp = employees
const subjectEmpAlias = 'se_emp'

export async function listComplaints(tenantId: string, params: {
    limit: number
    offset: number
    search?: string
    status?: string
    severity?: string
    category?: string
    employeeId?: string  // restrict to own complaints
}) {
    // Build with raw query to support subject employee join alias
    const rows = await db.execute(sql`
        SELECT
            c.id, c.tenant_id, c.submitted_by_employee_id, c.subject_employee_id,
            c.title, c.category, c.severity, c.confidentiality, c.description, c.status,
            c.assigned_to_id, c.resolution_notes, c.acknowledged_at, c.resolved_at, c.sla_due_at,
            c.created_at, c.updated_at,
            e.first_name AS submitter_first, e.last_name AS submitter_last,
            se.first_name AS subject_first, se.last_name AS subject_last,
            u.name AS assignee_name
        FROM complaints c
        LEFT JOIN employees e ON c.submitted_by_employee_id = e.id
        LEFT JOIN employees se ON c.subject_employee_id = se.id
        LEFT JOIN users u ON c.assigned_to_id = u.id
        WHERE c.tenant_id = ${tenantId} AND c.deleted_at IS NULL
        ${params.employeeId ? sql`AND c.submitted_by_employee_id = ${params.employeeId}` : sql``}
        ${params.status ? sql`AND c.status = ${params.status}` : sql``}
        ${params.severity ? sql`AND c.severity = ${params.severity}` : sql``}
        ${params.category ? sql`AND c.category = ${params.category}` : sql``}
        ${params.search ? sql`AND (c.title ILIKE ${'%' + params.search + '%'} OR c.description ILIKE ${'%' + params.search + '%'})` : sql``}
        ORDER BY c.created_at DESC
        LIMIT ${params.limit} OFFSET ${params.offset}
    `)

    return (rows as any[]).map(r => ({
        id: r.id,
        tenantId: r.tenant_id,
        submittedByEmployeeId: r.submitted_by_employee_id,
        subjectEmployeeId: r.subject_employee_id,
        title: r.title,
        category: r.category,
        severity: r.severity,
        confidentiality: r.confidentiality,
        description: r.confidentiality === 'anonymous' ? '[Redacted]' : r.description,
        status: r.status,
        assignedToId: r.assigned_to_id,
        resolutionNotes: r.resolution_notes,
        acknowledgedAt: r.acknowledged_at,
        resolvedAt: r.resolved_at,
        slaDueAt: r.sla_due_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        submittedByName: r.confidentiality === 'anonymous' ? 'Anonymous' : [r.submitter_first, r.submitter_last].filter(Boolean).join(' ') || null,
        subjectName: [r.subject_first, r.subject_last].filter(Boolean).join(' ') || null,
        assigneeName: r.assignee_name,
    }))
}

export async function getComplaint(tenantId: string, id: string, employeeId?: string) {
    const [row] = await db.execute(sql`
        SELECT
            c.id, c.tenant_id, c.submitted_by_employee_id, c.subject_employee_id,
            c.title, c.category, c.severity, c.confidentiality, c.description, c.status,
            c.assigned_to_id, c.resolution_notes, c.acknowledged_at, c.resolved_at, c.sla_due_at,
            c.created_at, c.updated_at,
            e.first_name AS submitter_first, e.last_name AS submitter_last,
            se.first_name AS subject_first, se.last_name AS subject_last,
            u.name AS assignee_name
        FROM complaints c
        LEFT JOIN employees e ON c.submitted_by_employee_id = e.id
        LEFT JOIN employees se ON c.subject_employee_id = se.id
        LEFT JOIN users u ON c.assigned_to_id = u.id
        WHERE c.tenant_id = ${tenantId} AND c.id = ${id} AND c.deleted_at IS NULL
        ${employeeId ? sql`AND c.submitted_by_employee_id = ${employeeId}` : sql``}
        LIMIT 1
    `).then(r => r as any[])

    if (!row) return null

    return {
        id: row.id,
        tenantId: row.tenant_id,
        submittedByEmployeeId: row.submitted_by_employee_id,
        subjectEmployeeId: row.subject_employee_id,
        title: row.title,
        category: row.category,
        severity: row.severity,
        confidentiality: row.confidentiality,
        description: row.description,
        status: row.status,
        assignedToId: row.assigned_to_id,
        resolutionNotes: row.resolution_notes,
        acknowledgedAt: row.acknowledged_at,
        resolvedAt: row.resolved_at,
        slaDueAt: row.sla_due_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        submittedByName: row.confidentiality === 'anonymous' ? 'Anonymous' : [row.submitter_first, row.submitter_last].filter(Boolean).join(' ') || null,
        subjectName: [row.subject_first, row.subject_last].filter(Boolean).join(' ') || null,
        assigneeName: row.assignee_name,
    }
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
    }).where(and(eq(complaints.id, id), eq(complaints.tenantId, tenantId))).returning()
    return row ?? null
}

export async function escalateComplaint(tenantId: string, id: string) {
    const [row] = await db.update(complaints).set({
        status: 'escalated',
        updatedAt: new Date(),
    }).where(and(
        eq(complaints.id, id),
        eq(complaints.tenantId, tenantId),
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
    const [counts] = await db.execute(sql`
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status != 'resolved')::int AS open,
            COUNT(*) FILTER (WHERE severity = 'critical' AND status != 'resolved')::int AS critical,
            COUNT(*) FILTER (WHERE sla_due_at < NOW() AND status NOT IN ('resolved'))::int AS overdue
        FROM complaints
        WHERE tenant_id = ${tenantId} AND deleted_at IS NULL
    `).then(r => r as any[])

    return {
        total: Number(counts?.total ?? 0),
        open: Number(counts?.open ?? 0),
        critical: Number(counts?.critical ?? 0),
        overdue: Number(counts?.overdue ?? 0),
    }
}
