import { eq, and, desc, isNull, sql, getTableColumns, or, lt, gte, lte } from 'drizzle-orm'
import { withTimestamp, encodeCursor, decodeCursor } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { visaApplications, employees, visaStepHistory, visaCosts } from '../../db/schema/index.js'
import { cacheDel } from '../../lib/redis.js'
import { VISA_STEP_LABELS, visaStepLabel } from './visa.constants.js'
import { addVisaCost, type CreateCostInput } from './visa_costs.service.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewVisa = InferInsertModel<typeof visaApplications>

export async function listVisas(tenantId: string, params: { status?: string; urgencyLevel?: string; from?: string; to?: string; limit: number; offset: number; after?: string }) {
    const { status, urgencyLevel, from, to, limit, offset, after } = params
    const conditions = [eq(visaApplications.tenantId, tenantId), isNull(visaApplications.deletedAt)]
    if (status) conditions.push(eq(visaApplications.status, status as never))
    if (urgencyLevel) conditions.push(eq(visaApplications.urgencyLevel, urgencyLevel as never))
    // Calendar uses expiryDate as the event date; filter by [from, to] when provided.
    if (from) conditions.push(gte(visaApplications.expiryDate, from))
    if (to) conditions.push(lte(visaApplications.expiryDate, to))

    const cursor = after ? decodeCursor(after) : null
    if (cursor) {
        const cursorDate = new Date(cursor.c)
        conditions.push(
            or(
                lt(visaApplications.createdAt, cursorDate),
                and(eq(visaApplications.createdAt, cursorDate), lt(visaApplications.id, cursor.i))
            )!
        )
    }

    const pageSize = limit + 1
    const rows = await db.select({
        ...getTableColumns(visaApplications),
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '')`.as('employee_name'),
        employeeNo: employees.employeeNo,
        employeeAvatarUrl: employees.avatarUrl,
        employeeDepartment: employees.department,
    })
        .from(visaApplications)
        .leftJoin(employees, eq(employees.id, visaApplications.employeeId))
        .where(and(...conditions))
        .orderBy(desc(visaApplications.createdAt), desc(visaApplications.id))
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
            .from(visaApplications)
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

export async function getVisa(tenantId: string, id: string) {
    const [row] = await db.select({
        ...getTableColumns(visaApplications),
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '')`.as('employee_name'),
        employeeNo: employees.employeeNo,
        employeeAvatarUrl: employees.avatarUrl,
        employeeDepartment: employees.department,
    })
        .from(visaApplications)
        .leftJoin(employees, eq(employees.id, visaApplications.employeeId))
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId), isNull(visaApplications.deletedAt)))
        .limit(1)
    return row ?? null
}

export async function softDeleteVisa(tenantId: string, id: string) {
    const [row] = await db.update(visaApplications)
        .set(withTimestamp({ deletedAt: new Date() }))
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId), isNull(visaApplications.deletedAt)))
        .returning()
    return row ?? null
}

const TERMINAL_VISA_STATUSES = ['cancelled', 'expired'] as const

export async function createVisa(tenantId: string, data: Omit<NewVisa, 'tenantId' | 'id'>) {
    // Block creating a new application when a non-terminal one already exists for
    // this employee + visa type combination.
    const [existing] = await db
        .select({ id: visaApplications.id, status: visaApplications.status })
        .from(visaApplications)
        .where(and(
            eq(visaApplications.tenantId, tenantId),
            eq(visaApplications.employeeId, data.employeeId),
            eq(visaApplications.visaType, data.visaType as never),
        ))
        .limit(1)

    if (existing && !(TERMINAL_VISA_STATUSES as readonly string[]).includes(existing.status)) {
        throw Object.assign(
            new Error(`A ${data.visaType} visa application is already in progress for this employee. Cancel or complete it before creating a new one.`),
            { statusCode: 409, name: 'Conflict' },
        )
    }

    const [row] = await db.insert(visaApplications).values({ ...data, tenantId }).returning()
    // Invalidate dashboard KPI cache so activeVisas count refreshes (P1-05)
    await cacheDel(`dashboard:kpis:${tenantId}`)
    return row
}

export async function updateVisa(tenantId: string, id: string, data: Partial<NewVisa>) {
    const [row] = await db.update(visaApplications)
        .set(withTimestamp(data))
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId)))
        .returning()
    return row ?? null
}

/**
 * Step → Status mapping for the standard 8-step UAE work-visa workflow.
 * Step labels live in `visa.constants.ts` and are shared with the frontend.
 */
const STEP_TO_STATUS: Record<number, 'entry_permit' | 'medical_pending' | 'eid_pending' | 'stamping' | 'active'> = {
    1: 'entry_permit',
    2: 'entry_permit',
    3: 'entry_permit',
    4: 'medical_pending',
    5: 'eid_pending',
    6: 'stamping',
    7: 'stamping',
    8: 'active',
}

export interface AdvanceContext {
    userId?: string
    userName?: string
    userRole?: string
    notes?: string
}

export interface AdvanceResult {
    visa: typeof visaApplications.$inferSelect
    fromStep: number
    toStep: number
    fromStepLabel: string
    toStepLabel: string
    fromStatus: string
    toStatus: string
    historyId: string | null
    advanced: boolean
}

/**
 * Advance the visa to the next step and append a `visa_step_history` row
 * capturing the transition. `costsTotal` / `costsCount` may be supplied when
 * costs were recorded as part of this transition (see `advanceVisaStepWithCosts`).
 */
export async function advanceVisaStep(
    tenantId: string,
    id: string,
    ctx: AdvanceContext = {},
    costsSummary: { total: number; count: number } = { total: 0, count: 0 },
): Promise<AdvanceResult | null> {
    const visa = await getVisa(tenantId, id)
    if (!visa) return null

    const fromStep = visa.currentStep
    const fromStatus = visa.status
    const fromStepLabel = visaStepLabel(fromStep)

    // Don't advance terminal states or beyond the final step — return the
    // visa unchanged so the caller can react.
    const noop = visa.status === 'cancelled'
        || visa.status === 'expired'
        || visa.currentStep >= visa.totalSteps

    if (noop) {
        return {
            visa,
            fromStep,
            toStep: fromStep,
            fromStepLabel,
            toStepLabel: fromStepLabel,
            fromStatus,
            toStatus: fromStatus,
            historyId: null,
            advanced: false,
        }
    }

    const toStep = fromStep + 1
    const toStatus = STEP_TO_STATUS[toStep] ?? fromStatus
    const toStepLabel = visaStepLabel(toStep)

    const [updated] = await db.update(visaApplications)
        .set(withTimestamp({ currentStep: toStep, status: toStatus }))
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId)))
        .returning()

    const [historyRow] = await db.insert(visaStepHistory).values({
        tenantId,
        visaApplicationId: id,
        fromStep,
        toStep,
        fromStepLabel,
        toStepLabel,
        fromStatus,
        toStatus,
        costsTotal: String(costsSummary.total ?? 0),
        costsCount: costsSummary.count ?? 0,
        notes: ctx.notes ?? null,
        advancedBy: ctx.userId ?? null,
        advancedByName: ctx.userName ?? null,
        advancedByRole: ctx.userRole ?? null,
    }).returning({ id: visaStepHistory.id })

    return {
        visa: updated,
        fromStep,
        toStep,
        fromStepLabel,
        toStepLabel,
        fromStatus,
        toStatus,
        historyId: historyRow?.id ?? null,
        advanced: true,
    }
}

/**
 * Atomic: persist any provided costs against the *current* step of the visa,
 * then advance to the next step writing the totals into the step history row.
 * Costs are tagged with the step they were incurred in (i.e. the step *being
 * completed*, not the step being entered).
 */
export async function advanceVisaStepWithCosts(
    tenantId: string,
    id: string,
    costs: Array<Omit<CreateCostInput, 'visaApplicationId' | 'stepNumber' | 'stepLabel'>>,
    ctx: AdvanceContext = {},
): Promise<{ result: AdvanceResult | null; savedCosts: Array<typeof visaCosts.$inferSelect> }> {
    const visa = await getVisa(tenantId, id)
    if (!visa) return { result: null, savedCosts: [] }

    const stepNumber = visa.currentStep
    const stepLabel = visaStepLabel(stepNumber)

    const savedCosts: Array<typeof visaCosts.$inferSelect> = []
    let total = 0
    for (const c of costs) {
        const saved = await addVisaCost(tenantId, {
            ...c,
            visaApplicationId: id,
            stepNumber,
            stepLabel,
            createdBy: ctx.userId,
        })
        if (saved) {
            savedCosts.push(saved)
            total += Number(saved.amount)
        }
    }

    const result = await advanceVisaStep(tenantId, id, ctx, { total, count: savedCosts.length })
    return { result, savedCosts }
}

export async function listVisaStepHistory(tenantId: string, visaApplicationId: string) {
    return db
        .select()
        .from(visaStepHistory)
        .where(and(
            eq(visaStepHistory.tenantId, tenantId),
            eq(visaStepHistory.visaApplicationId, visaApplicationId),
        ))
        .orderBy(desc(visaStepHistory.createdAt))
}

export { VISA_STEP_LABELS }

export async function cancelVisa(tenantId: string, id: string, reason?: string) {
    const visa = await getVisa(tenantId, id)
    if (!visa) return null
    if (visa.status === 'cancelled') return visa

    // Preserve existing notes; append a cancellation note if a reason was supplied.
    const cancellationNote = reason?.trim()
        ? `[Cancelled ${new Date().toISOString().slice(0, 10)}] ${reason.trim()}`
        : null
    const mergedNotes = cancellationNote
        ? (visa.notes ? `${visa.notes}\n${cancellationNote}` : cancellationNote)
        : visa.notes

    const [row] = await db.update(visaApplications)
        .set(withTimestamp({ status: 'cancelled' as const, notes: mergedNotes }))
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId), isNull(visaApplications.deletedAt)))
        .returning()
    if (row) await cacheDel(`dashboard:kpis:${tenantId}`)
    return row ?? null
}

/**
 * Derives urgency level purely from expiry date (no side-effects).
 * critical  → expires within 30 days or already expired
 * urgent    → expires in 31-90 days
 * normal    → expires in >90 days or no expiry date set
 */
export function calcUrgencyLevel(expiryDate: string | null | undefined): 'normal' | 'urgent' | 'critical' {
    if (!expiryDate) return 'normal'
    const today = new Date()
    const expiry = new Date(expiryDate)
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysLeft <= 30) return 'critical'
    if (daysLeft <= 90) return 'urgent'
    return 'normal'
}

/**
 * Recalculates and persists urgency_level for all active visa applications
 * belonging to a tenant. Returns the number of records updated.
 */
export async function recalcVisaUrgency(tenantId: string): Promise<{ updated: number }> {
    const active = await db.select({
        id: visaApplications.id,
        expiryDate: visaApplications.expiryDate,
        currentUrgency: visaApplications.urgencyLevel,
        status: visaApplications.status,
    })
        .from(visaApplications)
        .where(and(
            eq(visaApplications.tenantId, tenantId),
            isNull(visaApplications.deletedAt),
        ))

    let updated = 0
    for (const visa of active) {
        // Don't touch cancelled / expired applications
        if (visa.status === 'cancelled' || visa.status === 'expired') continue

        const newUrgency = calcUrgencyLevel(visa.expiryDate)
        const newStatus = newUrgency === 'critical' && visa.expiryDate
            ? (new Date(visa.expiryDate) < new Date() ? 'expired' : 'expiring_soon')
            : undefined

        if (newUrgency !== visa.currentUrgency || newStatus) {
            await db.update(visaApplications)
                .set(withTimestamp({
                    urgencyLevel: newUrgency,
                    ...(newStatus ? { status: newStatus } : {}),
                }))
                .where(eq(visaApplications.id, visa.id))
            updated++
        }
    }

    return { updated }
}
