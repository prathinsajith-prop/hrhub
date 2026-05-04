import { QueryClient, MutationCache } from '@tanstack/react-query'
import { ApiError } from './api'
import { toast } from '@/components/ui/overlays'

// Global fallback: show a generic error toast for any mutation that doesn't
// define its own onError handler. Mutations with onError handle their own UX.
const mutationCache = new MutationCache({
    onError: (error, _variables, _context, mutation) => {
        if (mutation.options.onError) return   // already handled by the mutation itself
        const message =
            error instanceof ApiError
                ? error.message
                : error instanceof Error
                    ? error.message
                    : 'Something went wrong. Please try again.'
        toast.error('Action failed', message)
    },
})

export const queryClient = new QueryClient({
    mutationCache,
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: (failureCount, error) => {
                if (error instanceof ApiError && error.statusCode < 500) return false
                return failureCount < 2
            },
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,   // re-fetch stale data when network recovers
        },
        mutations: {
            retry: false,
        },
    },
})
