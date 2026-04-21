import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,         // 30 s
            gcTime: 5 * 60_000,        // 5 min
            retry: (failureCount, error) => {
                if (error instanceof ApiError && error.statusCode < 500) return false
                return failureCount < 2
            },
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: false,
        },
    },
})
