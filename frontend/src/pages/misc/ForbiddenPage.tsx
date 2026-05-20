import { useNavigate } from 'react-router-dom'
import { ShieldOffIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function ForbiddenPage() {
    const navigate = useNavigate()
    const { t } = useTranslation()

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
            <ShieldOffIcon className="size-16 text-muted-foreground/30" />
            <div className="space-y-1">
                <p className="text-8xl font-bold text-muted-foreground/20 select-none">403</p>
                <h1 className="text-2xl font-semibold">{t('errors.accessDenied')}</h1>
                <p className="text-sm text-muted-foreground">
                    {t('errors.forbidden')}
                </p>
            </div>
            <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
                {t('errors.backToHome')}
            </button>
        </div>
    )
}
