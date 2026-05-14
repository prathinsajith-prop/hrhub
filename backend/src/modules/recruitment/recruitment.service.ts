import { eq, and, desc, isNull, sql, getTableColumns, ne, inArray } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { recruitmentJobs, jobApplications, recruitmentStages } from '../../db/schema/index.js'
import { resolveAvatarUrl } from '../../plugins/s3.js'
import { Conditions } from '../../lib/filters.js'
import { buildDefaultRecruitmentStageRows } from './recruitment.defaults.js'
import type { InferInsertModel } from 'drizzle-orm'

const JOB_FIELD_MAP = {
    status: recruitmentJobs.status,
    department: recruitmentJobs.department,
    title: recruitmentJobs.title,
    location: recruitmentJobs.location,
    openings: recruitmentJobs.openings,
    minSalary: recruitmentJobs.minSalary,
    maxSalary: recruitmentJobs.maxSalary,
    closingDate: recruitmentJobs.closingDate,
}
const JOB_ALLOWED = new Set(Object.keys(JOB_FIELD_MAP))

const APP_FIELD_MAP = {
    stage: jobApplications.stage,
    jobId: jobApplications.jobId,
    nationality: jobApplications.nationality,
    score: jobApplications.score,
    experience: jobApplications.experience,
    expectedSalary: jobApplications.expectedSalary,
}
const APP_ALLOWED = new Set(Object.keys(APP_FIELD_MAP))

type NewJob = InferInsertModel<typeof recruitmentJobs>
type NewApplication = InferInsertModel<typeof jobApplications>

export async function listJobs(tenantId: string, params: { status?: string; department?: string; q?: string; filter?: string; limit: number; offset: number }) {
    const { status, department, q, filter, limit, offset } = params

    const conds = Conditions.create()
        .tenant(recruitmentJobs.tenantId, tenantId)
        .notDeleted(recruitmentJobs.deletedAt)
        .match(recruitmentJobs.status, status)
        .match(recruitmentJobs.department, department)
        .search(q, recruitmentJobs.title, recruitmentJobs.department)
        .filter(filter, JOB_FIELD_MAP, JOB_ALLOWED)

    const rows = await db.select({ ...getTableColumns(recruitmentJobs), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(recruitmentJobs)
        .where(conds.where())
        .orderBy(desc(recruitmentJobs.createdAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return { data: rows, total, limit, offset, hasMore: offset + limit < total }
}

export async function getJob(tenantId: string, id: string) {
    const [row] = await db.select().from(recruitmentJobs)
        .where(and(eq(recruitmentJobs.id, id), eq(recruitmentJobs.tenantId, tenantId), isNull(recruitmentJobs.deletedAt)))
        .limit(1)
    return row ?? null
}

export async function softDeleteJob(tenantId: string, id: string) {
    const [row] = await db.update(recruitmentJobs)
        .set(withTimestamp({ deletedAt: new Date() }))
        .where(and(eq(recruitmentJobs.id, id), eq(recruitmentJobs.tenantId, tenantId), isNull(recruitmentJobs.deletedAt)))
        .returning()
    return row ?? null
}

export async function createJob(tenantId: string, data: Omit<NewJob, 'tenantId' | 'id'>) {
    const [row] = await db.insert(recruitmentJobs).values({ ...data, tenantId }).returning()
    return row
}

export async function updateJob(tenantId: string, id: string, data: Partial<NewJob>) {
    const [row] = await db.update(recruitmentJobs)
        .set(withTimestamp(data))
        .where(and(eq(recruitmentJobs.id, id), eq(recruitmentJobs.tenantId, tenantId), isNull(recruitmentJobs.deletedAt)))
        .returning()
    return row ?? null
}

export async function listApplications(tenantId: string, params: { jobId?: string; stage?: string; q?: string; filter?: string; limit: number; offset: number }) {
    const { jobId, stage, q, filter, limit, offset } = params

    const conds = Conditions.create()
        .tenant(jobApplications.tenantId, tenantId)
        .notDeleted(jobApplications.deletedAt)
        .match(jobApplications.jobId, jobId)
        .match(jobApplications.stage, stage)
        .search(q, jobApplications.name, jobApplications.email)
        .filter(filter, APP_FIELD_MAP, APP_ALLOWED)

    const rows = await db.select({
        ...getTableColumns(jobApplications),
        totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
        jobTitle: recruitmentJobs.title,
    })
        .from(jobApplications)
        .leftJoin(recruitmentJobs, eq(jobApplications.jobId, recruitmentJobs.id))
        .where(conds.where())
        .orderBy(desc(jobApplications.createdAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    const data = await Promise.all(rows.map(async r => ({
        ...r,
        resumeUrl: (await resolveAvatarUrl(r.resumeUrl)) ?? r.resumeUrl,
    })))
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

export async function createApplication(tenantId: string, jobId: string, data: Omit<NewApplication, 'tenantId' | 'jobId' | 'id'>) {
    // Prevent duplicate application: same candidate email + same job (unless previously rejected/withdrawn)
    if (data.email) {
        const [duplicate] = await db.select({ id: jobApplications.id, stage: jobApplications.stage })
            .from(jobApplications)
            .where(and(
                eq(jobApplications.tenantId, tenantId),
                eq(jobApplications.jobId, jobId),
                eq(jobApplications.email, data.email),
                isNull(jobApplications.deletedAt),
                ne(jobApplications.stage, 'rejected' as never),
            ))
            .limit(1)
        if (duplicate) {
            throw Object.assign(
                new Error('This candidate has already applied for this position.'),
                { statusCode: 409 },
            )
        }
    }
    const [row] = await db.insert(jobApplications).values({ ...data, tenantId, jobId }).returning()
    return row
}

export async function getApplication(tenantId: string, id: string) {
    const [row] = await db.select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, id), eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .limit(1)
    if (!row) return null
    return { ...row, resumeUrl: (await resolveAvatarUrl(row.resumeUrl)) ?? row.resumeUrl }
}

export async function updateApplicationStage(tenantId: string, id: string, stage: string) {
    const [row] = await db.update(jobApplications)
        .set(withTimestamp({ stage } as Record<string, unknown>))
        .where(and(eq(jobApplications.id, id), eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .returning()
    return row ?? null
}

export async function updateApplication(tenantId: string, id: string, data: Partial<NewApplication>) {
    const [row] = await db.update(jobApplications)
        .set(withTimestamp(data as Record<string, unknown>))
        .where(and(eq(jobApplications.id, id), eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .returning()
    return row ?? null
}

export async function softDeleteApplication(tenantId: string, id: string) {
    const [row] = await db.update(jobApplications)
        .set(withTimestamp({ deletedAt: new Date() }))
        .where(and(eq(jobApplications.id, id), eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .returning()
    return row ?? null
}

/* ─── Recruitment pipeline stages (per-tenant) ────────────────────────────── */

/**
 * List the tenant's recruitment stages, ordered by stage_order. If the tenant
 * has no rows yet (legacy tenants created before the table existed), seed the
 * defaults inside a transaction. The re-check inside the transaction prevents
 * concurrent first-reads from duplicating the seed.
 */
export async function listRecruitmentStages(tenantId: string) {
    const existing = await db.select().from(recruitmentStages)
        .where(eq(recruitmentStages.tenantId, tenantId))
        .orderBy(recruitmentStages.stageOrder)
    if (existing.length > 0) return existing

    return db.transaction(async (tx) => {
        const rechecked = await tx.select().from(recruitmentStages)
            .where(eq(recruitmentStages.tenantId, tenantId))
            .orderBy(recruitmentStages.stageOrder)
        if (rechecked.length > 0) return rechecked
        await tx.insert(recruitmentStages).values(buildDefaultRecruitmentStageRows(tenantId))
        return tx.select().from(recruitmentStages)
            .where(eq(recruitmentStages.tenantId, tenantId))
            .orderBy(recruitmentStages.stageOrder)
    })
}

/**
 * Edit a stage's user-controllable fields. Stage keys and is_terminal are
 * system-controlled and intentionally not editable. When `isFirst` or
 * `isFinal` flips on, the previous holder of that flag is automatically
 * cleared so the per-tenant uniqueness invariant holds.
 */
export async function updateRecruitmentStage(
    tenantId: string,
    stageId: string,
    data: { label?: string; colorKey?: string; isFirst?: boolean; isFinal?: boolean; showInKanban?: boolean },
) {
    return db.transaction(async (tx) => {
        if (data.isFirst === true) {
            await tx.update(recruitmentStages)
                .set({ isFirst: false, updatedAt: new Date() })
                .where(and(
                    eq(recruitmentStages.tenantId, tenantId),
                    eq(recruitmentStages.isFirst, true),
                    ne(recruitmentStages.id, stageId),
                ))
        }
        if (data.isFinal === true) {
            await tx.update(recruitmentStages)
                .set({ isFinal: false, updatedAt: new Date() })
                .where(and(
                    eq(recruitmentStages.tenantId, tenantId),
                    eq(recruitmentStages.isFinal, true),
                    ne(recruitmentStages.id, stageId),
                ))
        }
        const [row] = await tx.update(recruitmentStages)
            .set(withTimestamp(data as Record<string, unknown>))
            .where(and(eq(recruitmentStages.id, stageId), eq(recruitmentStages.tenantId, tenantId)))
            .returning()
        return row ?? null
    })
}

/**
 * Reorder stages atomically. Accepts an ordered list of stage IDs; positions
 * are re-numbered 1..N. IDs not belonging to the tenant are silently ignored.
 * Single CASE-based UPDATE — one round-trip regardless of N.
 */
export async function reorderRecruitmentStages(tenantId: string, orderedIds: string[]) {
    return db.transaction(async (tx) => {
        const rows = await tx.select({ id: recruitmentStages.id })
            .from(recruitmentStages)
            .where(eq(recruitmentStages.tenantId, tenantId))
        const allowed = new Set(rows.map(r => r.id))
        const valid = orderedIds.filter(id => allowed.has(id))
        if (valid.length === 0) return []

        const caseClauses = valid.map((id, i) => sql`WHEN ${id}::uuid THEN ${i + 1}`)
        await tx.update(recruitmentStages)
            .set({
                stageOrder: sql`CASE ${recruitmentStages.id} ${sql.join(caseClauses, sql` `)} END`,
                updatedAt: new Date(),
            })
            .where(and(
                eq(recruitmentStages.tenantId, tenantId),
                inArray(recruitmentStages.id, valid),
            ))
        return tx.select().from(recruitmentStages)
            .where(eq(recruitmentStages.tenantId, tenantId))
            .orderBy(recruitmentStages.stageOrder)
    })
}

/**
 * Slug-ify a label into a stable stage_key. Lowercases, replaces runs of
 * non-alphanumerics with `_`, and trims leading/trailing underscores. If the
 * derived key collides with an existing one for the tenant, a numeric suffix
 * is appended (`stage_2`, `stage_3`, …).
 */
async function deriveStageKey(tenantId: string, label: string): Promise<string> {
    const base = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'stage'
    const existing = await db.select({ stageKey: recruitmentStages.stageKey })
        .from(recruitmentStages)
        .where(eq(recruitmentStages.tenantId, tenantId))
    const taken = new Set(existing.map(r => r.stageKey))
    if (!taken.has(base)) return base
    for (let i = 2; i < 1000; i++) {
        const candidate = `${base}_${i}`
        if (!taken.has(candidate)) return candidate
    }
    throw new Error('Could not derive a unique stage key')
}

/** Create a new pipeline stage for the tenant. Appended at the end of the list. */
export async function createRecruitmentStage(
    tenantId: string,
    data: { label: string; colorKey?: string; isTerminal?: boolean },
) {
    const stageKey = await deriveStageKey(tenantId, data.label)
    const existing = await db.select({ stageOrder: recruitmentStages.stageOrder })
        .from(recruitmentStages)
        .where(eq(recruitmentStages.tenantId, tenantId))
    const nextOrder = existing.length > 0 ? Math.max(...existing.map(s => s.stageOrder)) + 1 : 1
    const [row] = await db.insert(recruitmentStages).values({
        tenantId,
        stageKey,
        label: data.label,
        colorKey: data.colorKey ?? 'slate',
        stageOrder: nextOrder,
        isTerminal: data.isTerminal ?? false,
    }).returning()
    return row
}

/**
 * Delete a stage. Refuses if any candidate is currently on this stage — the
 * caller should reassign those candidates first. Returns `{ row, blockedBy }`
 * where `blockedBy` is the candidate count when deletion is refused.
 */
export async function deleteRecruitmentStage(tenantId: string, stageId: string) {
    const [stage] = await db.select().from(recruitmentStages)
        .where(and(eq(recruitmentStages.id, stageId), eq(recruitmentStages.tenantId, tenantId)))
    if (!stage) return { row: null, blockedBy: 0 }

    const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(jobApplications)
        .where(and(
            eq(jobApplications.tenantId, tenantId),
            eq(jobApplications.stage, stage.stageKey),
            isNull(jobApplications.deletedAt),
        ))
    if (count > 0) return { row: null, blockedBy: count }

    const [deleted] = await db.delete(recruitmentStages)
        .where(and(eq(recruitmentStages.id, stageId), eq(recruitmentStages.tenantId, tenantId)))
        .returning()
    return { row: deleted ?? null, blockedBy: 0 }
}

/** Reset the tenant's recruitment stages back to the system defaults. */
export async function resetRecruitmentStages(tenantId: string) {
    return db.transaction(async (tx) => {
        await tx.delete(recruitmentStages)
            .where(eq(recruitmentStages.tenantId, tenantId))
        await tx.insert(recruitmentStages).values(buildDefaultRecruitmentStageRows(tenantId))
        return tx.select().from(recruitmentStages)
            .where(eq(recruitmentStages.tenantId, tenantId))
            .orderBy(recruitmentStages.stageOrder)
    })
}
