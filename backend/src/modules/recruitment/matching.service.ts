import { and, desc, eq, isNull, ne, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { recruitmentJobs, jobApplications } from '../../db/schema/index.js'
import { resolveAvatarUrl } from '../../plugins/s3.js'
import { scoreMatch } from './matching.engine.js'

// ─────────────────────────────────────────────────────────────────────────────
// Recommendation queries — talent-pool grouping + candidate⇄job matching.
// The scoring math lives in the dependency-free `matching.engine.ts`; this file
// is only data access (read the pool / jobs, score in memory, shape the result).
// ─────────────────────────────────────────────────────────────────────────────

// Safety cap on the talent-pool scan. In-memory scoring is cheap, but we don't
// want a pathological tenant to load an unbounded set. If hit, the route surfaces
// `capped: true` so the UI can say "scored the most recent N candidates". The
// scan uses the (tenant_id, created_at) index, so it's a bounded backward scan.
const POOL_SCAN_CAP = 2000

/**
 * Recommend existing candidates for a job. Builds a talent pool by grouping
 * every non-deleted application in the tenant by normalised email (one person =
 * one email), unioning their skills across applications. People already in THIS
 * job's pipeline are excluded — the value is cross-job discovery + talent reuse.
 */
export async function recommendCandidatesForJob(tenantId: string, jobId: string, limit = 10) {
    const [job] = await db.select({
        id: recruitmentJobs.id,
        skills: recruitmentJobs.skills,
        qualifications: recruitmentJobs.qualifications,
        industry: recruitmentJobs.industry,
        location: recruitmentJobs.location,
        workplaceType: recruitmentJobs.workplaceType,
    }).from(recruitmentJobs)
        .where(and(eq(recruitmentJobs.id, jobId), eq(recruitmentJobs.tenantId, tenantId), isNull(recruitmentJobs.deletedAt)))
        .limit(1)
    if (!job) return null

    const apps = await db.select({
        id: jobApplications.id,
        name: jobApplications.name,
        email: jobApplications.email,
        skills: jobApplications.skills,
        experience: jobApplications.experience,
        educationHistory: jobApplications.educationHistory,
        experienceHistory: jobApplications.experienceHistory,
        address: jobApplications.address,
        nationality: jobApplications.nationality,
        avatarUrl: jobApplications.avatarUrl,
        stage: jobApplications.stage,
        jobId: jobApplications.jobId,
    }).from(jobApplications)
        .where(and(eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .orderBy(desc(jobApplications.createdAt))
        .limit(POOL_SCAN_CAP)
    const capped = apps.length === POOL_SCAN_CAP

    // Group by normalised email → one representative person (most recent app,
    // since rows are newest-first), union of their skills, set of jobs applied to.
    type Person = (typeof apps)[number] & { allSkills: string[]; appliedJobIds: Set<string> }
    const byEmail = new Map<string, Person>()
    for (const a of apps) {
        const key = a.email.toLowerCase().trim()
        const existing = byEmail.get(key)
        if (!existing) {
            byEmail.set(key, { ...a, allSkills: [...(a.skills ?? [])], appliedJobIds: new Set([a.jobId]) })
        } else {
            existing.appliedJobIds.add(a.jobId)
            for (const s of a.skills ?? []) if (!existing.allSkills.includes(s)) existing.allSkills.push(s)
        }
    }

    const scored = [...byEmail.values()]
        .filter((p) => !p.appliedJobIds.has(jobId)) // cross-job / pool only
        .map((p) => ({ p, m: scoreMatch(job, { ...p, skills: p.allSkills }) }))
        .filter((x) => x.m.overall > 0 && x.m.matchedSkills.length > 0)
        .sort((a, b) => b.m.overall - a.m.overall)
        .slice(0, limit)

    // Resolve the "applied to" job titles for the surfaced people (one query).
    const otherJobIds = [...new Set(scored.flatMap((x) => [...x.p.appliedJobIds]))]
    const jobTitleRows = otherJobIds.length
        ? await db.select({ id: recruitmentJobs.id, title: recruitmentJobs.title })
            .from(recruitmentJobs)
            .where(and(eq(recruitmentJobs.tenantId, tenantId), inArray(recruitmentJobs.id, otherJobIds)))
        : []
    const titleById = new Map(jobTitleRows.map((j) => [j.id, j.title]))

    // Resolve avatars only for the top `limit` people, not the whole pool.
    const data = await Promise.all(scored.map(async ({ p, m }) => ({
        applicationId: p.id,
        name: p.name,
        email: p.email,
        avatar: (await resolveAvatarUrl(p.avatarUrl)) ?? undefined,
        experience: p.experience ?? null,
        stage: p.stage,
        overall: m.overall,
        dimensions: m.dimensions,
        matchedSkills: m.matchedSkills,
        missingSkills: m.missingSkills,
        strengths: m.strengths,
        appliedJobs: [...p.appliedJobIds].map((id) => ({ id, title: titleById.get(id) ?? '—' })),
    })))

    return { data, capped, scanned: apps.length }
}

/**
 * Recommend open jobs for a candidate — score the candidate's profile against
 * every OPEN job in the tenant (excluding the one they already applied to) and
 * return the best fits. Lets a recruiter move a strong applicant into another
 * pipeline without re-sourcing.
 */
export async function recommendJobsForCandidate(tenantId: string, applicationId: string, limit = 10) {
    const [cand] = await db.select({
        id: jobApplications.id,
        jobId: jobApplications.jobId,
        skills: jobApplications.skills,
        educationHistory: jobApplications.educationHistory,
        experienceHistory: jobApplications.experienceHistory,
        address: jobApplications.address,
        nationality: jobApplications.nationality,
    }).from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId), isNull(jobApplications.deletedAt)))
        .limit(1)
    if (!cand) return null

    const jobs = await db.select({
        id: recruitmentJobs.id,
        title: recruitmentJobs.title,
        department: recruitmentJobs.department,
        location: recruitmentJobs.location,
        workplaceType: recruitmentJobs.workplaceType,
        type: recruitmentJobs.type,
        skills: recruitmentJobs.skills,
        qualifications: recruitmentJobs.qualifications,
        industry: recruitmentJobs.industry,
    }).from(recruitmentJobs)
        .where(and(
            eq(recruitmentJobs.tenantId, tenantId),
            eq(recruitmentJobs.status, 'open'),
            isNull(recruitmentJobs.deletedAt),
            ne(recruitmentJobs.id, cand.jobId),
        ))
        .limit(500)

    const data = jobs
        .map((j) => ({ j, m: scoreMatch(j, cand) }))
        .filter((x) => x.m.overall > 0 && x.m.matchedSkills.length > 0)
        .sort((a, b) => b.m.overall - a.m.overall)
        .slice(0, limit)
        .map(({ j, m }) => ({
            jobId: j.id,
            title: j.title,
            department: j.department,
            location: j.location,
            workplaceType: j.workplaceType,
            type: j.type,
            overall: m.overall,
            dimensions: m.dimensions,
            matchedSkills: m.matchedSkills,
            missingSkills: m.missingSkills,
            strengths: m.strengths,
        }))

    return { data }
}
