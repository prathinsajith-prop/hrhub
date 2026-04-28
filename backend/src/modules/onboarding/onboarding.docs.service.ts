/**
 * Onboarding required-documents + upload tokens service.
 * Keeps the original onboarding.service.ts focused on checklists/steps.
 */
import { and, eq, isNull, inArray, gt, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { log } from '../../lib/logger.js'
import {
    onboardingStepRequiredDocs,
    onboardingSteps,
    onboardingChecklists,
    onboardingUploadTokens,
    documents,
    documentAuditLog,
    employees,
    tenants,
} from '../../db/schema/index.js'

// ─── Default required-docs templates per step keyword ────────────────────────
// Mirrors the suggestions in onboarding.routes.ts but with mandatory flag.
export const REQUIRED_DOC_TEMPLATES: Record<string, Array<{
    category: string; docType: string; expiryRequired: boolean; isMandatory: boolean; hint?: string
}>> = {
    'hr documentation': [
        { category: 'employment', docType: 'Signed Employment Contract', expiryRequired: false, isMandatory: true, hint: 'Both pages, signed and dated.' },
        { category: 'employment', docType: 'Offer Letter', expiryRequired: false, isMandatory: true },
    ],
    'identity': [
        { category: 'identity', docType: 'Passport', expiryRequired: true, isMandatory: true, hint: 'Photo page; must be valid for at least 6 months.' },
        { category: 'identity', docType: 'Emirates ID', expiryRequired: true, isMandatory: true, hint: 'Both sides; clear scan or photo.' },
        { category: 'identity', docType: 'Passport-size Photograph', expiryRequired: false, isMandatory: false },
    ],
    'visa': [
        { category: 'visa', docType: 'Residence Visa', expiryRequired: true, isMandatory: true },
        { category: 'visa', docType: 'Labour Card', expiryRequired: true, isMandatory: false },
    ],
    'benefits enrollment': [
        { category: 'financial', docType: 'Bank Account Letter / IBAN', expiryRequired: false, isMandatory: true, hint: 'Letter from your bank confirming IBAN.' },
        { category: 'insurance', docType: 'Health Insurance Card', expiryRequired: true, isMandatory: false },
    ],
    'compliance': [
        { category: 'compliance', docType: 'MOHRE Acknowledgement', expiryRequired: true, isMandatory: false },
    ],
    'qualification': [
        { category: 'qualification', docType: 'Highest Degree Certificate', expiryRequired: false, isMandatory: true, hint: 'Attested copy preferred.' },
        { category: 'qualification', docType: 'Experience Letters', expiryRequired: false, isMandatory: false },
    ],
}

export function defaultRequiredDocsForStep(title: string) {
    const lower = title.toLowerCase()
    for (const [key, docs] of Object.entries(REQUIRED_DOC_TEMPLATES)) {
        if (lower.includes(key)) return docs
    }
    return []
}

// ─── Required-docs CRUD ──────────────────────────────────────────────────────
export async function listRequiredDocs(tenantId: string, stepId: string) {
    return await db
        .select()
        .from(onboardingStepRequiredDocs)
        .where(and(
            eq(onboardingStepRequiredDocs.tenantId, tenantId),
            eq(onboardingStepRequiredDocs.stepId, stepId),
        ))
        .orderBy(onboardingStepRequiredDocs.sortOrder, onboardingStepRequiredDocs.docType)
}

export async function addRequiredDoc(tenantId: string, stepId: string, data: {
    category: string; docType: string; expiryRequired?: boolean; isMandatory?: boolean; hint?: string; sortOrder?: number
}) {
    // Verify step belongs to tenant
    const [step] = await db
        .select({ id: onboardingSteps.id })
        .from(onboardingSteps)
        .innerJoin(onboardingChecklists, eq(onboardingChecklists.id, onboardingSteps.checklistId))
        .where(and(eq(onboardingSteps.id, stepId), eq(onboardingChecklists.tenantId, tenantId)))
        .limit(1)
    if (!step) return null

    const [row] = await db.insert(onboardingStepRequiredDocs).values({
        tenantId,
        stepId,
        category: data.category as any,
        docType: data.docType,
        expiryRequired: data.expiryRequired ?? false,
        isMandatory: data.isMandatory ?? true,
        hint: data.hint,
        sortOrder: data.sortOrder ?? 0,
    }).returning()
    return row
}

export async function deleteRequiredDoc(tenantId: string, requiredDocId: string) {
    const [deleted] = await db.delete(onboardingStepRequiredDocs)
        .where(and(
            eq(onboardingStepRequiredDocs.id, requiredDocId),
            eq(onboardingStepRequiredDocs.tenantId, tenantId),
        ))
        .returning()
    return deleted ?? null
}

export async function seedRequiredDocsFromTemplate(tenantId: string, checklistId: string) {
    // For every step in this checklist that has no required-docs yet, seed defaults.
    const steps = await db.select().from(onboardingSteps)
        .where(eq(onboardingSteps.checklistId, checklistId))
    if (steps.length === 0) return { seeded: 0 }

    const stepIds = steps.map(s => s.id)
    const existing = await db.select({ stepId: onboardingStepRequiredDocs.stepId })
        .from(onboardingStepRequiredDocs)
        .where(inArray(onboardingStepRequiredDocs.stepId, stepIds))
    const stepsWithReqs = new Set(existing.map(r => r.stepId))

    const rows: Array<typeof onboardingStepRequiredDocs.$inferInsert> = []
    for (const step of steps) {
        if (stepsWithReqs.has(step.id)) continue
        const defaults = defaultRequiredDocsForStep(step.title)
        let order = 0
        for (const d of defaults) {
            rows.push({
                tenantId,
                stepId: step.id,
                category: d.category as any,
                docType: d.docType,
                expiryRequired: d.expiryRequired,
                isMandatory: d.isMandatory,
                hint: d.hint,
                sortOrder: order++,
            })
        }
    }
    if (rows.length === 0) return { seeded: 0 }
    await db.insert(onboardingStepRequiredDocs).values(rows)
    return { seeded: rows.length }
}

// ─── Per-step doc summary (uploaded vs required) ─────────────────────────────
export async function getStepDocSummary(tenantId: string, checklistId: string) {
    const [checklist] = await db.select({ employeeId: onboardingChecklists.employeeId })
        .from(onboardingChecklists)
        .where(and(eq(onboardingChecklists.id, checklistId), eq(onboardingChecklists.tenantId, tenantId)))
        .limit(1)
    if (!checklist) return null

    const steps = await db.select().from(onboardingSteps)
        .where(eq(onboardingSteps.checklistId, checklistId))
        .orderBy(onboardingSteps.stepOrder)
    if (steps.length === 0) return { steps: [] }

    const stepIds = steps.map(s => s.id)
    const requiredRows = await db.select().from(onboardingStepRequiredDocs)
        .where(inArray(onboardingStepRequiredDocs.stepId, stepIds))
    const docRows = await db.select().from(documents)
        .where(and(
            eq(documents.tenantId, tenantId),
            eq(documents.employeeId, checklist.employeeId),
            isNull(documents.deletedAt),
        ))

    const reqsByStep = new Map<string, typeof requiredRows>()
    for (const r of requiredRows) {
        const arr = reqsByStep.get(r.stepId) ?? []
        arr.push(r)
        reqsByStep.set(r.stepId, arr)
    }
    const docsByStep = new Map<string, typeof docRows>()
    for (const d of docRows) {
        if (!d.stepId) continue
        const arr = docsByStep.get(d.stepId) ?? []
        arr.push(d)
        docsByStep.set(d.stepId, arr)
    }

    return {
        steps: steps.map(s => {
            const reqs = reqsByStep.get(s.id) ?? []
            const docs = docsByStep.get(s.id) ?? []
            const requiredMandatory = reqs.filter(r => r.isMandatory)
            const fulfilled = requiredMandatory.filter(r =>
                docs.some(d => d.docType === r.docType && d.category === r.category && d.status !== 'rejected'),
            )
            return {
                step: s,
                required: reqs,
                uploaded: docs,
                completion: requiredMandatory.length === 0 ? 100 : Math.round((fulfilled.length / requiredMandatory.length) * 100),
                missingMandatory: requiredMandatory
                    .filter(r => !docs.some(d => d.docType === r.docType && d.category === r.category && d.status !== 'rejected'))
                    .map(r => ({ category: r.category, docType: r.docType, expiryRequired: r.expiryRequired })),
            }
        }),
    }
}

// ─── Upload tokens (DB-backed for revocability) ──────────────────────────────
export interface IssueTokenInput {
    tenantId: string
    checklistId: string
    employeeId: string
    issuedBy: string
    issuedToEmail: string
    expiresInDays: number
}

export async function issueUploadToken(input: IssueTokenInput) {
    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 3600 * 1000)
    const [row] = await db.insert(onboardingUploadTokens).values({
        tenantId: input.tenantId,
        checklistId: input.checklistId,
        employeeId: input.employeeId,
        issuedBy: input.issuedBy,
        issuedToEmail: input.issuedToEmail,
        expiresAt,
    }).returning()
    return row
}

export async function listUploadTokens(tenantId: string, checklistId: string) {
    return await db.select().from(onboardingUploadTokens)
        .where(and(
            eq(onboardingUploadTokens.tenantId, tenantId),
            eq(onboardingUploadTokens.checklistId, checklistId),
        ))
        .orderBy(onboardingUploadTokens.createdAt)
}

export async function revokeUploadToken(tenantId: string, tokenId: string, revokedBy: string) {
    const [row] = await db.update(onboardingUploadTokens)
        .set({ revokedAt: new Date(), revokedBy })
        .where(and(
            eq(onboardingUploadTokens.id, tokenId),
            eq(onboardingUploadTokens.tenantId, tenantId),
            isNull(onboardingUploadTokens.revokedAt),
        ))
        .returning()
    return row ?? null
}

/**
 * Validate a token jti against the DB. Increments view/upload counters.
 * Returns null if token does not exist, was revoked, or has expired.
 */
export async function validateUploadToken(tokenId: string, opts?: { ip?: string; mode?: 'view' | 'upload' }) {
    const now = new Date()
    const [row] = await db.select().from(onboardingUploadTokens)
        .where(and(
            eq(onboardingUploadTokens.id, tokenId),
            isNull(onboardingUploadTokens.revokedAt),
            gt(onboardingUploadTokens.expiresAt, now),
        ))
        .limit(1)
    if (!row) return null

    // Best-effort counter bump
    const patch: Record<string, unknown> = {
        lastUsedAt: now,
        lastUsedIp: opts?.ip,
    }
    if (opts?.mode === 'view') patch.viewCount = sql`${onboardingUploadTokens.viewCount} + 1`
    if (opts?.mode === 'upload') patch.uploadCount = sql`${onboardingUploadTokens.uploadCount} + 1`
    await db.update(onboardingUploadTokens).set(patch).where(eq(onboardingUploadTokens.id, tokenId))

    return row
}

// ─── Document audit log helper ───────────────────────────────────────────────
export async function logDocumentAction(input: {
    tenantId: string
    documentId: string
    action: 'uploaded' | 'viewed' | 'downloaded' | 'verified' | 'rejected' | 'deleted' | 'status_changed' | 'metadata_updated'
    actorId?: string | null
    actorLabel?: string | null
    details?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
}) {
    try {
        await db.insert(documentAuditLog).values({
            tenantId: input.tenantId,
            documentId: input.documentId,
            action: input.action,
            actorId: input.actorId ?? null,
            actorLabel: input.actorLabel ?? null,
            details: input.details as any,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
        })
    } catch (e) {
        // Audit log must never break primary flow
        log.error({ err: e }, 'doc-audit: failed to write log entry')
    }
}

export async function getDocumentAuditLog(tenantId: string, documentId: string) {
    return await db.select().from(documentAuditLog)
        .where(and(
            eq(documentAuditLog.tenantId, tenantId),
            eq(documentAuditLog.documentId, documentId),
        ))
        .orderBy(sql`${documentAuditLog.createdAt} DESC`)
        .limit(100)
}

// Re-export common joins for caller convenience
export { onboardingStepRequiredDocs, onboardingUploadTokens, employees, tenants }
