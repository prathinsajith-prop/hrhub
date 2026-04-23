import React from 'react'
import { BuildingIcon } from 'lucide-react'

interface AuthLayoutProps {
  /** Headline on the brand panel (visible on lg screens) */
  heroEyebrow?: string
  heroTitle: React.ReactNode
  heroSubtitle?: string
  /** Optional content rendered under the subtitle (stats, feature grid) */
  heroContent?: React.ReactNode
  /** Form column content */
  children: React.ReactNode
}

/**
 * Split-screen auth layout used by Login and Register.
 *
 * - Fully responsive: on < lg screens the brand panel collapses to a slim
 *   header row and the form takes the full viewport.
 * - No gradients on primary elements; the dark navy brand panel is a flat
 *   sidebar-token color with a single, very subtle radial accent.
 */
export function AuthLayout({
  heroEyebrow,
  heroTitle,
  heroSubtitle,
  heroContent,
  children,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* ── Brand panel ── */}
      <aside
        className="hidden lg:flex flex-col justify-between relative overflow-hidden text-white bg-sidebar"
      >
        {/* Layered brand gradient \u2014 matches sidebar, with depth */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(1100px 600px at -10% -10%, hsl(var(--primary) / 0.45) 0%, transparent 55%), radial-gradient(900px 500px at 110% 110%, hsl(199 89% 48% / 0.28) 0%, transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        {/* Logo */}
        <header className="relative p-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
              <BuildingIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-white font-display">
                HRHub.ae
              </p>
              <p className="text-[11px] text-white/60 tracking-wide">
                UAE HR &amp; PRO Platform
              </p>
            </div>
          </div>
        </header>

        {/* Hero */}
        <div className="relative flex-1 flex flex-col justify-center px-10 pb-10 max-w-xl">
          {heroEyebrow && (
            <p className="text-xs font-semibold text-primary tracking-widest uppercase mb-3">
              {heroEyebrow}
            </p>
          )}
          <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-4 font-display text-balance">
            {heroTitle}
          </h1>
          {heroSubtitle && (
            <p className="text-white/70 text-[15px] leading-relaxed max-w-md mb-8 text-pretty">
              {heroSubtitle}
            </p>
          )}
          {heroContent}
        </div>

        <footer className="relative px-10 pb-8 text-[11px] text-white/40">
          &copy; 2026 HRHub.ae &middot; Trusted by 500+ UAE companies &middot; ISO 27001
        </footer>
      </aside>

      {/* ── Form panel ── */}
      <main className="flex items-center justify-center p-6 sm:p-8 relative">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo bar */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
              <BuildingIcon className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold text-foreground font-display">HRHub.ae</p>
          </div>

          {children}
        </div>
      </main>
    </div>
  )
}
