import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiBase } from '@/lib/apiBase'
import { useAuthStore } from '@/store/authStore'

export type ReviewStatus = 'draft' | 'submitted' | 'acknowledged' | 'completed'

export interface PerformanceReview {
    id: string
    period: string
    reviewDate: string | null
    status: ReviewStatus
    overallRating: number | null
    qualityScore: number | null
    productivityScore: number | null
    teamworkScore: number | null
    attendanceScore: number | null
    initiativeScore: number | null
    strengths: string | null
    improvements: string | null
    goals: string | null
    managerComments: string | null
    employeeComments: string | null
    createdAt: string
    reviewerName: string | null
}

// Reviews and warnings change slowly — bump the freshness window to keep the
// portal snappy and reduce admin-API hits.
const REVIEW_STALE_TIME = 5 * 60 * 1000

export function useMyReviews() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'my-reviews', tenantId],
        queryFn: () => api.get<{ data: PerformanceReview[] }>('/performance/my').then((r) => r.data),
        enabled: !!tenantId,
        staleTime: REVIEW_STALE_TIME,
    })
}

export function useEmployeeReviews(employeeId: string | undefined) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'employee-reviews', tenantId, employeeId],
        queryFn: () =>
            api.get<{ data: PerformanceReview[] }>(`/performance/employee/${employeeId}`).then((r) => r.data),
        enabled: !!tenantId && !!employeeId,
        staleTime: REVIEW_STALE_TIME,
    })
}

export interface Warning {
    id: string
    issueDate: string
    expiryDate: string | null
    reason: string | null
    documentFileName: string | null
    hasFile: boolean
    createdByName: string | null
    createdAt: string
}

export function useMyWarnings() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'my-warnings', tenantId],
        queryFn: () => api.get<{ data: Warning[] }>('/performance/warnings/my').then((r) => r.data),
        enabled: !!tenantId,
        staleTime: REVIEW_STALE_TIME,
    })
}

export function useEmployeeWarnings(employeeId: string | undefined) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'employee-warnings', tenantId, employeeId],
        queryFn: () =>
            api.get<{ data: Warning[] }>(`/performance/warnings/employee/${employeeId}`).then((r) => r.data),
        enabled: !!tenantId && !!employeeId,
        staleTime: REVIEW_STALE_TIME,
    })
}

/**
 * Same redirect-following download pattern as `triggerDocumentDownload` —
 * we need to send the Authorization header on the first hop, then let the
 * browser follow the 302 to the presigned S3 URL.
 */
export async function triggerWarningDownload(id: string): Promise<void> {
    const token = useAuthStore.getState().accessToken
    if (!token) throw new Error('Not signed in')

    const res = await fetch(`${apiBase}/performance/warnings/${id}/download`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'follow',
    })
    if (res.ok && res.url) {
        window.location.assign(res.url)
        return
    }
    const errBody = await res.json().catch(() => ({}))
    throw new Error((errBody as { message?: string })?.message ?? `Download failed (${res.status})`)
}
