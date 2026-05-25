import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'

export function AppShell() {
    return (
        // IMPORTANT: this wrapper must NOT have `overflow-x-hidden` (or any
        // `overflow` value). `position: sticky` on descendants — including
        // TopBar's `sticky top-0` and SideNav's `sticky top-24` — gets killed
        // by any overflow ancestor. Horizontal-overflow clipping is handled
        // via `body { overflow-x: clip }` in index.css instead, which doesn't
        // create a scroll container so sticky still works.
        <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-sky-50/60 dark:from-slate-950 dark:via-indigo-950/20 dark:to-sky-950/10">
            {/* Soft background shapes — `fixed inset-0` so they never add to
                page scroll width on their own. */}
            <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute -left-40 top-20 size-96 rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-500/10" />
                <div className="absolute right-[-8rem] top-1/3 size-80 rounded-full bg-sky-300/25 blur-3xl dark:bg-sky-500/10" />
            </div>

            <TopBar />

            {/* Responsive container — grows in tiers so we use the screen
                without letting line lengths get unreadable:
                  base mobile : edge-to-edge
                  sm         : 6xl  (1152px)
                  xl         : 7xl  (1280px)
                  2xl        : 1536
                  3xl (TV)   : 1760  */}
            <div className="mx-auto flex max-w-6xl xl:max-w-7xl 2xl:max-w-[1536px] 3xl:max-w-[1760px] gap-6 xl:gap-8 px-4 pb-28 pt-6 sm:px-6 md:pb-12">
                <SideNav />
                <main className="min-w-0 flex-1 page-slide-up">
                    <Outlet />
                </main>
            </div>

            <BottomNav />
        </div>
    )
}
