import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import App from './App'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './store/authStore'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import './lib/i18n'
import './index.css'

// Clear all cached query data when the user logs out so stale error states
// from a previous session don't flash on the next login.
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
          <App />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
