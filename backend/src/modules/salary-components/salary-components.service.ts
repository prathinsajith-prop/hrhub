/**
 * Salary Components service — CRUD for the tenant-wide catalog of
 * earning / deduction / benefit / correction templates.
 *
 * Per-kind validation lives here (not the route) so the front-end and any
 * future API consumers get the same guarantees. The catalog itself doesn't
 * touch payroll math — payroll_adjustments remains the execution layer.
 */
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
    salaryComponents,
    BENEFIT_CATEGORIES,
    CORRECTION_CATEGORIES,
    DEDUCTION_CATEGORIES,
    EARNING_CATEGORIES,
    SOCIAL_SECURITY_SCHEMES,
    type SalaryComponentKind,
} from '../../db/schema/salary_components.js'

const KIND_CATEGORIES: Record<SalaryComponentKind, readonly string[]> = {
    earning: EARNING_CATEGORIES,
    deduction: DEDUCTION_CATEGORIES,
    benefit: BENEFIT_CATEGORIES,
    correction: CORRECTION_CATEGORIES,
}

const SOCIAL_SCHEME_SET = new Set<string>(SOCIAL_SECURITY_SCHEMES)

/** Dedupe a scheme array while preserving order. Defence in depth — the
 *  toggle UI can't produce duplicates, but a malformed API call could. */
function dedupeSchemes(schemes: string[] | undefined): string[] {
    return Array.from(new Set(schemes ?? []))
}

export interface CreateSalaryComponentInput {
    kind: SalaryComponentKind
    category: string
    name: string
    nameInPayslip: string
    nameInPayslipAr?: string | null
    // Earning-only
    payType?: 'fixed' | 'variable' | null
    calculationType?: 'flat' | 'percentage_of_basic' | null
    amount?: number | string | null
    proRata?: boolean
    applicableSocialSecurity?: string[]
    // Deduction / benefit / correction
    frequency?: 'one_time' | 'recurring' | null
    isActive?: boolean
}

/**
 * Validate the per-kind invariants. Raise on the first violation — keeps the
 * UI's error display tight (one message, not a wall).
 */
function assertValid(input: CreateSalaryComponentInput): void {
    if (!input.name?.trim()) throw fail(400, 'Name is required')
    if (!input.nameInPayslip?.trim()) throw fail(400, 'Payslip name is required')

    const allowed = KIND_CATEGORIES[input.kind]
    if (!allowed) throw fail(400, `Unknown component kind: ${input.kind}`)
    if (!allowed.includes(input.category)) {
        throw fail(400, `Category "${input.category}" is not valid for a ${input.kind}`)
    }

    if (input.kind === 'earning') {
        if (!input.payType) throw fail(400, 'Earnings require a pay type')
        if (!input.calculationType) throw fail(400, 'Earnings require a calculation type')
        if (input.amount != null) {
            const n = Number(input.amount)
            if (!Number.isFinite(n) || n < 0) throw fail(400, 'Amount must be a non-negative number')
            if (input.calculationType === 'percentage_of_basic' && n > 100) {
                throw fail(400, 'Percentage of basic cannot exceed 100')
            }
        }
        // applicable_social_security values must all be known schemes.
        for (const scheme of input.applicableSocialSecurity ?? []) {
            if (!SOCIAL_SCHEME_SET.has(scheme)) {
                throw fail(400, `Unknown social-security scheme: ${scheme}`)
            }
        }
    } else if (input.kind === 'deduction' || input.kind === 'benefit') {
        if (!input.frequency) throw fail(400, `${capitalize(input.kind)}s require a frequency`)
    }
}

function fail(statusCode: number, message: string): Error {
    return Object.assign(new Error(message), { statusCode })
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * List components for a tenant, optionally filtered by kind. Sorted by
 * created_at desc so the most recently-added shows first.
 */
/**
 * List catalog components for a tenant.
 *
 * Pagination is optional — when no `limit` is supplied the caller gets all
 * rows back (small bounded list in practice: <200 components per tenant).
 * The route layer caps `limit` to keep the unbounded case from blowing up
 * for runaway tenants.
 */
export async function listSalaryComponents(
    tenantId: string,
    kind?: SalaryComponentKind,
    opts: { limit?: number; offset?: number } = {},
) {
    const conditions = [eq(salaryComponents.tenantId, tenantId)]
    if (kind) conditions.push(eq(salaryComponents.kind, kind))
    let query = db.select().from(salaryComponents).where(and(...conditions)).orderBy(desc(salaryComponents.createdAt)).$dynamic()
    if (opts.limit !== undefined) {
        query = query.limit(opts.limit)
        if (opts.offset) query = query.offset(opts.offset)
    }
    return query
}

export async function getSalaryComponent(tenantId: string, id: string) {
    const [row] = await db
        .select()
        .from(salaryComponents)
        .where(and(eq(salaryComponents.tenantId, tenantId), eq(salaryComponents.id, id)))
        .limit(1)
    return row ?? null
}

export async function createSalaryComponent(
    tenantId: string,
    input: CreateSalaryComponentInput,
    createdBy: string | null,
) {
    assertValid(input)
    try {
        const [row] = await db
            .insert(salaryComponents)
            .values({
                tenantId,
                kind: input.kind,
                category: input.category,
                name: input.name.trim(),
                nameInPayslip: input.nameInPayslip.trim(),
                nameInPayslipAr: input.nameInPayslipAr?.trim() || null,
                payType: input.kind === 'earning' ? (input.payType ?? null) : null,
                calculationType: input.kind === 'earning' ? (input.calculationType ?? null) : null,
                amount: input.amount != null ? String(input.amount) : null,
                proRata: input.proRata ?? true,
                applicableSocialSecurity: input.kind === 'earning' ? dedupeSchemes(input.applicableSocialSecurity) : [],
                frequency: input.kind === 'deduction' || input.kind === 'benefit' ? (input.frequency ?? null) : null,
                isActive: input.isActive ?? true,
                createdBy,
            })
            .returning()
        return row
    } catch (err: any) {
        // unique_violation
        if (err?.code === '23505') {
            throw fail(409, `A ${input.kind} called "${input.name}" already exists in this tenant.`)
        }
        throw err
    }
}

export async function updateSalaryComponent(
    tenantId: string,
    id: string,
    patch: Partial<CreateSalaryComponentInput>,
) {
    // Re-validate the merged shape so partial updates can't break invariants.
    const existing = await getSalaryComponent(tenantId, id)
    if (!existing) return null
    const merged: CreateSalaryComponentInput = {
        kind: existing.kind,
        category: patch.category ?? existing.category,
        name: patch.name ?? existing.name,
        nameInPayslip: patch.nameInPayslip ?? existing.nameInPayslip,
        nameInPayslipAr: patch.nameInPayslipAr ?? existing.nameInPayslipAr,
        payType: patch.payType ?? existing.payType,
        calculationType: patch.calculationType ?? existing.calculationType,
        amount: patch.amount ?? existing.amount,
        proRata: patch.proRata ?? existing.proRata,
        applicableSocialSecurity: patch.applicableSocialSecurity ?? existing.applicableSocialSecurity,
        frequency: patch.frequency ?? existing.frequency,
        isActive: patch.isActive ?? existing.isActive,
    }
    assertValid(merged)

    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.category !== undefined) set.category = merged.category
    if (patch.name !== undefined) set.name = merged.name.trim()
    if (patch.nameInPayslip !== undefined) set.nameInPayslip = merged.nameInPayslip.trim()
    if (patch.nameInPayslipAr !== undefined) set.nameInPayslipAr = merged.nameInPayslipAr?.trim() || null
    if (patch.payType !== undefined) set.payType = existing.kind === 'earning' ? merged.payType : null
    if (patch.calculationType !== undefined) set.calculationType = existing.kind === 'earning' ? merged.calculationType : null
    if (patch.amount !== undefined) set.amount = merged.amount != null ? String(merged.amount) : null
    if (patch.proRata !== undefined) set.proRata = merged.proRata
    if (patch.applicableSocialSecurity !== undefined) {
        set.applicableSocialSecurity = existing.kind === 'earning' ? dedupeSchemes(merged.applicableSocialSecurity) : []
    }
    if (patch.frequency !== undefined) set.frequency = (existing.kind === 'deduction' || existing.kind === 'benefit') ? merged.frequency : null
    if (patch.isActive !== undefined) set.isActive = merged.isActive

    const [row] = await db
        .update(salaryComponents)
        .set(set as any)
        .where(and(eq(salaryComponents.tenantId, tenantId), eq(salaryComponents.id, id)))
        .returning()
    return row ?? null
}

/**
 * Delete a component. System rows (is_system = true) are protected — those
 * are seeded essentials like "Basic" earning that payroll depends on.
 */
export async function deleteSalaryComponent(tenantId: string, id: string) {
    const [row] = await db
        .delete(salaryComponents)
        .where(and(
            eq(salaryComponents.tenantId, tenantId),
            eq(salaryComponents.id, id),
            eq(salaryComponents.isSystem, false),
        ))
        .returning()
    return row ?? null
}
