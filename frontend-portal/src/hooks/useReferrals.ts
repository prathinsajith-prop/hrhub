import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export interface ReferralJob {
    id: string
    jobNo: string | null
    title: string
    department: string | null
    location: string | null
    type: 'full_time' | 'part_time' | 'contract'
    openings: number
}

export interface MyReferral {
    id: string
    jobId: string
    jobNo: string | null
    jobTitle: string | null
    candidateName: string
    candidateEmail: string
    candidatePhone: string | null
    relationship: string | null
    notes: string | null
    hasResume: boolean
    createdAt: string
    jobApplicationId: string | null
    /** Live pipeline stage key of the referred candidate (null if removed). */
    stage: string | null
}

export interface SubmitReferralBody {
    jobId: string
    candidateName: string
    candidateEmail: string
    candidatePhone?: string
    relationship?: string
    notes?: string
    // Extended candidate profile (migration 0081) — same shape as the public
    // careers apply form so HR sees one consistent candidate record regardless
    // of source.
    nationality?: string
    address?: string
    gender?: '' | 'male' | 'female' | 'other' | 'prefer_not_to_say'
    /** Years of relevant experience — sent as a string so the multipart parser
     *  can coerce defensively on the server. */
    experience?: string
    expectedSalary?: string
    currentSalary?: string
    /** Candidate skill tags — sent JSON-stringified through multipart. */
    skills?: string[]
    educationHistory?: Array<{ school: string; degree?: string; fieldOfStudy?: string; startDate?: string; endDate?: string; current?: boolean; summary?: string }>
    experienceHistory?: Array<{ title: string; company?: string; industry?: string; summary?: string; startDate?: string; endDate?: string; current?: boolean }>
    resume?: File | null
    /** Candidate photo auto-extracted from the résumé (optional). */
    photo?: Blob | null
}

/**
 * Skill / qualification catalog for the tenant — powers the referral form's
 * type-ahead. Read-only: the catalog is curated by the admin job screens, so the
 * referral form suggests from it but never adds to it.
 */
export function useReferralTagSuggestions() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'referral-tag-suggestions', tenantId],
        queryFn: () =>
            api.get<{ data: { skills: string[]; qualifications: string[] } }>('/referrals/tag-suggestions').then((r) => r.data),
        enabled: !!tenantId,
        staleTime: 5 * 60_000,
    })
}

/**
 * Open jobs the employee can refer against. `q` drives the searchable select —
 * the server filters by title / job number so the dropdown stays light.
 */
export function useReferralJobs(q: string) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    const query = q.trim()
    return useQuery({
        queryKey: ['portal', 'referral-jobs', tenantId, query],
        queryFn: () =>
            api.get<{ data: ReferralJob[] }>(`/referrals/jobs${query ? `?q=${encodeURIComponent(query)}` : ''}`).then((r) => r.data),
        enabled: !!tenantId,
        // Keep prior matches visible while the next keystroke's request is inflight.
        placeholderData: (prev) => prev,
    })
}

/** The caller's own referrals, with the live stage of each referred candidate. */
export function useMyReferrals() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'referrals', tenantId],
        queryFn: () => api.get<{ data: MyReferral[] }>('/referrals').then((r) => r.data),
        enabled: !!tenantId,
    })
}

export function useSubmitReferral() {
    const qc = useQueryClient()
    return useMutation({
        // Multipart so an optional resume file rides along with the fields.
        mutationFn: (body: SubmitReferralBody) => {
            const fd = new FormData()
            fd.append('jobId', body.jobId)
            fd.append('candidateName', body.candidateName)
            fd.append('candidateEmail', body.candidateEmail)
            if (body.candidatePhone) fd.append('candidatePhone', body.candidatePhone)
            if (body.relationship) fd.append('relationship', body.relationship)
            if (body.notes) fd.append('notes', body.notes)
            if (body.nationality) fd.append('nationality', body.nationality)
            if (body.address) fd.append('address', body.address)
            if (body.gender) fd.append('gender', body.gender)
            if (body.experience) fd.append('experience', body.experience)
            if (body.expectedSalary) fd.append('expectedSalary', body.expectedSalary)
            if (body.currentSalary) fd.append('currentSalary', body.currentSalary)
            // Arrays travel as JSON strings — multipart values are strings only.
            if (body.skills && body.skills.length > 0) {
                fd.append('skills', JSON.stringify(body.skills))
            }
            if (body.educationHistory && body.educationHistory.length > 0) {
                fd.append('educationHistory', JSON.stringify(body.educationHistory))
            }
            if (body.experienceHistory && body.experienceHistory.length > 0) {
                fd.append('experienceHistory', JSON.stringify(body.experienceHistory))
            }
            if (body.resume) fd.append('resume', body.resume)
            if (body.photo) fd.append('photo', body.photo, 'photo.jpg')
            return api.upload<{ data: MyReferral }>('/referrals', fd).then((r) => r.data)
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'referrals'] })
        },
    })
}
