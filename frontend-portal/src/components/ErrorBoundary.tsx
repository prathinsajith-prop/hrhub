import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { isChunkLoadError, tryReloadForChunkError } from '@/lib/chunkReload'

interface State {
    error: Error | null
}

/**
 * Top-level boundary that swallows render-time exceptions from any child route
 * so a crashing page never shows the user a blank screen. Renders a recoverable
 * fallback with a "Reload" button and (in dev) the error stack.
 *
 * Class component on purpose — React 19's hook-based errorboundary helpers
 * are still proposal-stage. componentDidCatch + getDerivedStateFromError is
 * the canonical, stable API.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
    state: State = { error: null }

    static getDerivedStateFromError(error: Error): State {
        return { error }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Stale-deploy recovery — a Vite chunk hash referenced by the old
        // index.html no longer exists on the CDN. Reload once so the new
        // index.html is fetched.
        if (isChunkLoadError(error) && tryReloadForChunkError()) return

        // Production: send to your error tracker. In v1 we just log to the console.
        console.error('[portal] uncaught render error:', error, info.componentStack)
    }

    handleReset = () => {
        this.setState({ error: null })
    }

    handleReload = () => {
        window.location.reload()
    }

    render() {
        if (!this.state.error) return this.props.children

        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-rose-50/40 to-amber-50 px-4 py-10 dark:from-slate-950 dark:via-rose-950/20 dark:to-amber-950/20">
                <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/85 p-8 text-center shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-card/80">
                    <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        <AlertCircle className="size-7" />
                    </div>
                    <h1 className="font-display text-xl font-semibold tracking-tight">Something went wrong</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        The page hit an unexpected error. You can try to recover, or reload the app to start fresh.
                    </p>
                    {import.meta.env.DEV ? (
                        <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-muted/60 p-3 text-start text-[11px] text-foreground/80">
                            {this.state.error.message}
                            {'\n'}
                            {this.state.error.stack?.split('\n').slice(0, 6).join('\n')}
                        </pre>
                    ) : null}
                    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                        <button
                            type="button"
                            onClick={this.handleReset}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted"
                        >
                            Try again
                        </button>
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                            <RefreshCw className="size-4" /> Reload
                        </button>
                    </div>
                </div>
            </div>
        )
    }
}
