import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'
import { SideNav } from './SideNav'

export function AppShell() {
    return (
        <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-sky-50/60 dark:from-slate-950 dark:via-indigo-950/20 dark:to-sky-950/10">
            {/* Soft background shapes */}
            <div className="pointer-events-none fixed inset-0 -z-10">
                <div className="absolute -left-40 top-20 size-96 rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-500/10" />
                <div className="absolute right-[-8rem] top-1/3 size-80 rounded-full bg-sky-300/25 blur-3xl dark:bg-sky-500/10" />
            </div>

            <TopBar />

            <div className="mx-auto flex max-w-6xl gap-6 px-4 pb-28 pt-6 sm:px-6 md:pb-12">
                <SideNav />
                <main className="min-w-0 flex-1 page-slide-up">
                    <Outlet />
                </main>
            </div>

            <BottomNav />
        </div>
    )
}
