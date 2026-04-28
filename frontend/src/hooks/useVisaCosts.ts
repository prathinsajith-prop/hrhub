import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type CostCategory = 'govt_fee' | 'medical' | 'typing' | 'translation' | 'other'

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
    govt_fee: 'Govt Fee',
    medical: 'Medical',
    typing: 'Typing',
    translation: 'Translation',
    other: 'Other',
}

export interface VisaCostItem {
    id: string
    visaApplicationId: string | null
    employeeId: string
    category: CostCategory
    description: string | null
    amount: number
    currency: string
    paidDate: string
    receiptRef: string | null
    stepNumber: number | null
    stepLabel: string | null
    createdAt: string
}

export interface AddCostInput {
    employeeId: string
    category: CostCategory
    description?: string
    amount: number
    paidDate: string
    receiptRef?: string
    /** Stage at which the cost was incurred (1-based step). */
    stepNumber?: number
    /** Human-readable label snapshot. */
    stepLabel?: string
}

export function useVisaCosts(visaApplicationId: string) {
    return useQuery({
        queryKey: ['visa', visaApplicationId, 'costs'],
        queryFn: () =>
            api.get<{ data: VisaCostItem[] }>(`/visa/${visaApplicationId}/costs`).then(r => r.data),
        enabled: !!visaApplicationId,
    })
}

export function useAddVisaCost(visaApplicationId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: AddCostInput) =>
            api.post<{ data: VisaCostItem }>(`/visa/${visaApplicationId}/costs`, input).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['visa', visaApplicationId, 'costs'] })
            qc.invalidateQueries({ queryKey: ['reports', 'pro-costs'] })
        },
    })
}

export function useDeleteVisaCost(visaApplicationId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (costId: string) =>
            api.delete(`/visa/costs/${costId}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['visa', visaApplicationId, 'costs'] })
            qc.invalidateQueries({ queryKey: ['reports', 'pro-costs'] })
        },
    })
}

// ─── PRO Cost Report ──────────────────────────────────────────────────────────

export interface CostReportEmployee {
    employeeId: string
    employeeName: string
    total: number
    count: number
    costs: VisaCostItem[]
}

export interface PROCostReport {
    ytdTotal: number
    avgPerEmployee: number
    totalTransactions: number
    byCategory: { label: string; total: number; count: number }[]
    byMonth: { period: string; total: number; count: number }[]
    byEmployee: CostReportEmployee[]
    recentCosts: (VisaCostItem & { employeeName: string })[]
}

export function usePROCostReport() {
    return useQuery({
        queryKey: ['reports', 'pro-costs'],
        queryFn: () =>
            api.get<{ data: PROCostReport }>('/reports/pro-costs').then(r => r.data),
        staleTime: 5 * 60_000,
    })
}
