import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
    children: ReactNode
    fallback?: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Always surface to the console — in production this feeds into any
        // browser-side monitoring (DataDog RUM, Sentry, etc.) that reads
        // console.error. In dev it gives the full component stack inline.
        // eslint-disable-next-line no-console
        console.error('[ErrorBoundary]', error.message, {
            stack: error.stack,
            componentStack: info.componentStack,
        })
        // Wire to an error monitoring service:
        // Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
    }

    reset = () => this.setState({ hasError: false, error: null })

    render() {
        if (!this.state.hasError) return this.props.children

        if (this.props.fallback) return this.props.fallback

        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-destructive"
                        aria-hidden="true"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                </div>
                <div className="space-y-1">
                    <h2 className="text-xl font-semibold">Something went wrong</h2>
                    <p className="max-w-sm text-sm text-muted-foreground">
                        {this.state.error?.message ?? 'An unexpected error occurred.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={this.reset}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    Try again
                </button>
            </div>
        )
    }
}
