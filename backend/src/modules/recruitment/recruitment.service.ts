import { eq, and, desc, isNull, sql, getTableColumns, ne, inArray, ilike, asc } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { recruitmentJobs, jobApplications, recruitmentStages, employees, tenants, recruitmentSkills, recruitmentQualifications } from '../../db/schema/index.js'
import { resolveAvatarUrl } from '../../plugins/s3.js'
import { Conditions } from '../../lib/filters.js'
import { scoreMatch } from './matching.engine.js'
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
    source: jobApplications.source,
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

    // Live applicant count per job. `recruitment_jobs` has no `applications`
    // counter column, so the list (and its "Applications" table column) must
    // compute it — otherwise every row shows 0. Pre-aggregated subquery (one
    // row per job) LEFT JOINed in, so COUNT(*) OVER() still counts jobs, not
    // applications. Counts only non-deleted applications, tenant-scoped to use
    // idx_applications_tenant. Mirrors the memberCount pattern in listTeams.
    const appCounts = db
        .select({ jobId: jobApplications.jobId, count: sql<number>`COUNT(*)`.as('count') })
        .from(jobApplications)
        .where(and(eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .groupBy(jobApplications.jobId)
        .as('ac')

    const rows = await db.select({
        ...getTableColumns(recruitmentJobs),
        applications: sql<number>`COALESCE(${appCounts.count}, 0)::int`,
        totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
    })
        .from(recruitmentJobs)
        .leftJoin(appCounts, eq(recruitmentJobs.id, appCounts.jobId))
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

/**
 * Distinct skills + qualifications already used across the tenant's jobs.
 * Powers the type-ahead suggestions in the job create/edit dialogs so HR reuses
 * consistent tags instead of inventing case/spelling variants. De-duplicated
 * case-insensitively (first-seen casing wins) and sorted alphabetically.
 */
/**
 * Skill + qualification suggestions for the recruitment UIs. Reads the dedicated
 * per-tenant catalog tables (migration 0088) — a single indexed lookup each,
 * already de-duplicated and alphabetised — instead of unnesting every job's
 * jsonb arrays at request time. Used by the job dialogs, the public careers
 * apply form, and the portal referral form.
 */
export async function getJobTagSuggestions(tenantId: string) {
    const [skills, qualifications] = await Promise.all([
        db.select({ name: recruitmentSkills.name }).from(recruitmentSkills)
            .where(eq(recruitmentSkills.tenantId, tenantId)).orderBy(recruitmentSkills.name),
        db.select({ name: recruitmentQualifications.name }).from(recruitmentQualifications)
            .where(eq(recruitmentQualifications.tenantId, tenantId)).orderBy(recruitmentQualifications.name),
    ])
    return { skills: skills.map((r) => r.name), qualifications: qualifications.map((r) => r.name) }
}

/**
 * Paginated skill-suggestion query backing the job dialog's type-ahead. Returns
 * a single page (default 10) plus `hasMore` so the client can render an
 * infinite-scroll dropdown without ever materialising the whole catalog.
 *
 * `q` is a case-insensitive substring match on the skill name. Empty string =
 * no filter (alphabetical listing). One COUNT(*) OVER() in the same query so
 * pagination metadata costs nothing extra.
 */
export async function listSkillSuggestions(
    tenantId: string,
    params: { q?: string; limit: number; offset: number },
) {
    const { q, limit, offset } = params
    const conds = [eq(recruitmentSkills.tenantId, tenantId)] as any[]
    const query = q?.trim()
    if (query) conds.push(ilike(recruitmentSkills.name, `%${query}%`))

    const rows = await db
        .select({
            name: recruitmentSkills.name,
            totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
        })
        .from(recruitmentSkills)
        .where(and(...conds))
        .orderBy(asc(recruitmentSkills.name))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return {
        data: rows.map((r) => r.name),
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
    }
}

/** Sibling of {@link listSkillSuggestions} for the qualifications catalog. */
export async function listQualificationSuggestions(
    tenantId: string,
    params: { q?: string; limit: number; offset: number },
) {
    const { q, limit, offset } = params
    const conds = [eq(recruitmentQualifications.tenantId, tenantId)] as any[]
    const query = q?.trim()
    if (query) conds.push(ilike(recruitmentQualifications.name, `%${query}%`))

    const rows = await db
        .select({
            name: recruitmentQualifications.name,
            totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
        })
        .from(recruitmentQualifications)
        .where(and(...conds))
        .orderBy(asc(recruitmentQualifications.name))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return {
        data: rows.map((r) => r.name),
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
    }
}

// ─── Recruitment tag catalog CRUD (skills / qualifications) ───────────────────
// HR manages the per-tenant skill & qualification catalogs from Organization
// Settings → Recruitment. These are the same tables the job dialogs read for
// type-ahead suggestions. Names are unique per tenant, case-insensitively.
// Deleting a catalog entry is safe: jobs/applications store their own skill
// arrays (denormalised jsonb), so removing a suggestion never mutates a record.

export type RecruitmentTagKind = 'skills' | 'qualifications'
const TAG_TABLES = { skills: recruitmentSkills, qualifications: recruitmentQualifications } as const
function tagTableFor(kind: RecruitmentTagKind) {
    return TAG_TABLES[kind]
}
function conflict(message: string) {
    return Object.assign(new Error(message), { statusCode: 409 })
}

/**
 * Paginated + searchable list of one tenant's catalog. The CRUD listing in
 * Org Settings → Recruitment Stages drives this; the type-ahead in the job
 * dialog uses the lighter `listSkillSuggestions` / `listQualificationSuggestions`
 * helpers (those return name-only). Returns `{ data, total, limit, offset,
 * hasMore }` so the client can do infinite scroll without ever needing a
 * second "total count" request.
 */
export async function listRecruitmentTags(
    tenantId: string,
    kind: RecruitmentTagKind,
    params: { q?: string; limit: number; offset: number },
) {
    const tbl = tagTableFor(kind)
    const { q, limit, offset } = params
    const conds = [eq(tbl.tenantId, tenantId)] as any[]
    const query = q?.trim()
    if (query) conds.push(ilike(tbl.name, `%${query}%`))

    const rows = await db
        .select({
            id: tbl.id,
            name: tbl.name,
            totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
        })
        .from(tbl)
        .where(and(...conds))
        .orderBy(asc(tbl.name))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return {
        data: rows.map(({ totalCount: _t, ...r }) => r),
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
    }
}

export async function createRecruitmentTag(tenantId: string, kind: RecruitmentTagKind, nameRaw: string) {
    const tbl = tagTableFor(kind)
    const name = nameRaw.trim()
    // onConflictDoNothing hits the (tenant, lower(name)) unique index; an empty
    // return means the name already exists → 409.
    const [row] = await db.insert(tbl).values({ tenantId, name }).onConflictDoNothing().returning()
    if (!row) throw conflict('That name already exists.')
    return row
}

export async function updateRecruitmentTag(tenantId: string, kind: RecruitmentTagKind, id: string, nameRaw: string) {
    const tbl = tagTableFor(kind)
    const name = nameRaw.trim()
    const dupe = await db.select({ id: tbl.id }).from(tbl)
        .where(and(eq(tbl.tenantId, tenantId), ne(tbl.id, id), sql`lower(${tbl.name}) = lower(${name})`)).limit(1)
    if (dupe.length) throw conflict('That name already exists.')
    const [row] = await db.update(tbl).set({ name })
        .where(and(eq(tbl.id, id), eq(tbl.tenantId, tenantId))).returning()
    return row ?? null
}

export async function deleteRecruitmentTag(tenantId: string, kind: RecruitmentTagKind, id: string) {
    const tbl = tagTableFor(kind)
    const [row] = await db.delete(tbl)
        .where(and(eq(tbl.id, id), eq(tbl.tenantId, tenantId))).returning()
    return row ?? null
}

/**
 * Upsert a job's skills/qualifications into the per-tenant catalogs. This is the
 * ONLY writer of the catalog — résumé-upload areas (candidate add, public
 * careers, referral) read suggestions but never add to it. Conflicts on the
 * case-insensitive unique index are ignored (first-seen casing is preserved).
 */
async function upsertJobCatalog(
    tenantId: string,
    tags: { skills?: unknown; qualifications?: unknown },
    conn: typeof db = db,
) {
    const skills = dedupeTags(tags.skills)
    const qualifications = dedupeTags(tags.qualifications)
    if (skills && skills.length > 0) {
        await conn.insert(recruitmentSkills)
            .values(skills.map((name) => ({ tenantId, name })))
            .onConflictDoNothing()
    }
    if (qualifications && qualifications.length > 0) {
        await conn.insert(recruitmentQualifications)
            .values(qualifications.map((name) => ({ tenantId, name })))
            .onConflictDoNothing()
    }
}

/* ─── Public careers portal (unauthenticated) ─────────────────────────────────
 * These functions back the public /careers/:companyCode pages. A visitor has no
 * JWT, so the tenant is resolved from the unique, shareable `companyCode`. Only
 * `open` jobs and a safe subset of columns are ever exposed — internal fields
 * (postedBy, deletedAt, etc.) never leave the service layer.
 */

/** Resolve a tenant from its public company code. Returns null if unknown. */
export async function getPublicTenantByCode(companyCode: string) {
    const code = companyCode.trim()
    if (!code) return null
    const [row] = await db.select({ id: tenants.id, name: tenants.name, companyCode: tenants.companyCode })
        .from(tenants)
        .where(eq(tenants.companyCode, code))
        .limit(1)
    return row ?? null
}

// Public-safe column projection — never expose postedBy/deletedAt/tenantId.
const PUBLIC_JOB_COLUMNS = {
    id: recruitmentJobs.id,
    jobNo: recruitmentJobs.jobNo,
    title: recruitmentJobs.title,
    department: recruitmentJobs.department,
    location: recruitmentJobs.location,
    type: recruitmentJobs.type,
    workplaceType: recruitmentJobs.workplaceType,
    openings: recruitmentJobs.openings,
    experienceYears: recruitmentJobs.experienceYears,
    minSalary: recruitmentJobs.minSalary,
    maxSalary: recruitmentJobs.maxSalary,
    industry: recruitmentJobs.industry,
    description: recruitmentJobs.description,
    requirements: recruitmentJobs.requirements,
    skills: recruitmentJobs.skills,
    qualifications: recruitmentJobs.qualifications,
    closingDate: recruitmentJobs.closingDate,
    createdAt: recruitmentJobs.createdAt,
}

/** Paginated, filterable list of a tenant's publicly visible (open) jobs. */
export async function listPublicJobs(
    tenantId: string,
    params: { limit: number; offset: number; q?: string; department?: string; location?: string; type?: string; workplaceType?: string },
) {
    const { limit, offset, q, department, location, type, workplaceType } = params

    const conds = Conditions.create()
        .tenant(recruitmentJobs.tenantId, tenantId)
        .notDeleted(recruitmentJobs.deletedAt)
        .match(recruitmentJobs.status, 'open')
        .match(recruitmentJobs.department, department)
        .match(recruitmentJobs.location, location)
        .match(recruitmentJobs.type, type)
        .match(recruitmentJobs.workplaceType, workplaceType)
        .search(q, recruitmentJobs.title, recruitmentJobs.department, recruitmentJobs.location)

    const rows = await db.select({ ...PUBLIC_JOB_COLUMNS, totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(recruitmentJobs)
        .where(conds.where())
        .orderBy(desc(recruitmentJobs.createdAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    const jobs = rows.map(({ totalCount: _totalCount, ...job }) => job)
    return { jobs, total, limit, offset, hasMore: offset + limit < total }
}

/** Distinct filter facets (departments, locations, types, workplace) across open jobs. */
export async function getPublicJobFacets(tenantId: string) {
    const rows = await db.select({
        department: recruitmentJobs.department,
        location: recruitmentJobs.location,
        type: recruitmentJobs.type,
        workplaceType: recruitmentJobs.workplaceType,
    })
        .from(recruitmentJobs)
        .where(and(
            eq(recruitmentJobs.tenantId, tenantId),
            eq(recruitmentJobs.status, 'open' as never),
            isNull(recruitmentJobs.deletedAt),
        ))

    const uniqSorted = (vals: (string | null)[]) =>
        [...new Set(vals.filter((v): v is string => !!v && v.trim() !== ''))].sort((a, b) => a.localeCompare(b))

    return {
        departments: uniqSorted(rows.map(r => r.department)),
        locations: uniqSorted(rows.map(r => r.location)),
        types: uniqSorted(rows.map(r => r.type)),
        workplaceTypes: uniqSorted(rows.map(r => r.workplaceType)),
    }
}

/** Fetch a single open job for the public detail page. Null if not open/found. */
export async function getPublicJob(tenantId: string, id: string) {
    const [row] = await db.select(PUBLIC_JOB_COLUMNS)
        .from(recruitmentJobs)
        .where(and(
            eq(recruitmentJobs.id, id),
            eq(recruitmentJobs.tenantId, tenantId),
            eq(recruitmentJobs.status, 'open' as never),
            isNull(recruitmentJobs.deletedAt),
        ))
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

/**
 * Next per-tenant requisition number, e.g. "JOB-0001". Derives the next value
 * from the highest existing JOB-#### for the tenant. Job creation is
 * low-frequency and the (tenant_id, job_no) partial-unique index is the
 * backstop, so a plain max+1 is sufficient (no dedicated sequence table).
 */
export async function generateNextJobNo(tenantId: string, conn: typeof db = db): Promise<string> {
    const [row] = await conn
        .select({ max: sql<number>`COALESCE(MAX(CAST(NULLIF(regexp_replace(${recruitmentJobs.jobNo}, '\\D', '', 'g'), '') AS INTEGER)), 0)` })
        .from(recruitmentJobs)
        .where(eq(recruitmentJobs.tenantId, tenantId))
    const next = Number(row?.max ?? 0) + 1
    return `JOB-${String(next).padStart(4, '0')}`
}

/**
 * Trim, drop empties, and de-duplicate a tag list case-insensitively
 * (first-seen casing wins) — e.g. ["React", "  react ", "", "REACT"] → ["React"].
 * Returns undefined for non-arrays so callers can omit the field from the update.
 */
function dedupeTags(list: unknown): string[] | undefined {
    if (!Array.isArray(list)) return undefined
    const seen = new Map<string, string>() // lowercase → first-seen original casing
    for (const raw of list) {
        const val = typeof raw === 'string' ? raw.trim() : ''
        if (!val) continue
        const key = val.toLowerCase()
        if (!seen.has(key)) seen.set(key, val)
    }
    return [...seen.values()]
}

/**
 * Normalise a job's tag arrays (skills / qualifications / requirements) so no
 * duplicate listings are ever persisted — regardless of entry path (form, bulk
 * import, or direct API). Only includes fields actually present on `data`.
 */
function normalizeJobTags(data: { skills?: unknown; qualifications?: unknown; requirements?: unknown }) {
    const out: Record<string, string[]> = {}
    const skills = dedupeTags(data.skills)
    const qualifications = dedupeTags(data.qualifications)
    const requirements = dedupeTags(data.requirements)
    if (skills) out.skills = skills
    if (qualifications) out.qualifications = qualifications
    if (requirements) out.requirements = requirements
    return out
}

export async function createJob(tenantId: string, data: Omit<NewJob, 'tenantId' | 'id'>) {
    const jobNo = await generateNextJobNo(tenantId)
    const [row] = await db.insert(recruitmentJobs)
        .values({ ...data, ...normalizeJobTags(data), tenantId, jobNo } as never)
        .returning()
    // Feed the tag catalogs from the job's skills/qualifications.
    await upsertJobCatalog(tenantId, data)
    return row
}

export async function updateJob(tenantId: string, id: string, data: Partial<NewJob>) {
    const [row] = await db.update(recruitmentJobs)
        .set(withTimestamp({ ...data, ...normalizeJobTags(data) }))
        .where(and(eq(recruitmentJobs.id, id), eq(recruitmentJobs.tenantId, tenantId), isNull(recruitmentJobs.deletedAt)))
        .returning()
    if (row && (data.skills !== undefined || data.qualifications !== undefined)) {
        await upsertJobCatalog(tenantId, data)
    }
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
        // Human-readable requisition number (e.g. JOB-0004) shown beside the job
        // link in the candidate list.
        jobNo: recruitmentJobs.jobNo,
        // Referrer name for the "Referred by" badge (null for direct applications).
        referredByName: sql<string | null>`CASE WHEN ${employees.id} IS NOT NULL THEN ${employees.firstName} || ' ' || ${employees.lastName} ELSE NULL END`,
    })
        .from(jobApplications)
        .leftJoin(recruitmentJobs, eq(jobApplications.jobId, recruitmentJobs.id))
        .leftJoin(employees, eq(jobApplications.referredByEmployeeId, employees.id))
        .where(conds.where())
        .orderBy(desc(jobApplications.createdAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0

    // Auto fit-score every candidate against the job they applied to. The manual
    // `score` column is a free-form recruiter rating that's almost always 0, so
    // the Score column read blank for everyone. We attach `matchScore` (0–100)
    // from the shared matching engine instead. Works for both a single-job
    // listing (job detail page) and the cross-job list (each candidate is bound
    // to one jobId): batch-fetch the page's distinct jobs in ONE query, then
    // score in memory — no per-row query / no N+1.
    const jobIdsToScore = jobId ? [jobId] : [...new Set(rows.map(r => r.jobId))]
    const jobRows = jobIdsToScore.length
        ? await db.select({
            id: recruitmentJobs.id,
            skills: recruitmentJobs.skills,
            qualifications: recruitmentJobs.qualifications,
            industry: recruitmentJobs.industry,
            location: recruitmentJobs.location,
            workplaceType: recruitmentJobs.workplaceType,
        }).from(recruitmentJobs)
            .where(and(eq(recruitmentJobs.tenantId, tenantId), inArray(recruitmentJobs.id, jobIdsToScore)))
        : []
    const jobById = new Map(jobRows.map(j => [j.id, j]))

    const data = await Promise.all(rows.map(async r => {
        const jr = jobById.get(r.jobId)
        return {
            ...r,
            resumeUrl: (await resolveAvatarUrl(r.resumeUrl)) ?? r.resumeUrl,
            avatar: (await resolveAvatarUrl(r.avatarUrl)) ?? undefined,
            matchScore: jr ? scoreMatch(jr, r).overall : undefined,
        }
    }))
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
    return {
        ...row,
        resumeUrl: (await resolveAvatarUrl(row.resumeUrl)) ?? row.resumeUrl,
        avatar: (await resolveAvatarUrl(row.avatarUrl)) ?? undefined,
    }
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

// ─── Bulk import — job listings ────────────────────────────────────────────
//
// Two-stage flow, identical contract to the assets bulk import:
//   1. validateBulkJobRowsSync()   — pure shape check + enum coercion +
//      numeric/date parsing. Tested in isolation.
//   2. bulkCreateJobs()            — re-validates and inserts everything
//      in a single transaction. Drops rows that fail validation.
//
// `recruitment_jobs` has no FK columns to resolve (department / location
// are freeform text), so the validator doesn't need any pre-loaded
// lookups — the call signature stays simple.

export type BulkJobType = 'full_time' | 'part_time' | 'contract'
export type BulkJobStatus = 'draft' | 'open' | 'closed' | 'on_hold'

const VALID_JOB_TYPES = new Set<BulkJobType>(['full_time', 'part_time', 'contract'])
const VALID_JOB_STATUSES = new Set<BulkJobStatus>(['draft', 'open', 'closed', 'on_hold'])

export interface BulkJobInputRow {
    rowNumber: number
    title?: string | null
    department?: string | null
    location?: string | null
    type?: string | null
    status?: string | null
    openings?: number | string | null
    minSalary?: number | string | null
    maxSalary?: number | string | null
    industry?: string | null
    closingDate?: string | null
}

export interface BulkJobRowResult {
    rowNumber: number
    ok: boolean
    errors: string[]
    /** Set when `ok` — normalized row ready for DB insert. */
    resolved?: {
        title: string
        department: string | null
        location: string | null
        type: BulkJobType
        status: BulkJobStatus
        openings: number
        minSalary: string | null
        maxSalary: string | null
        industry: string | null
        closingDate: string | null
    }
}

export interface BulkJobValidationResult {
    rows: BulkJobRowResult[]
    summary: { total: number; valid: number; invalid: number }
}

/**
 * Pure row-validation core. Same testing pattern as the bulk-assets
 * validator — extracted so we can hit every branch without spinning up
 * a database. Rules:
 *   • title is required
 *   • type defaults to 'full_time', status defaults to 'draft'
 *   • openings defaults to 1, must be a positive integer
 *   • min/maxSalary optional non-negative numbers; if both set, max ≥ min
 *   • closingDate optional ISO YYYY-MM-DD (or anything `new Date(...)`
 *     can parse — coerced to ISO)
 */
export function validateBulkJobRowsSync(rows: BulkJobInputRow[]): BulkJobValidationResult {
    const results: BulkJobRowResult[] = rows.map((r) => {
        const errors: string[] = []

        // ── title (required) ────────────────────────────────────────
        const title = (r.title ?? '').trim()
        if (!title) errors.push('title is required')

        // ── type enum (default full_time) ────────────────────────────
        const type = (r.type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_') || 'full_time'
        if (!VALID_JOB_TYPES.has(type as BulkJobType)) {
            errors.push(`type must be one of: ${Array.from(VALID_JOB_TYPES).join(', ')}`)
        }

        // ── status enum (default draft) ──────────────────────────────
        const status = (r.status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_') || 'draft'
        if (!VALID_JOB_STATUSES.has(status as BulkJobStatus)) {
            errors.push(`status must be one of: ${Array.from(VALID_JOB_STATUSES).join(', ')}`)
        }

        // ── openings (default 1, positive integer) ───────────────────
        let openings = 1
        if (r.openings !== null && r.openings !== undefined && r.openings !== '') {
            const n = typeof r.openings === 'number' ? r.openings : Number(String(r.openings).trim())
            if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
                errors.push('openings must be a positive whole number')
            } else {
                openings = n
            }
        }

        // ── numeric salary parsing ───────────────────────────────────
        const parseAmt = (raw: number | string | null | undefined, label: string): string | null => {
            if (raw === null || raw === undefined || raw === '') return null
            const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
            if (!Number.isFinite(n) || n < 0) {
                errors.push(`${label} must be a non-negative number`)
                return null
            }
            return n.toFixed(2)
        }
        const minSalary = parseAmt(r.minSalary, 'min_salary')
        const maxSalary = parseAmt(r.maxSalary, 'max_salary')

        // Range check only when both parsed cleanly. We compare on the
        // numeric form so "500.00" vs "1500.00" string compare doesn't
        // bite us.
        if (minSalary !== null && maxSalary !== null && Number(maxSalary) < Number(minSalary)) {
            errors.push('max_salary must be greater than or equal to min_salary')
        }

        // ── closingDate (optional, ISO) ──────────────────────────────
        let closingDate: string | null = null
        if (r.closingDate) {
            const raw = String(r.closingDate).trim()
            const iso = raw.match(/^\d{4}-\d{2}-\d{2}$/)
                ? raw
                : (() => {
                    const d = new Date(raw)
                    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
                })()
            if (!iso) errors.push('closing_date must be a valid date (YYYY-MM-DD)')
            else closingDate = iso
        }

        const ok = errors.length === 0
        return {
            rowNumber: r.rowNumber,
            ok,
            errors,
            resolved: ok
                ? {
                      title,
                      department: (r.department ?? '').trim() || null,
                      location: (r.location ?? '').trim() || null,
                      type: type as BulkJobType,
                      status: status as BulkJobStatus,
                      openings,
                      minSalary,
                      maxSalary,
                      industry: (r.industry ?? '').trim() || null,
                      closingDate,
                  }
                : undefined,
        }
    })

    return {
        rows: results,
        summary: {
            total: results.length,
            valid: results.filter((r) => r.ok).length,
            invalid: results.filter((r) => !r.ok).length,
        },
    }
}

/**
 * Thin async wrapper for routes — keeps the call signature parallel with
 * the assets bulk validator (`validateBulkAssetRows`) so the route layer
 * looks identical. Currently no DB lookups needed; this is just an
 * `await` on the sync core for shape symmetry.
 */
export async function validateBulkJobRows(
    _tenantId: string,
    rows: BulkJobInputRow[],
): Promise<BulkJobValidationResult> {
    return Promise.resolve(validateBulkJobRowsSync(rows))
}

// ─── Bulk import — candidates / job applications ──────────────────────────
//
// Hiring teams typically migrate from LinkedIn exports or an ATS (Workable,
// Greenhouse, BambooHR, Recruitee). All of these emit slightly different
// CSV headers but the underlying columns are the same: name, email,
// optional phone / experience / notes. The bulk-validator below detects
// both header families (LinkedIn's "First Name"/"Last Name" pair and the
// generic "Name"/"Candidate Name" column) and produces a uniform shape.
//
// jobId is picked once in the dialog and applied to every row — same
// pattern as the payroll bulk-adjustment category, keeps the sheet lean.

export interface BulkCandidateInputRow {
    rowNumber: number
    // Raw fields as parsed from the spreadsheet. The validator is the one
    // that knows how to combine firstName + lastName into the canonical
    // `name` column.
    firstName?: string | null
    lastName?: string | null
    name?: string | null
    email?: string | null
    phone?: string | null
    nationality?: string | null
    experience?: number | string | null
    expectedSalary?: number | string | null
    notes?: string | null
}

export interface BulkCandidateRowResult {
    rowNumber: number
    ok: boolean
    errors: string[]
    /** Marked when the row's email is already in this job's live pipeline. */
    duplicate?: boolean
    /** Echoed display fields so the preview can show the candidate name
     *  even if validation failed (useful for "row 7: missing email"). */
    displayName?: string
    displayEmail?: string
    /** Set when ok — payload ready for DB insert (jobId injected later). */
    resolved?: {
        name: string
        email: string
        phone: string | null
        nationality: string | null
        experience: number | null
        expectedSalary: string | null
        notes: string | null
    }
}

export interface BulkCandidateValidationResult {
    rows: BulkCandidateRowResult[]
    summary: { total: number; valid: number; invalid: number; duplicate: number }
}

export interface BulkCandidateLookups {
    /** Lower-cased emails already in this job's active pipeline (any stage
     *  other than 'rejected'). Hits flag the row as `duplicate`. */
    existingEmailsInJob: Set<string>
}

// Permissive but RFC-style enough to catch typos. Email validation is
// notoriously over-specified; we trust the candidate to fix on follow-up.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Pure row-validation core. Same pattern as the assets / jobs / mappings
 * validators — no DB calls, just rule application against pre-loaded
 * lookups. Rules:
 *   • email is required and must look like an email
 *   • a candidate name is required; if the source carries firstName+lastName
 *     we combine them, otherwise we use the single `name` column
 *   • experience (years) must be a non-negative integer when present
 *   • expectedSalary must be a non-negative number when present (stored as
 *     2-decimal string)
 *   • email is unique inside the upload AND not already in the job's live
 *     pipeline (duplicates are flagged but distinct from "invalid")
 */
export function validateBulkCandidateRowsSync(
    rows: BulkCandidateInputRow[],
    lookups: BulkCandidateLookups,
): BulkCandidateValidationResult {
    // Pre-pass — count email occurrences in the upload so we can flag
    // every row carrying a duplicate, not just the second one.
    const emailOccurrences = new Map<string, number>()
    for (const r of rows) {
        const e = (r.email ?? '').trim().toLowerCase()
        if (e) emailOccurrences.set(e, (emailOccurrences.get(e) ?? 0) + 1)
    }

    const results: BulkCandidateRowResult[] = rows.map((r) => {
        const errors: string[] = []

        // ── name (required; combine firstName + lastName if present) ─
        const first = (r.firstName ?? '').trim()
        const last = (r.lastName ?? '').trim()
        const combined = `${first} ${last}`.trim()
        const direct = (r.name ?? '').trim()
        // Prefer the explicit `name` column if HR filled it, otherwise
        // synthesise from first/last. Some LinkedIn exports only carry
        // first+last; some ATSes only carry a single "Candidate Name".
        const name = direct || combined
        if (!name) errors.push('name is required (or both first_name and last_name)')

        // ── email (required + format + duplicate) ────────────────────
        const emailRaw = (r.email ?? '').trim()
        const email = emailRaw.toLowerCase()
        let duplicate = false
        if (!emailRaw) {
            errors.push('email is required')
        } else if (!EMAIL_RE.test(emailRaw)) {
            errors.push(`email "${emailRaw}" is not a valid email address`)
        } else {
            if (lookups.existingEmailsInJob.has(email)) {
                // Existing candidate in the job's live pipeline. Surfaced
                // as a non-blocking *duplicate* (HR can decide to add a
                // second application by un-flagging in the UI later).
                duplicate = true
                errors.push(`email "${emailRaw}" already has an active application for this job`)
            } else if ((emailOccurrences.get(email) ?? 0) > 1) {
                duplicate = true
                errors.push(`email "${emailRaw}" appears more than once in this file`)
            }
        }

        // ── experience (integer years) ───────────────────────────────
        let experience: number | null = null
        if (r.experience !== null && r.experience !== undefined && r.experience !== '') {
            const n = typeof r.experience === 'number' ? r.experience : Number(String(r.experience).trim())
            if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
                errors.push('experience must be a non-negative whole number of years')
            } else {
                experience = n
            }
        }

        // ── expected salary (non-negative number, stored 2-decimal) ──
        let expectedSalary: string | null = null
        if (r.expectedSalary !== null && r.expectedSalary !== undefined && r.expectedSalary !== '') {
            const n = typeof r.expectedSalary === 'number' ? r.expectedSalary : Number(String(r.expectedSalary).trim())
            if (!Number.isFinite(n) || n < 0) {
                errors.push('expected_salary must be a non-negative number')
            } else {
                expectedSalary = n.toFixed(2)
            }
        }

        const ok = errors.length === 0
        return {
            rowNumber: r.rowNumber,
            ok,
            errors,
            duplicate,
            displayName: name || undefined,
            displayEmail: emailRaw || undefined,
            resolved: ok
                ? {
                      name,
                      email: emailRaw,
                      phone: (r.phone ?? '').trim() || null,
                      nationality: (r.nationality ?? '').trim() || null,
                      experience,
                      expectedSalary,
                      notes: (r.notes ?? '').trim() || null,
                  }
                : undefined,
        }
    })

    return {
        rows: results,
        summary: {
            total: results.length,
            valid: results.filter((r) => r.ok).length,
            invalid: results.filter((r) => !r.ok && !r.duplicate).length,
            duplicate: results.filter((r) => r.duplicate).length,
        },
    }
}

/**
 * Loads the per-job duplicate lookup in one query, then runs the sync
 * core. Caller passes the target jobId (picked once in the dialog).
 */
export async function validateBulkCandidateRows(
    tenantId: string,
    jobId: string,
    rows: BulkCandidateInputRow[],
): Promise<BulkCandidateValidationResult & { jobExists: boolean }> {
    // Verify the job belongs to this tenant before doing any duplicate
    // lookup. Returning a `jobExists: false` flag lets the route map this
    // to a 404 without throwing.
    const [job] = await db
        .select({ id: recruitmentJobs.id })
        .from(recruitmentJobs)
        .where(and(
            eq(recruitmentJobs.id, jobId),
            eq(recruitmentJobs.tenantId, tenantId),
            isNull(recruitmentJobs.deletedAt),
        ))
        .limit(1)
    if (!job) {
        return {
            rows: [],
            summary: { total: 0, valid: 0, invalid: 0, duplicate: 0 },
            jobExists: false,
        }
    }

    // Pull only the emails we need to check — bounded by what's in the
    // upload — rather than the entire pipeline for the job. Saves a lot
    // of memory on jobs with thousands of historical applications.
    const referencedEmails = Array.from(
        new Set(
            rows
                .map((r) => (r.email ?? '').trim().toLowerCase())
                .filter((e) => e.length > 0),
        ),
    )
    const existingEmailsInJob = new Set<string>()
    if (referencedEmails.length > 0) {
        const live = await db
            .select({ email: jobApplications.email })
            .from(jobApplications)
            .where(and(
                eq(jobApplications.tenantId, tenantId),
                eq(jobApplications.jobId, jobId),
                ne(jobApplications.stage, 'rejected'),
                isNull(jobApplications.deletedAt),
                inArray(jobApplications.email, referencedEmails),
            ))
        for (const r of live) existingEmailsInJob.add(r.email.toLowerCase())
    }

    const result = validateBulkCandidateRowsSync(rows, { existingEmailsInJob })
    return { ...result, jobExists: true }
}

/**
 * Insert every valid, non-duplicate row in one transaction. Duplicate
 * rows are silently dropped (the UI showed them at preview). Returns the
 * full validation result plus `created` / `skipped` counts.
 */
export async function bulkCreateCandidates(
    tenantId: string,
    jobId: string,
    rows: BulkCandidateInputRow[],
): Promise<BulkCandidateValidationResult & { jobExists: boolean; created: number; skipped: number }> {
    const validation = await validateBulkCandidateRows(tenantId, jobId, rows)
    if (!validation.jobExists) {
        return { ...validation, created: 0, skipped: 0 }
    }
    // Only insertable = valid AND not a duplicate. Duplicates are valid-
    // shape rows that we just don't want to insert a second copy of.
    const insertable = validation.rows.filter((r) => r.ok && r.resolved && !r.duplicate)
    if (insertable.length === 0) {
        return {
            ...validation,
            created: 0,
            skipped: validation.summary.invalid + validation.summary.duplicate,
        }
    }
    await db.transaction(async (tx) => {
        const values = insertable.map((r) => {
            const x = r.resolved!
            return {
                tenantId,
                jobId,
                name: x.name,
                email: x.email,
                phone: x.phone,
                nationality: x.nationality,
                experience: x.experience,
                expectedSalary: x.expectedSalary,
                notes: x.notes,
                stage: 'received' as const,
            }
        })
        await tx.insert(jobApplications).values(values)
    })
    return {
        ...validation,
        created: insertable.length,
        skipped: validation.summary.invalid + validation.summary.duplicate,
    }
}

/**
 * Insert all valid rows in one transaction. Re-runs validation server-
 * side and silently drops invalid rows — the UI told HR which rows
 * those were at the preview step.
 */
export async function bulkCreateJobs(
    tenantId: string,
    rows: BulkJobInputRow[],
    postedBy: string | null,
): Promise<BulkJobValidationResult & { created: number; skipped: number }> {
    const validation = validateBulkJobRowsSync(rows)
    const insertable = validation.rows.filter((r) => r.ok && r.resolved)
    if (insertable.length === 0) {
        return { ...validation, created: 0, skipped: validation.summary.invalid }
    }
    await db.transaction(async (tx) => {
        const values = insertable.map((r) => {
            const x = r.resolved!
            return {
                tenantId,
                title: x.title,
                department: x.department,
                location: x.location,
                type: x.type,
                status: x.status,
                openings: x.openings,
                minSalary: x.minSalary,
                maxSalary: x.maxSalary,
                industry: x.industry,
                // Schema default [] applies — requirements/description
                // come from later per-row edits.
                closingDate: x.closingDate,
                postedBy,
            }
        })
        await tx.insert(recruitmentJobs).values(values)
    })
    return { ...validation, created: insertable.length, skipped: validation.summary.invalid }
}
