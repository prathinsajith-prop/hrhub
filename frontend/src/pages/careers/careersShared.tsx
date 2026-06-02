/**
 * Shared building blocks for the public careers portal.
 *
 * Design: a refined, editorial recruiting surface. No sidebar, no auth — a
 * branded shell with an atmospheric (CSS-only) background, a translucent sticky
 * header, and a quiet footer. Everything rides HRHub's design tokens, so dark
 * mode, RTL (Cairo), and theming work with zero extra dependencies.
 */
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

// Atmosphere: a soft primary glow near the top + a faint dotted grid. Pure CSS,
// no images — costs nothing to download and adapts to light/dark via tokens.
const ATMOSPHERE: CSSProperties = {
    backgroundImage:
        'radial-gradient(62% 360px at 50% -60px, hsl(var(--primary) / 0.13), transparent 70%), ' +
        'radial-gradient(hsl(var(--foreground) / 0.04) 1px, transparent 1px)',
    backgroundSize: '100% 100%, 22px 22px',
    backgroundRepeat: 'no-repeat, repeat',
    backgroundAttachment: 'fixed, scroll',
}

export function PublicShell({ company, children }: { company?: string; children: ReactNode }) {
    const { t } = useTranslation()
    const monogram = (company?.trim()?.[0] ?? '★').toUpperCase()
    return (
        <div className="relative flex min-h-screen flex-col bg-background text-foreground" style={ATMOSPHERE}>
            <header className="sticky top-0 z-20 border-b border-border/60 bg-background/75 backdrop-blur-md">
                <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary font-display text-sm font-semibold text-primary-foreground shadow-sm">
                        {monogram}
                    </span>
                    <div className="min-w-0 leading-tight">
                        <div className="truncate font-display text-sm font-semibold tracking-tight">{company || t('careers.openPositions')}</div>
                        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{t('careers.careers')}</div>
                    </div>
                </div>
            </header>
            <main className="relative z-10 flex-1">{children}</main>
            <footer className="relative z-10 border-t border-border/60">
                <div className="mx-auto max-w-5xl px-5 py-5 text-center text-[11px] tracking-wide text-muted-foreground">
                    {t('careers.poweredBy')}
                </div>
            </footer>
        </div>
    )
}

export function CareersError({ title, hint }: { title: string; hint: string }) {
    return (
        <PublicShell>
            <div className="mx-auto flex max-w-md flex-col items-center px-5 py-24 text-center">
                <div className="grid size-12 place-items-center rounded-2xl border bg-card text-muted-foreground shadow-sm">
                    <span className="font-display text-xl">!</span>
                </div>
                <h1 className="mt-5 font-display text-lg font-semibold tracking-tight">{title}</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>
            </div>
        </PublicShell>
    )
}
