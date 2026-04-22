import { eq, and, desc, isNull, sql, getTableColumns } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { visaApplications } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewVisa = InferInsertModel<typeof visaApplications>

export async function listVisas(tenantId: string, params: { status?: string; urgencyLevel?: string; limit: number; offset: number }) {
    const { status, urgencyLevel, limit, offset } = params
    const conditions = [eq(visaApplications.tenantId, tenantId), isNull(visaApplications.deletedAt)]
    if (status) conditions.push(eq(visaApplications.status, status as never))
    if (urgencyLevel) conditions.push(eq(visaApplications.urgencyLevel, urgencyLevel as never))

    const rows = await db.select({ ...getTableColumns(visaApplications), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(visaApplications)
        .where(and(...conditions))
        .orderBy(desc(visaApplications.updatedAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return { data: rows, total, limit, offset, hasMore: offset + limit < total }
}

export async function getVisa(tenantId: string, id: string) {
    const [row] = await db.select().from(visaApplications)
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

export async function createVisa(tenantId: string, data: Omit<NewVisa, 'tenantId' | 'id'>) {
    const [row] = await db.insert(visaApplications).values({ ...data, tenantId }).returning()
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
 * Keep in sync with `visaSteps` in the frontend (VisaPage / VisaDetailPage).
 *   1 Entry Permit Application
 *   2 Entry Permit Approval
 *   3 Employee Entry to UAE
 *   4 Medical Fitness Test
 *   5 Emirates ID Biometrics
 *   6 Visa Stamping
 *   7 Labour Card Issuance
 *   8 Completion
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

export async function advanceVisaStep(tenantId: string, id: string) {
    const visa = await getVisa(tenantId, id)
    if (!visa) return null

    // Don't advance terminal states.
    if (visa.status === 'cancelled' || visa.status === 'expired') return visa
    if (visa.currentStep >= visa.totalSteps) return visa

    const newStep = visa.currentStep + 1
    const mappedStatus = STEP_TO_STATUS[newStep] ?? visa.status

    const [row] = await db.update(visaApplications)
        .set(withTimestamp({ currentStep: newStep, status: mappedStatus }))
        .where(and(eq(visaApplications.id, id), eq(visaApplications.tenantId, tenantId)))
        .returning()

    return row
}

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
