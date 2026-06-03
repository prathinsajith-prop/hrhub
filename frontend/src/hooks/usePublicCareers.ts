/**
 * Data hooks for the public careers portal (/careers/:companyCode).
 * Uses the unauthenticated `publicApi` client — no JWT, no auth-store coupling.
 */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, type InfiniteData } from '@tanstack/react-query'
import { publicApi } from '@/lib/publicApi'

const JOBS_PAGE_SIZE = 25

export interface PublicJob {
    id: string
    jobNo: string | null
    title: string
    department: string | null
    location: string | null
    type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'freelance'
    workplaceType: 'on_site' | 'hybrid' | 'remote'
    openings: number
    minSalary: string | null
    maxSalary: string | null
    industry: string | null
    description: string | null
    requirements: string[]
    skills: string[]
    qualifications: string[]
    closingDate: string | null
    createdAt: string
}

export interface PublicCompany {
    name: string
    companyCode: string | null
}

export interface ApplyInput {
    name: string
    email: string
    phone?: string
    nationality?: string
    address?: string
    gender?: '' | 'male' | 'female' | 'other' | 'prefer_not_to_say'
    experience?: string
    expectedSalary?: string
    currentSalary?: string
    coverNote?: string
    /** Schools attended — sent JSON-stringified through multipart. */
    educationHistory?: Array<{ school: string; degree?: string; fieldOfStudy?: string; startDate?: string; endDate?: string; current?: boolean; summary?: string }>
    /** Past roles — sent JSON-stringified through multipart. */
    experienceHistory?: Array<{ title: string; company?: string; industry?: string; summary?: string; startDate?: string; endDate?: string; current?: boolean }>
    resume: File
    /** Candidate photo auto-extracted from the résumé (optional). */
    photo?: Blob | null
}

export interface PublicJobsPage {
    data: {
        company: PublicCompany
        jobs: PublicJob[]
        total: number
        limit: number
        offset: number
        hasMore: boolean
    }
}

export interface JobFilters {
    q?: string
    department?: string
    location?: string
    type?: string
    workplaceType?: string
}

export interface PublicJobFacets {
    departments: string[]
    locations: string[]
    types: string[]
    workplaceTypes: string[]
}

const enc = encodeURIComponent

/**
 * Infinite, filterable list of open jobs — 25 per page, fetched from the API as
 * the user scrolls. Changing a filter swaps the query key, so pagination resets
 * cleanly and the server re-filters from offset 0.
 */
export function usePublicJobs(companyCode: string, filters: JobFilters = {}) {
    const { q, department, location, type, workplaceType } = filters
    return useInfiniteQuery<PublicJobsPage, Error, InfiniteData<PublicJobsPage>, readonly ['public-jobs', string, JobFilters], number>({
        queryKey: ['public-jobs', companyCode, { q, department, location, type, workplaceType }],
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams({ limit: String(JOBS_PAGE_SIZE), offset: String(pageParam) })
            if (q) qs.set('q', q)
            if (department) qs.set('department', department)
            if (location) qs.set('location', location)
            if (type) qs.set('type', type)
            if (workplaceType) qs.set('workplaceType', workplaceType)
            return publicApi.get<PublicJobsPage>(`/public/careers/${enc(companyCode)}/jobs?${qs}`)
        },
        initialPageParam: 0,
        getNextPageParam: (last) => (last.data.hasMore ? last.data.offset + last.data.limit : undefined),
        placeholderData: keepPreviousData,
        enabled: !!companyCode,
        staleTime: 60_000,
        retry: false,
    })
}

/** Distinct filter options (departments, locations, types) for the company. */
export function usePublicJobFacets(companyCode: string) {
    return useQuery({
        queryKey: ['public-job-facets', companyCode],
        queryFn: () => publicApi.get<{ data: PublicJobFacets }>(`/public/careers/${enc(companyCode)}/facets`),
        enabled: !!companyCode,
        staleTime: 5 * 60_000,
        retry: false,
    })
}

export function usePublicJob(companyCode: string, jobId: string) {
    return useQuery({
        queryKey: ['public-job', companyCode, jobId],
        queryFn: () => publicApi.get<{ data: { company: PublicCompany; job: PublicJob } }>(`/public/careers/${enc(companyCode)}/jobs/${enc(jobId)}`),
        enabled: !!companyCode && !!jobId,
        staleTime: 60_000,
        retry: false,
    })
}

export function useApplyToJob(companyCode: string, jobId: string) {
    return useMutation({
        mutationFn: (input: ApplyInput) => {
            const fd = new FormData()
            fd.append('name', input.name)
            fd.append('email', input.email)
            if (input.phone) fd.append('phone', input.phone)
            if (input.nationality) fd.append('nationality', input.nationality)
            if (input.address) fd.append('address', input.address)
            if (input.gender) fd.append('gender', input.gender)
            if (input.experience) fd.append('experience', input.experience)
            if (input.expectedSalary) fd.append('expectedSalary', input.expectedSalary)
            if (input.currentSalary) fd.append('currentSalary', input.currentSalary)
            if (input.coverNote) fd.append('coverNote', input.coverNote)
            // Arrays travel as JSON strings — multipart values are strings only.
            if (input.educationHistory && input.educationHistory.length > 0) {
                fd.append('educationHistory', JSON.stringify(input.educationHistory))
            }
            if (input.experienceHistory && input.experienceHistory.length > 0) {
                fd.append('experienceHistory', JSON.stringify(input.experienceHistory))
            }
            fd.append('resume', input.resume)
            if (input.photo) fd.append('photo', input.photo, 'photo.jpg')
            return publicApi.upload<{ data: { id: string } }>(`/public/careers/${enc(companyCode)}/jobs/${enc(jobId)}/apply`, fd)
        },
    })
}
