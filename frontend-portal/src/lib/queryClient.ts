import { MutationCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api'

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
                if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) return false
                return failureCount < 1
            },
        },
        mutations: {
            retry: false,
        },
    },
    mutationCache: new MutationCache({
        onError: (error, _vars, _ctx, mutation) => {
            if (mutation.options.onError) return
            const message = error instanceof Error ? error.message : 'Something went wrong'
            toast.error(message)
        },
    }),
})
