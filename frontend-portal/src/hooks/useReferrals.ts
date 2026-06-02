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
    resume?: File | null
    /** Candidate photo auto-extracted from the résumé (optional). */
    photo?: Blob | null
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
            if (body.resume) fd.append('resume', body.resume)
            if (body.photo) fd.append('photo', body.photo, 'photo.jpg')
            return api.upload<{ data: MyReferral }>('/referrals', fd).then((r) => r.data)
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'referrals'] })
        },
    })
}
