// ─── Offboarding Flow Service ────────────────────────────────────────────────
// Backs the Org-Settings → Offboarding Flow tab (5 sub-steps: Preferences,
// Clearances, Exit Interview, Documents, Workflows) and the runtime helpers
// the exit module calls when an exit request progresses.
//
// All operations are tenant-scoped — the caller (route layer) always passes
// the authenticated user's tenantId; no cross-tenant access is possible.

import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
    offboardingFlowSettings,
    offboardingClearanceTemplates,
    offboardingInterviewQuestions,
    offboardingExitDocuments,
    offboardingWorkflows,
    exitClearanceItems,
    exitInterviewResponses,
    exitRequests,
    employees,
    users,
} from '../../db/schema/index.js'
import { ServiceError } from '../../lib/errors.js'
import { createNotification } from '../notifications/notifications.service.js'
import { sendEmail } from '../../plugins/email.js'
import { log } from '../../lib/logger.js'
import { signExitInterviewToken, buildExitInterviewLink } from '../../lib/exit-interview-tokens.js'
import { DEFAULT_INTERVIEW_QUESTIONS, DEFAULT_EXIT_DOCUMENTS } from './offboarding.defaults.js'

// ─── Type aliases ───────────────────────────────────────────────────────────

export type OwnerType = 'hr_partner' | 'reporting_manager' | 'specific_user'
export type WorkflowTrigger =
    | 'on_request_added'
    | 'on_approved'
    | 'on_rejected'
    | 'on_clearance_complete'
    | 'on_settlement_paid'
    | 'on_relieving_date'
export type WorkflowActionType = 'email_alert' | 'notification' | 'custom_function'
export type Recipient = 'employee' | 'reporting_manager' | 'hr_partner' | 'custom'

// ─── Settings (singleton per tenant) ────────────────────────────────────────

/**
 * Reads the offboarding-flow settings row for the tenant, creating it lazily.
 *
 * Race-safe: two concurrent first-time GETs against the same tenant would
 * otherwise both miss the SELECT, both try to INSERT, and the loser would
 * 23505 on the UNIQUE (tenant_id) index. `onConflictDoNothing()` makes the
 * insert idempotent; if it returns no row (lost the race) we re-fetch.
 */
export async function getSettings(tenantId: string) {
    const [existing] = await db.select().from(offboardingFlowSettings)
        .where(eq(offboardingFlowSettings.tenantId, tenantId))
        .limit(1)
    if (existing) return existing

    const [created] = await db.insert(offboardingFlowSettings)
        .values({ tenantId })
        .onConflictDoNothing({ target: offboardingFlowSettings.tenantId })
        .returning()
    if (created) return created

    // Lost the race — another request inserted between our SELECT and INSERT.
    // Re-read; the row is guaranteed to be there now.
    const [refetched] = await db.select().from(offboardingFlowSettings)
        .where(eq(offboardingFlowSettings.tenantId, tenantId))
        .limit(1)
    return refetched
}

export interface SettingsPatch {
    noticePeriodEnabled?: boolean
    noticePeriodValue?: number
    noticePeriodUnit?: 'days' | 'months'
    hrPartnerUserIds?: string[]
    approvalReportingLevels?: number
    approvalRequireHrPartner?: boolean
    interviewIntroMessage?: string | null
    interviewThankYouMessage?: string | null
    workflowTrigger?: 'on_request_added' | 'on_approved' | 'on_relieving_date'
}

export async function updateSettings(tenantId: string, patch: SettingsPatch) {
    // Make sure the row exists.
    await getSettings(tenantId)
    const [row] = await db.update(offboardingFlowSettings)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(offboardingFlowSettings.tenantId, tenantId))
        .returning()
    return row
}

// ─── Clearance templates ────────────────────────────────────────────────────

export async function listClearanceTemplates(tenantId: string) {
    return db.select().from(offboardingClearanceTemplates)
        .where(eq(offboardingClearanceTemplates.tenantId, tenantId))
        .orderBy(asc(offboardingClearanceTemplates.position), asc(offboardingClearanceTemplates.createdAt))
}

export interface ClearanceTemplatePayload {
    name: string
    description?: string | null
    ownerType: OwnerType
    ownerUserId?: string | null
    startOffsetDays: number
    endOffsetDays: number
    position?: number
    isActive?: boolean
}

export async function createClearanceTemplate(tenantId: string, body: ClearanceTemplatePayload) {
    const [row] = await db.insert(offboardingClearanceTemplates)
        .values({ tenantId, ...body })
        .returning()
    return row
}

export async function updateClearanceTemplate(tenantId: string, id: string, patch: Partial<ClearanceTemplatePayload>) {
    const [row] = await db.update(offboardingClearanceTemplates)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(
            eq(offboardingClearanceTemplates.id, id),
            eq(offboardingClearanceTemplates.tenantId, tenantId),
        ))
        .returning()
    if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Clearance template not found')
    return row
}

export async function deleteClearanceTemplate(tenantId: string, id: string) {
    const result = await db.delete(offboardingClearanceTemplates)
        .where(and(
            eq(offboardingClearanceTemplates.id, id),
            eq(offboardingClearanceTemplates.tenantId, tenantId),
        ))
        .returning({ id: offboardingClearanceTemplates.id })
    if (result.length === 0) throw new ServiceError(404, 'NOT_FOUND', 'Clearance template not found')
}

// ─── Interview questions ────────────────────────────────────────────────────

/**
 * Lazily seed the standard 13-question exit interview for a tenant that has
 * never configured one. Idempotent — does nothing once questions exist.
 * Safe to call from list/read paths; admins can still delete defaults
 * afterwards and they won't be re-seeded.
 */
async function ensureDefaultInterviewQuestions(tenantId: string): Promise<void> {
    const [seenRow] = await db.select({ id: offboardingInterviewQuestions.id })
        .from(offboardingInterviewQuestions)
        .where(eq(offboardingInterviewQuestions.tenantId, tenantId))
        .limit(1)
    if (seenRow) return
    await db.insert(offboardingInterviewQuestions).values(
        DEFAULT_INTERVIEW_QUESTIONS.map((q, i) => ({
            tenantId,
            questionText: q.questionText,
            questionType: q.questionType,
            required: q.required,
            position: i,
            isActive: true,
        })),
    ).onConflictDoNothing()
}

export async function listInterviewQuestions(tenantId: string) {
    await ensureDefaultInterviewQuestions(tenantId)
    return db.select().from(offboardingInterviewQuestions)
        .where(eq(offboardingInterviewQuestions.tenantId, tenantId))
        .orderBy(asc(offboardingInterviewQuestions.position), asc(offboardingInterviewQuestions.createdAt))
}

export interface InterviewQuestionPayload {
    questionText: string
    questionType: 'short_text' | 'long_text' | 'rating' | 'single_choice' | 'multi_choice' | 'yes_no'
    options?: string[] | null
    required?: boolean
    position?: number
    isActive?: boolean
}

export async function createInterviewQuestion(tenantId: string, body: InterviewQuestionPayload) {
    const [row] = await db.insert(offboardingInterviewQuestions)
        .values({ tenantId, ...body })
        .returning()
    return row
}

export async function updateInterviewQuestion(tenantId: string, id: string, patch: Partial<InterviewQuestionPayload>) {
    const [row] = await db.update(offboardingInterviewQuestions)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(
            eq(offboardingInterviewQuestions.id, id),
            eq(offboardingInterviewQuestions.tenantId, tenantId),
        ))
        .returning()
    if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Interview question not found')
    return row
}

export async function deleteInterviewQuestion(tenantId: string, id: string) {
    const result = await db.delete(offboardingInterviewQuestions)
        .where(and(
            eq(offboardingInterviewQuestions.id, id),
            eq(offboardingInterviewQuestions.tenantId, tenantId),
        ))
        .returning({ id: offboardingInterviewQuestions.id })
    if (result.length === 0) throw new ServiceError(404, 'NOT_FOUND', 'Interview question not found')
}

/**
 * Persist a new order for the tenant's interview questions. IDs that don't
 * belong to the tenant are silently dropped — a defensive measure against
 * stale client state. A single UPDATE … CASE rewrites every position in one
 * round trip.
 */
export async function reorderInterviewQuestions(tenantId: string, orderedIds: string[]) {
    return db.transaction(async (tx) => {
        const rows = await tx.select({ id: offboardingInterviewQuestions.id })
            .from(offboardingInterviewQuestions)
            .where(eq(offboardingInterviewQuestions.tenantId, tenantId))
        const allowed = new Set(rows.map(r => r.id))
        const valid = orderedIds.filter(id => allowed.has(id))
        if (valid.length === 0) return []

        const caseClauses = valid.map((id, i) => sql`WHEN ${id}::uuid THEN ${i}`)
        await tx.update(offboardingInterviewQuestions)
            .set({
                position: sql`CASE ${offboardingInterviewQuestions.id} ${sql.join(caseClauses, sql` `)} END`,
                updatedAt: new Date(),
            })
            .where(and(
                eq(offboardingInterviewQuestions.tenantId, tenantId),
                inArray(offboardingInterviewQuestions.id, valid),
            ))
        return tx.select().from(offboardingInterviewQuestions)
            .where(eq(offboardingInterviewQuestions.tenantId, tenantId))
            .orderBy(asc(offboardingInterviewQuestions.position), asc(offboardingInterviewQuestions.createdAt))
    })
}

// ─── Exit documents catalog ─────────────────────────────────────────────────

/**
 * Lazily seed Experience + Relieving letters for tenants that haven't created
 * any documents yet. Mirrors the pattern used for interview questions.
 */
async function ensureDefaultExitDocuments(tenantId: string): Promise<void> {
    const [seenRow] = await db.select({ id: offboardingExitDocuments.id })
        .from(offboardingExitDocuments)
        .where(eq(offboardingExitDocuments.tenantId, tenantId))
        .limit(1)
    if (seenRow) return
    await db.insert(offboardingExitDocuments).values(
        DEFAULT_EXIT_DOCUMENTS.map((d, i) => ({
            tenantId,
            name: d.name,
            bodyTemplate: d.bodyTemplate,
            required: d.required,
            position: i,
            isActive: true,
        })),
    ).onConflictDoNothing()
}

export async function listExitDocuments(tenantId: string) {
    await ensureDefaultExitDocuments(tenantId)
    return db.select().from(offboardingExitDocuments)
        .where(eq(offboardingExitDocuments.tenantId, tenantId))
        .orderBy(asc(offboardingExitDocuments.position), asc(offboardingExitDocuments.createdAt))
}

export interface ExitDocumentPayload {
    name: string
    bodyTemplate?: string | null
    documentTemplateId?: string | null
    autoGenerate?: boolean
    required?: boolean
    position?: number
    isActive?: boolean
}

export async function createExitDocument(tenantId: string, body: ExitDocumentPayload) {
    const [row] = await db.insert(offboardingExitDocuments)
        .values({ tenantId, ...body })
        .returning()
    return row
}

export async function updateExitDocument(tenantId: string, id: string, patch: Partial<ExitDocumentPayload>) {
    const [row] = await db.update(offboardingExitDocuments)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(
            eq(offboardingExitDocuments.id, id),
            eq(offboardingExitDocuments.tenantId, tenantId),
        ))
        .returning()
    if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Exit document not found')
    return row
}

export async function deleteExitDocument(tenantId: string, id: string) {
    const result = await db.delete(offboardingExitDocuments)
        .where(and(
            eq(offboardingExitDocuments.id, id),
            eq(offboardingExitDocuments.tenantId, tenantId),
        ))
        .returning({ id: offboardingExitDocuments.id })
    if (result.length === 0) throw new ServiceError(404, 'NOT_FOUND', 'Exit document not found')
}

// ─── Workflows ──────────────────────────────────────────────────────────────

export async function listWorkflows(tenantId: string) {
    return db.select().from(offboardingWorkflows)
        .where(eq(offboardingWorkflows.tenantId, tenantId))
        .orderBy(asc(offboardingWorkflows.position), asc(offboardingWorkflows.createdAt))
}

export interface WorkflowPayload {
    name: string
    trigger: WorkflowTrigger
    actionType: WorkflowActionType
    config: {
        recipients?: Recipient[]
        customEmails?: string[]
        subject?: string
        body?: string
        message?: string
        actionUrl?: string
        code?: string
    }
    enabled?: boolean
    position?: number
}

export async function createWorkflow(tenantId: string, body: WorkflowPayload) {
    const [row] = await db.insert(offboardingWorkflows)
        .values({ tenantId, ...body })
        .returning()
    return row
}

export async function updateWorkflow(tenantId: string, id: string, patch: Partial<WorkflowPayload>) {
    const [row] = await db.update(offboardingWorkflows)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(
            eq(offboardingWorkflows.id, id),
            eq(offboardingWorkflows.tenantId, tenantId),
        ))
        .returning()
    if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Workflow not found')
    return row
}

export async function deleteWorkflow(tenantId: string, id: string) {
    const result = await db.delete(offboardingWorkflows)
        .where(and(
            eq(offboardingWorkflows.id, id),
            eq(offboardingWorkflows.tenantId, tenantId),
        ))
        .returning({ id: offboardingWorkflows.id })
    if (result.length === 0) throw new ServiceError(404, 'NOT_FOUND', 'Workflow not found')
}

// ─── Runtime helpers (called by exit module) ────────────────────────────────

/**
 * Pure owner-resolution helper (exported for unit testing). Maps a clearance
 * template's ownerType to a concrete `users.id` given the runtime context.
 * Returns `null` when no owner can be resolved — callers must handle that
 * downstream (route layer rejects non-HR mutations on null-owner items).
 */
export function resolveClearanceOwnerId(
    template: { ownerType: 'hr_partner' | 'reporting_manager' | 'specific_user'; ownerUserId: string | null },
    ctx: { firstHrPartner: string | null; managerUserId: string | null },
): string | null {
    if (template.ownerType === 'specific_user') return template.ownerUserId
    if (template.ownerType === 'reporting_manager') return ctx.managerUserId
    return ctx.firstHrPartner
}

/**
 * Pure date helper (exported for unit testing). Returns ISO `YYYY-MM-DD` for
 * `relievingDate − offsetDays`. Offsets are clamped to non-negative so a
 * fat-fingered config doesn't push dates into the future.
 */
export function subtractClearanceOffset(relievingDate: string, offsetDays: number): string {
    const d = new Date(relievingDate)
    d.setDate(d.getDate() - Math.max(0, offsetDays))
    return d.toISOString().slice(0, 10)
}

/**
 * Materialise the tenant's clearance templates into concrete `exit_clearance_items`
 * rows for a freshly-created exit request. Owner resolution rules:
 *   - hr_partner       → first HR-partner user ID from settings (or null)
 *   - reporting_manager → users.employeeId === employee.reportingTo (best-effort)
 *   - specific_user    → template.ownerUserId
 *
 * Dates: startOffsetDays / endOffsetDays are subtracted from the relieving date.
 *
 * `prefetchedSettings` lets the caller pass an already-fetched settings row
 * to avoid an extra DB hit during exit creation — see initiateExit() in
 * the exit module.
 */
export async function instantiateClearancesForExit(
    tenantId: string,
    exitRequestId: string,
    relievingDate: string,
    reportingToEmployeeId: string | null,
    prefetchedSettings?: Awaited<ReturnType<typeof getSettings>>,
): Promise<void> {
    const [settings, templates] = await Promise.all([
        prefetchedSettings ? Promise.resolve(prefetchedSettings) : getSettings(tenantId),
        listClearanceTemplates(tenantId),
    ])
    const active = templates.filter(t => t.isActive)
    if (active.length === 0) return

    // Resolve owner user IDs in one pass
    const firstHrPartner = settings.hrPartnerUserIds?.[0] ?? null
    // For reporting-manager owners, fetch the user_id linked to the manager's employee record
    let managerUserId: string | null = null
    if (reportingToEmployeeId && active.some(t => t.ownerType === 'reporting_manager')) {
        const [u] = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, reportingToEmployeeId)))
            .limit(1)
        managerUserId = u?.id ?? null
    }

    const rows = active.map((tpl, i) => ({
        tenantId,
        exitRequestId,
        templateId: tpl.id,
        name: tpl.name,
        description: tpl.description,
        ownerUserId: resolveClearanceOwnerId(tpl, { firstHrPartner, managerUserId }),
        startDate: subtractClearanceOffset(relievingDate, tpl.startOffsetDays),
        dueDate: subtractClearanceOffset(relievingDate, tpl.endOffsetDays),
        position: tpl.position ?? i,
    }))

    await db.insert(exitClearanceItems).values(rows)
}

/**
 * Per-exit clearance list — surfaced in the exit detail page.
 */
export async function listClearancesForExit(tenantId: string, exitRequestId: string) {
    return db.select().from(exitClearanceItems)
        .where(and(
            eq(exitClearanceItems.tenantId, tenantId),
            eq(exitClearanceItems.exitRequestId, exitRequestId),
        ))
        .orderBy(asc(exitClearanceItems.position), asc(exitClearanceItems.createdAt))
}

/**
 * Approval-readiness check used by exit.service.approveExit() and the
 * Exit-detail UI. Two gates:
 *   1. Every clearance item must reach a terminal state (completed/waived)
 *   2. If the tenant has configured exit-interview questions, the interview
 *      must be submitted (at least one response row)
 *
 * HR users can pass `override: true` to bypass both gates — reserved for
 * emergencies and audit-logged.
 */
export interface ExitApprovalReadiness {
    canApprove: boolean
    totalClearances: number
    completedClearances: number
    pendingClearances: Array<{ id: string; name: string; status: string }>
    /** True when the tenant has at least one ACTIVE REQUIRED interview question.
     *  Optional-only catalogs never block approval. */
    interviewRequired: boolean
    /** True when any interview response row exists for this exit (used by the
     *  timeline visualisation; the gate uses `pendingRequiredQuestions`). */
    interviewSubmitted: boolean
    /** Names of required questions still missing a non-empty answer. Empty
     *  array ⇒ all required questions answered. */
    pendingRequiredQuestions: string[]
    documentsConfigured: number
}

export async function getExitApprovalReadiness(
    tenantId: string,
    exitRequestId: string,
): Promise<ExitApprovalReadiness> {
    const [clearances, responses, documents, activeQuestions] = await Promise.all([
        listClearancesForExit(tenantId, exitRequestId),
        db.select({
            questionId: exitInterviewResponses.questionId,
            answerText: exitInterviewResponses.answerText,
            answerValue: exitInterviewResponses.answerValue,
        }).from(exitInterviewResponses).where(and(
            eq(exitInterviewResponses.tenantId, tenantId),
            eq(exitInterviewResponses.exitRequestId, exitRequestId),
        )),
        listExitDocuments(tenantId),
        db.select({
            id: offboardingInterviewQuestions.id,
            questionText: offboardingInterviewQuestions.questionText,
            questionType: offboardingInterviewQuestions.questionType,
            required: offboardingInterviewQuestions.required,
        }).from(offboardingInterviewQuestions).where(and(
            eq(offboardingInterviewQuestions.tenantId, tenantId),
            eq(offboardingInterviewQuestions.isActive, true),
        )),
    ])
    const pending = clearances.filter(c => c.status !== 'completed' && c.status !== 'waived')

    // The interview gate is now "every required question has a non-empty
    // answer", not "any response row exists". Optional catalogs don't block.
    const answerByQid = new Map(responses.map(r => [r.questionId ?? '', r]))
    const requiredQuestions = activeQuestions.filter(q => q.required)
    const interviewRequired = requiredQuestions.length > 0
    const interviewSubmitted = responses.length > 0
    const pendingRequiredQuestions = requiredQuestions
        .filter(q => !isAnswerNonEmpty(q.questionType, answerByQid.get(q.id)))
        .map(q => q.questionText)

    const clearanceOk = pending.length === 0
    const interviewOk = !interviewRequired || pendingRequiredQuestions.length === 0
    return {
        canApprove: clearanceOk && interviewOk,
        totalClearances: clearances.length,
        completedClearances: clearances.length - pending.length,
        pendingClearances: pending.map(c => ({ id: c.id, name: c.name, status: c.status })),
        interviewRequired,
        interviewSubmitted,
        pendingRequiredQuestions,
        documentsConfigured: documents.length,
    }
}

/**
 * Add an ad-hoc clearance item to an in-flight exit. Used when HR needs to
 * tack on a check that wasn't in the standard template set (one-off
 * equipment recovery, regulatory sign-off, etc.). The new item is placed at
 * the end of the list and inherits a NULL owner unless the caller specifies
 * one — HR can reassign from the detail panel.
 */
export async function addClearanceItem(
    tenantId: string,
    exitRequestId: string,
    body: {
        name: string
        description?: string | null
        ownerUserId?: string | null
        startDate?: string | null
        dueDate?: string | null
    },
) {
    const existing = await db.select({ position: exitClearanceItems.position }).from(exitClearanceItems)
        .where(and(
            eq(exitClearanceItems.tenantId, tenantId),
            eq(exitClearanceItems.exitRequestId, exitRequestId),
        ))
    const nextPos = existing.reduce((m, r) => Math.max(m, r.position ?? 0), -1) + 1

    const [row] = await db.insert(exitClearanceItems).values({
        tenantId,
        exitRequestId,
        name: body.name,
        description: body.description ?? null,
        ownerUserId: body.ownerUserId ?? null,
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        position: nextPos,
    }).returning()
    return row
}

export async function updateClearanceItem(
    tenantId: string,
    exitRequestId: string,
    itemId: string,
    patch: {
        status?: 'pending' | 'in_progress' | 'completed' | 'waived'
        notes?: string
        completedBy?: string | null
    },
) {
    const setPayload: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    if (patch.status === 'completed') {
        setPayload.completedAt = new Date()
    } else if (patch.status === 'pending' || patch.status === 'in_progress') {
        setPayload.completedAt = null
    }
    const [row] = await db.update(exitClearanceItems)
        .set(setPayload)
        .where(and(
            eq(exitClearanceItems.id, itemId),
            eq(exitClearanceItems.tenantId, tenantId),
            eq(exitClearanceItems.exitRequestId, exitRequestId),
        ))
        .returning()
    if (!row) throw new ServiceError(404, 'NOT_FOUND', 'Clearance item not found')

    // If every item is now completed, fire on_clearance_complete workflows
    if (patch.status === 'completed') {
        const remaining = await db.select({ id: exitClearanceItems.id }).from(exitClearanceItems)
            .where(and(
                eq(exitClearanceItems.tenantId, tenantId),
                eq(exitClearanceItems.exitRequestId, exitRequestId),
                inArray(exitClearanceItems.status, ['pending', 'in_progress']),
            ))
        if (remaining.length === 0) {
            await fireWorkflows(tenantId, 'on_clearance_complete', { exitRequestId }).catch((e) => {
                log.warn({ err: e instanceof Error ? e.message : String(e) }, 'fireWorkflows(on_clearance_complete) failed')
            })
        }
    }
    return row
}

// ─── Interview answers ──────────────────────────────────────────────────────

export async function listInterviewResponses(tenantId: string, exitRequestId: string) {
    return db.select().from(exitInterviewResponses)
        .where(and(
            eq(exitInterviewResponses.tenantId, tenantId),
            eq(exitInterviewResponses.exitRequestId, exitRequestId),
        ))
}

/**
 * Pure helper (exported for tests): given a question type + a submitted
 * answer payload, decide whether it counts as "answered". A required
 * question that fails this check causes submitInterviewResponses() to 400
 * and stops the readiness gate from flipping to canApprove=true.
 *
 * Semantics, per type:
 *   short_text / long_text — non-blank `answerText`
 *   rating                  — `answerValue` is a number, or `answerText` parses to one
 *   yes_no                  — `answerValue` is boolean, OR text is "yes"/"no"
 *   single_choice           — non-empty string (text or value)
 *   multi_choice            — `answerValue` is a non-empty array
 */
export function isAnswerNonEmpty(
    type: 'short_text' | 'long_text' | 'rating' | 'single_choice' | 'multi_choice' | 'yes_no',
    a: { answerText?: string | null; answerValue?: unknown } | undefined,
): boolean {
    if (!a) return false
    if (type === 'short_text' || type === 'long_text') {
        return typeof a.answerText === 'string' && a.answerText.trim().length > 0
    }
    if (type === 'rating') {
        if (typeof a.answerValue === 'number') return Number.isFinite(a.answerValue) && a.answerValue > 0
        const parsed = Number(a.answerText ?? '')
        return Number.isFinite(parsed) && parsed > 0
    }
    if (type === 'yes_no') {
        if (typeof a.answerValue === 'boolean') return true
        const raw = (a.answerText ?? '').toString().toLowerCase()
        return raw === 'yes' || raw === 'no' || raw === 'true' || raw === 'false'
    }
    if (type === 'single_choice') {
        if (typeof a.answerValue === 'string') return a.answerValue.length > 0
        return typeof a.answerText === 'string' && a.answerText.length > 0
    }
    // multi_choice
    return Array.isArray(a.answerValue) && a.answerValue.length > 0
}

export async function submitInterviewResponses(
    tenantId: string,
    exitRequestId: string,
    answers: Array<{ questionId: string; questionSnapshot: string; answerText?: string; answerValue?: unknown }>,
) {
    if (answers.length === 0) return []
    // Filter answers to questionIds that belong to THIS tenant. Without this
    // check a tenant-A caller could post a tenant-B question UUID and the
    // foreign key (`ON DELETE SET NULL`) would silently accept it — the
    // resulting row would carry tenantId=A but questionId=B, a cross-tenant
    // data confusion. Belt and braces alongside the route-level exit-request
    // tenant check.
    const questionIds = Array.from(new Set(answers.map(a => a.questionId)))
    const ownedQuestions = await db
        .select({
            id: offboardingInterviewQuestions.id,
            questionType: offboardingInterviewQuestions.questionType,
            required: offboardingInterviewQuestions.required,
            isActive: offboardingInterviewQuestions.isActive,
            questionText: offboardingInterviewQuestions.questionText,
        })
        .from(offboardingInterviewQuestions)
        .where(and(
            eq(offboardingInterviewQuestions.tenantId, tenantId),
            inArray(offboardingInterviewQuestions.id, questionIds),
        ))
    const ownedSet = new Set(ownedQuestions.map(q => q.id))
    const filtered = answers.filter(a => ownedSet.has(a.questionId))
    if (filtered.length === 0) return []

    // Server-side enforcement: every ACTIVE REQUIRED question that the
    // tenant has configured must have a non-empty answer in this batch.
    // Without this gate, a hand-rolled curl could POST `{ answers: [] }`
    // and the readiness check would mistakenly flip to canApprove=true.
    const allActiveRequired = await db
        .select({
            id: offboardingInterviewQuestions.id,
            questionType: offboardingInterviewQuestions.questionType,
            questionText: offboardingInterviewQuestions.questionText,
        })
        .from(offboardingInterviewQuestions)
        .where(and(
            eq(offboardingInterviewQuestions.tenantId, tenantId),
            eq(offboardingInterviewQuestions.isActive, true),
            eq(offboardingInterviewQuestions.required, true),
        ))
    const answerByQid = new Map(filtered.map(a => [a.questionId, a]))
    const missing = allActiveRequired
        .filter(q => !isAnswerNonEmpty(q.questionType, answerByQid.get(q.id)))
        .map(q => q.questionText)
    if (missing.length > 0) {
        throw new ServiceError(
            400,
            'REQUIRED_MISSING',
            `Please answer every required question before submitting. Missing: ${missing.slice(0, 3).join('; ')}${missing.length > 3 ? `; +${missing.length - 3} more` : ''}.`,
        )
    }

    // Wipe prior answers then re-insert — simpler than reconciling and the
    // unique (exit_request_id, question_id) constraint would block re-submits.
    await db.delete(exitInterviewResponses).where(and(
        eq(exitInterviewResponses.tenantId, tenantId),
        eq(exitInterviewResponses.exitRequestId, exitRequestId),
    ))
    const rows = await db.insert(exitInterviewResponses).values(filtered.map(a => ({
        tenantId,
        exitRequestId,
        questionId: a.questionId,
        questionSnapshot: a.questionSnapshot,
        answerText: a.answerText,
        answerValue: (a.answerValue ?? null) as unknown,
    }))).returning()
    return rows
}

// ─── Workflow firing ────────────────────────────────────────────────────────

interface WorkflowContext {
    exitRequestId: string
    /** Pass-through to avoid an extra `getSettings()` query during exit
     *  creation. Optional — falls back to a fresh read when omitted. */
    prefetchedSettings?: Awaited<ReturnType<typeof getSettings>>
}

/**
 * Find enabled workflows for a trigger and execute them. Email + in-app
 * notifications are sent; custom_function rows are stored but NOT executed
 * (the sandboxed runtime is not implemented in this revision).
 *
 * Errors are swallowed per-workflow so one failure doesn't block the rest.
 */
export async function fireWorkflows(
    tenantId: string,
    trigger: WorkflowTrigger,
    ctx: WorkflowContext,
): Promise<void> {
    // Look up workflows + settings + exit context concurrently — they don't
    // depend on each other. Settings is reused if the caller already loaded
    // it (saving one round trip per fireWorkflows() call).
    const [list, settings, ctxRow] = await Promise.all([
        db.select().from(offboardingWorkflows).where(and(
            eq(offboardingWorkflows.tenantId, tenantId),
            eq(offboardingWorkflows.trigger, trigger),
            eq(offboardingWorkflows.enabled, true),
        )),
        ctx.prefetchedSettings
            ? Promise.resolve(ctx.prefetchedSettings)
            : getSettings(tenantId),
        db.select({
            exitId: exitRequests.id,
            employeeId: exitRequests.employeeId,
            exitDate: exitRequests.exitDate,
            lastWorkingDay: exitRequests.lastWorkingDay,
            exitType: exitRequests.exitType,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            workEmail: employees.workEmail,
            employeeNo: employees.employeeNo,
            reportingTo: employees.reportingTo,
        }).from(exitRequests)
            .leftJoin(employees, eq(employees.id, exitRequests.employeeId))
            .where(and(eq(exitRequests.id, ctx.exitRequestId), eq(exitRequests.tenantId, tenantId)))
            .limit(1)
            .then(rows => rows[0]),
    ])
    if (list.length === 0) return
    if (!ctxRow) return
    let managerEmail: string | null = null
    let managerUserId: string | null = null
    if (ctxRow.reportingTo) {
        const [m] = await db.select({
            email: employees.email,
            workEmail: employees.workEmail,
            userId: users.id,
        }).from(employees)
            .leftJoin(users, and(eq(users.tenantId, tenantId), eq(users.employeeId, employees.id)))
            .where(and(eq(employees.id, ctxRow.reportingTo), eq(employees.tenantId, tenantId)))
            .limit(1)
        managerEmail = m?.workEmail || m?.email || null
        managerUserId = m?.userId ?? null
    }
    const hrPartnerIds = settings.hrPartnerUserIds ?? []
    let hrPartnerEmails: string[] = []
    if (hrPartnerIds.length > 0) {
        const rows = await db.select({ email: users.email }).from(users)
            .where(and(eq(users.tenantId, tenantId), inArray(users.id, hrPartnerIds)))
        hrPartnerEmails = rows.map(r => r.email).filter((e): e is string => !!e)
    }
    const employeeEmail = ctxRow.workEmail || ctxRow.email || null
    const employeeName = `${ctxRow.firstName ?? ''} ${ctxRow.lastName ?? ''}`.trim()

    // Sign one exit-interview token per fireWorkflows() call. We only build
    // the URL when a workflow body actually references {{interviewLink}}, so
    // the signing cost is negligible (HMAC-SHA256 is fast). The same link is
    // reused across all workflows fired in this run so the user sees a stable
    // URL if multiple emails go out.
    let interviewLinkCache: string | null = null
    const interviewLink = (): string => {
        if (interviewLinkCache) return interviewLinkCache
        const token = signExitInterviewToken(tenantId, ctx.exitRequestId, ctxRow.employeeId)
        interviewLinkCache = buildExitInterviewLink(token)
        return interviewLinkCache
    }

    // Variable substitution: {{employeeName}}, {{exitDate}}, {{lastWorkingDay}},
    // {{exitType}}, {{employeeNo}}, {{interviewLink}}
    const substitute = (s: string | undefined | null): string => {
        if (!s) return ''
        return s
            .replace(/\{\{employeeName\}\}/g, employeeName)
            .replace(/\{\{employeeNo\}\}/g, ctxRow.employeeNo ?? '')
            .replace(/\{\{exitDate\}\}/g, ctxRow.exitDate ?? '')
            .replace(/\{\{lastWorkingDay\}\}/g, ctxRow.lastWorkingDay ?? '')
            .replace(/\{\{exitType\}\}/g, ctxRow.exitType ?? '')
            .replace(/\{\{interviewLink\}\}/g, interviewLink())
    }

    for (const wf of list) {
        try {
            const cfg = wf.config ?? {}
            if (wf.actionType === 'email_alert') {
                const recipients = new Set<string>()
                const targets = (cfg.recipients ?? []) as Recipient[]
                if (targets.includes('employee') && employeeEmail) recipients.add(employeeEmail)
                if (targets.includes('reporting_manager') && managerEmail) recipients.add(managerEmail)
                if (targets.includes('hr_partner')) hrPartnerEmails.forEach(e => recipients.add(e))
                if (targets.includes('custom')) (cfg.customEmails ?? []).forEach(e => recipients.add(e))
                if (recipients.size === 0) continue
                await sendEmail({
                    to: Array.from(recipients).join(','),
                    subject: substitute(cfg.subject) || `Offboarding update for ${employeeName}`,
                    html: substitute(cfg.body) || `<p>Offboarding update for <strong>${employeeName}</strong>.</p>`,
                    tenantId,
                })
            } else if (wf.actionType === 'notification') {
                const userIds = new Set<string>()
                const targets = (cfg.recipients ?? []) as Recipient[]
                if (targets.includes('reporting_manager') && managerUserId) userIds.add(managerUserId)
                if (targets.includes('hr_partner')) hrPartnerIds.forEach(id => userIds.add(id))
                // 'employee' deliberately needs employee→user lookup; if their
                // user record exists, push to it (otherwise skip silently).
                if (targets.includes('employee')) {
                    const [u] = await db.select({ id: users.id }).from(users)
                        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, ctxRow.employeeId)))
                        .limit(1)
                    if (u?.id) userIds.add(u.id)
                }
                if (userIds.size === 0) continue
                await Promise.all(Array.from(userIds).map(uid => createNotification({
                    tenantId,
                    userId: uid,
                    type: 'info',
                    title: wf.name,
                    message: substitute(cfg.message) || substitute(cfg.body) || `Offboarding update for ${employeeName}`,
                    actionUrl: cfg.actionUrl ?? `/exit`,
                })))
            } else if (wf.actionType === 'custom_function') {
                // Stored for visibility; sandboxed execution is a follow-up.
                log.info({ tenantId, workflowId: wf.id }, 'custom_function workflow skipped (execution not yet implemented)')
            }
        } catch (err) {
            log.warn({ err: err instanceof Error ? err.message : String(err), workflowId: wf.id, trigger }, 'offboarding workflow execution failed')
        }
    }
}
