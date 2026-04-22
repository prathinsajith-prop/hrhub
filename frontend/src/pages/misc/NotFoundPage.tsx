import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
    const navigate = useNavigate()
    const { t } = useTranslation()

    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
            <div className="space-y-1">
                <p className="text-8xl font-bold text-muted-foreground/20 select-none">404</p>
                <h1 className="text-2xl font-bold">{t('errors.notFound')}</h1>
                <p className="text-sm text-muted-foreground">{t('errors.notFoundDesc')}</p>
            </div>
            <button
                type="button"
                onClick={() => navigate(-1)}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
                {t('common.back')}
            </button>
        </div>
    )
}
