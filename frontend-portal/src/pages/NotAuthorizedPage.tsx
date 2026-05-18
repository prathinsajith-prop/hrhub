import { useTranslation } from 'react-i18next'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { ADMIN_APP_URL } from '@/lib/routes'

export function NotAuthorizedPage() {
    const { t } = useTranslation()
    const logout = useAuthStore((s) => s.logout)
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 px-4 dark:from-slate-950 dark:to-indigo-950/30">
            <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 text-center shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-card/70">
                <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                    <ShieldAlert className="size-7" />
                </div>
                <h1 className="font-display text-xl font-semibold">{t('notAuthorized.title')}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{t('notAuthorized.body')}</p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button asChild className="w-full sm:w-auto">
                        <a href={ADMIN_APP_URL} target="_blank" rel="noreferrer">
                            {t('notAuthorized.openAdmin')}
                        </a>
                    </Button>
                    <Button variant="outline" onClick={logout} className="w-full sm:w-auto">
                        {t('auth.signOut')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
