// ─────────────────────────────────────────────────────────────────────────────
// Candidate ⇄ Job matching engine (pure core).
//
// Deterministic, explainable, dependency-free (no DB / no S3) so it is trivially
// unit-testable and reusable across the recommendation queries, the future
// match-breakdown UI (P1), and batch scoring. Given a job's requirements and a
// candidate's profile it returns an overall 0–100 score, a per-dimension
// breakdown, and matched / missing skills + human-readable strengths so a
// recruiter understands WHY a score exists.
//
// Only dimensions with data on BOTH sides are "applicable"; weights are
// renormalised over the applicable set, so a job that lists no qualifications
// isn't penalised for it. Skills overlap is the dominant signal (the richest
// data we have today); experience-threshold / certification / language
// dimensions are deferred until the job-requirement schema grows (P1/P2) — the
// engine is structured so adding a dimension is a localized change.
// ─────────────────────────────────────────────────────────────────────────────

/** A small built-in synonym map so obvious aliases collapse before comparison.
 *  P2 will replace this with the tenant-curated skill catalog + aliases. */
const SYNONYMS: Record<string, string> = {
    js: 'javascript',
    'java script': 'javascript',
    reactjs: 'react',
    'react.js': 'react',
    node: 'node.js',
    nodejs: 'node.js',
    'node js': 'node.js',
    ts: 'typescript',
    postgres: 'postgresql',
    psql: 'postgresql',
    'c#': 'csharp',
    'c sharp': 'csharp',
    py: 'python',
    'tailwind css': 'tailwind',
    tailwindcss: 'tailwind',
    k8s: 'kubernetes',
    gcp: 'google cloud',
}

function norm(s: string): string {
    const t = (s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
    return SYNONYMS[t] ?? t
}

function uniqNorm(list: string[] | null | undefined): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of list ?? []) {
        const n = norm(raw)
        if (n && !seen.has(n)) {
            seen.add(n)
            out.push(n)
        }
    }
    return out
}

// Free-text helpers for the location/qualification dimensions. Unlike skill
// `norm` (which preserves meaningful punctuation like "node.js"/"c#" so the
// synonym map can do its job), these strip punctuation to plain words so token
// matching isn't defeated by a stray comma (e.g. "Dubai, UAE" → "dubai uae").
function cleanText(s: string): string {
    return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}
function words(s: string): string[] {
    return cleanText(s).split(' ').filter((w) => w.length >= 3)
}

export interface MatchJob {
    skills?: string[] | null
    qualifications?: string[] | null
    industry?: string | null
    location?: string | null
    workplaceType?: string | null
}

export interface MatchCandidate {
    skills?: string[] | null
    educationHistory?: Array<{ degree?: string; fieldOfStudy?: string }> | null
    experienceHistory?: Array<{ industry?: string }> | null
    address?: string | null
    nationality?: string | null
}

export interface MatchResult {
    overall: number
    dimensions: { skills?: number; qualification?: number; location?: number; industry?: number }
    matchedSkills: string[]
    missingSkills: string[]
    strengths: string[]
}

// Default dimension weights. Configurable per-tenant in a later phase (P1);
// kept in code for now. Only applicable dimensions contribute (renormalised).
const WEIGHTS = { skills: 0.6, qualification: 0.2, location: 0.1, industry: 0.1 } as const

export function scoreMatch(job: MatchJob, candidate: MatchCandidate): MatchResult {
    const dims: MatchResult['dimensions'] = {}
    const applicable: Array<{ key: keyof typeof WEIGHTS; value: number }> = []
    const strengths: string[] = []

    // ── Skills ──
    const jobSkillsNorm = uniqNorm(job.skills)
    const candSkillsNorm = new Set(uniqNorm(candidate.skills))
    const matchedSkills: string[] = []
    const missingSkills: string[] = []
    if (jobSkillsNorm.length > 0) {
        // Report in the job's original casing for readability; dedupe by it.
        for (const original of job.skills ?? []) {
            const n = norm(original)
            if (!n) continue
            if (candSkillsNorm.has(n)) {
                if (!matchedSkills.includes(original)) matchedSkills.push(original)
            } else if (!missingSkills.includes(original)) {
                missingSkills.push(original)
            }
        }
        const skillsScore = matchedSkills.length / jobSkillsNorm.length
        dims.skills = Math.round(skillsScore * 100)
        applicable.push({ key: 'skills', value: skillsScore })
        if (skillsScore >= 0.8) strengths.push(`Matches ${matchedSkills.length} of ${jobSkillsNorm.length} required skills`)
        else if (matchedSkills.length >= 2) strengths.push(`Strong overlap on ${matchedSkills.slice(0, 3).join(', ')}`)
    }

    // ── Qualification (loose token overlap of job quals vs candidate education) ──
    const jobQuals = job.qualifications ?? []
    if (jobQuals.length > 0) {
        const eduText = cleanText(
            (candidate.educationHistory ?? [])
                .map((e) => `${e.degree ?? ''} ${e.fieldOfStudy ?? ''}`)
                .join(' '),
        )
        let matchedQuals = 0
        for (const q of jobQuals) {
            const qWords = words(q)
            if (qWords.length && qWords.some((tok) => eduText.includes(tok))) matchedQuals++
        }
        const qScore = matchedQuals / jobQuals.length
        dims.qualification = Math.round(qScore * 100)
        applicable.push({ key: 'qualification', value: qScore })
        if (qScore >= 0.6) strengths.push('Relevant qualifications')
    }

    // ── Location / workplace ──
    if (job.workplaceType === 'remote') {
        dims.location = 100
        applicable.push({ key: 'location', value: 1 })
    } else if (job.location && job.location.trim()) {
        const candLoc = cleanText(`${candidate.address ?? ''} ${candidate.nationality ?? ''}`)
        const hit = words(job.location).some((tok) => candLoc.includes(tok))
        const locScore = hit ? 1 : 0.4 // soft — relocation is possible
        dims.location = Math.round(locScore * 100)
        applicable.push({ key: 'location', value: locScore })
        if (hit) strengths.push('Located in the job area')
    }

    // ── Industry ──
    if (job.industry && job.industry.trim()) {
        const candIndustries = new Set(uniqNorm((candidate.experienceHistory ?? []).map((e) => e.industry ?? '')))
        if (candIndustries.size > 0) {
            const hit = candIndustries.has(norm(job.industry))
            dims.industry = hit ? 100 : 0
            applicable.push({ key: 'industry', value: hit ? 1 : 0 })
            if (hit) strengths.push(`Industry experience in ${job.industry}`)
        }
    }

    // ── Overall (weights renormalised over applicable dimensions) ──
    const totalWeight = applicable.reduce((s, d) => s + WEIGHTS[d.key], 0)
    const overall = totalWeight > 0
        ? Math.round((applicable.reduce((s, d) => s + WEIGHTS[d.key] * d.value, 0) / totalWeight) * 100)
        : 0

    return { overall, dimensions: dims, matchedSkills, missingSkills, strengths }
}
