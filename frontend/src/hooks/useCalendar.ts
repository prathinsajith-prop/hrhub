import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface CalendarRange {
    from: string
    to: string
}

export interface CalendarEvents {
    visas: Record<string, unknown>[]
    documents: Record<string, unknown>[]
    leaves: Record<string, unknown>[]
    reviews: Record<string, unknown>[]
    holidays: { id: string; name: string; date: string; isRecurring?: boolean }[]
}

export function useCalendarEvents(range: CalendarRange | undefined) {
    const params = range ? `from=${range.from}&to=${range.to}` : ''
    return useQuery({
        queryKey: ['calendar', range?.from, range?.to],
        queryFn: () => api.get<CalendarEvents>(`/calendar?${params}`),
        enabled: !!range,
        staleTime: 60_000,
    })
}
