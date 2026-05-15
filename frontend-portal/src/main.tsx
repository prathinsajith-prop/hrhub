import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'

import App from './App'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './store/authStore'
import { ErrorBoundary } from './components/ErrorBoundary'
import './lib/i18n'
import './index.css'

// Clear React Query cache on logout to prevent stale state for the next sign-in.
let _wasAuthenticated = useAuthStore.getState().isAuthenticated
useAuthStore.subscribe((state) => {
    const now = state.isAuthenticated
    if (_wasAuthenticated && !now) queryClient.clear()
    _wasAuthenticated = now
})

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                    <BrowserRouter>
                        <App />
                        <Toaster richColors position="top-center" />
                    </BrowserRouter>
                </ThemeProvider>
            </QueryClientProvider>
        </ErrorBoundary>
    </React.StrictMode>,
)
