import { eq, and, ilike, asc, desc, isNull, sql, getTableColumns, ne, or } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { recruitmentJobs, jobApplications } from '../../db/schema/index.js'
import { resolveAvatarUrl } from '../../plugins/s3.js'
import { parseFilterString, buildDrizzleFilters } from '../../lib/filters.js'
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

const APP_FIELD_MAP = { stage: jobApplications.stage, jobId: jobApplications.jobId }
const APP_ALLOWED = new Set(Object.keys(APP_FIELD_MAP))

type NewJob = InferInsertModel<typeof recruitmentJobs>
type NewApplication = InferInsertModel<typeof jobApplications>

export async function listJobs(tenantId: string, params: { status?: string; department?: string; q?: string; filter?: string; limit: number; offset: number }) {
    const { status, department, q, filter, limit, offset } = params
    const conditions = [eq(recruitmentJobs.tenantId, tenantId), isNull(recruitmentJobs.deletedAt)]
    if (status) conditions.push(eq(recruitmentJobs.status, status as never))
    if (department) conditions.push(eq(recruitmentJobs.department, department))
    if (q) {
        const term = `%${q.trim()}%`
        conditions.push(or(ilike(recruitmentJobs.title, term), ilike(recruitmentJobs.department, term))!)
    }
    if (filter) {
        buildDrizzleFilters(parseFilterString(filter), JOB_FIELD_MAP, JOB_ALLOWED).forEach(c => conditions.push(c))
    }

    const rows = await db.select({ ...getTableColumns(recruitmentJobs), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(recruitmentJobs)
        .where(and(...conditions))
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
    const conditions = [eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)]
    if (jobId) conditions.push(eq(jobApplications.jobId, jobId))
    if (stage) conditions.push(eq(jobApplications.stage, stage as never))
    if (q) {
        const term = `%${q.trim()}%`
        conditions.push(or(ilike(jobApplications.name, term), ilike(jobApplications.email, term))!)
    }
    if (filter) {
        buildDrizzleFilters(parseFilterString(filter), APP_FIELD_MAP, APP_ALLOWED).forEach(c => conditions.push(c))
    }

    const rows = await db.select({ ...getTableColumns(jobApplications), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(jobApplications)
        .where(and(...conditions))
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

export async function getApplication(tenantId: string, id: string) {
    const [row] = await db.select().from(jobApplications)
        .where(and(eq(jobApplications.id, id), eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .limit(1)
    if (!row) return null
    return { ...row, resumeUrl: (await resolveAvatarUrl(row.resumeUrl)) ?? row.resumeUrl }
}

export async function softDeleteApplication(tenantId: string, id: string) {
    const [row] = await db.update(jobApplications)
        .set(withTimestamp({ deletedAt: new Date() }))
        .where(and(eq(jobApplications.id, id), eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .returning()
    return row ?? null
}
