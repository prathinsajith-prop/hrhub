import { eq, and, ilike, asc, desc, isNull, sql, getTableColumns } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { recruitmentJobs, jobApplications } from '../../db/schema/index.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewJob = InferInsertModel<typeof recruitmentJobs>
type NewApplication = InferInsertModel<typeof jobApplications>

export async function listJobs(tenantId: string, params: { status?: string; department?: string; limit: number; offset: number }) {
    const { status, department, limit, offset } = params
    const conditions = [eq(recruitmentJobs.tenantId, tenantId), isNull(recruitmentJobs.deletedAt)]
    if (status) conditions.push(eq(recruitmentJobs.status, status as never))
    if (department) conditions.push(eq(recruitmentJobs.department, department))

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
        .set({ deletedAt: new Date(), updatedAt: new Date() } as any)
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
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(recruitmentJobs.id, id), eq(recruitmentJobs.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function listApplications(tenantId: string, params: { jobId?: string; stage?: string; limit: number; offset: number }) {
    const { jobId, stage, limit, offset } = params
    const conditions = [eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)]
    if (jobId) conditions.push(eq(jobApplications.jobId, jobId))
    if (stage) conditions.push(eq(jobApplications.stage, stage as never))

    const rows = await db.select({ ...getTableColumns(jobApplications), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(jobApplications)
        .where(and(...conditions))
        .orderBy(desc(jobApplications.createdAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return { data: rows, total, limit, offset, hasMore: offset + limit < total }
}

export async function createApplication(tenantId: string, jobId: string, data: Omit<NewApplication, 'tenantId' | 'jobId' | 'id'>) {
    const [row] = await db.insert(jobApplications).values({ ...data, tenantId, jobId }).returning()
    return row
}

export async function updateApplicationStage(tenantId: string, id: string, stage: string) {
    const [row] = await db.update(jobApplications)
        .set({ stage: stage as never, updatedAt: new Date() } as any)
        .where(and(eq(jobApplications.id, id), eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .returning()
    return row ?? null
}

export async function softDeleteApplication(tenantId: string, id: string) {
    const [row] = await db.update(jobApplications)
        .set({ deletedAt: new Date(), updatedAt: new Date() } as any)
        .where(and(eq(jobApplications.id, id), eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .returning()
    return row ?? null
}
