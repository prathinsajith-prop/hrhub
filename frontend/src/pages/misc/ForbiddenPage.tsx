import { useNavigate } from 'react-router-dom'
import { ShieldOffIcon } from 'lucide-react'

export function ForbiddenPage() {
    const navigate = useNavigate()

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
            <ShieldOffIcon className="h-16 w-16 text-muted-foreground/30" />
            <div className="space-y-1">
                <p className="text-8xl font-bold text-muted-foreground/20 select-none">403</p>
                <h1 className="text-2xl font-bold">Access Denied</h1>
                <p className="text-sm text-muted-foreground">
                    You don't have permission to view this page.
                </p>
            </div>
            <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
                Go to Dashboard
            </button>
        </div>
    )
}
