import React from 'react'
import { BuildingIcon, Headphones } from 'lucide-react'

interface AuthLayoutProps {
  heroEyebrow?: string
  heroTitle: React.ReactNode
  heroSubtitle?: string
  heroContent?: React.ReactNode
  children: React.ReactNode
}

export function AuthLayout({
  heroEyebrow,
  heroTitle,
  heroSubtitle,
  heroContent,
  children,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[55%_45%] bg-background">

      {/* ── Brand panel ── */}
      <aside className="hidden lg:flex flex-col justify-between relative overflow-hidden text-white bg-sidebar">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <header className="relative px-10 pt-9 xl:px-12">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground">
              <BuildingIcon className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-base font-bold text-white font-display leading-none">HRHub.ae</p>
              <p className="text-[11px] text-white/55 tracking-wide mt-0.5">UAE HR &amp; PRO Platform</p>
            </div>
          </div>
        </header>

        <div className="relative flex-1 flex flex-col justify-center px-10 py-8 xl:px-12">
          {heroEyebrow && (
            <p className="text-[11px] font-semibold text-primary tracking-widest uppercase mb-3">
              {heroEyebrow}
            </p>
          )}
          <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-3 font-display text-balance">
            {heroTitle}
          </h1>
          {heroSubtitle && (
            <p className="text-white/65 text-sm leading-relaxed max-w-sm mb-7 text-pretty">
              {heroSubtitle}
            </p>
          )}
          {heroContent}
        </div>

        <footer className="relative px-10 pb-7 xl:px-12 text-[11px] text-white/35">
          &copy; 2026 HRHub.ae &middot; Trusted by 500+ UAE companies &middot; ISO 27001
        </footer>
      </aside>

      {/* ── Form panel ── */}
      <main className="relative flex flex-col bg-muted/30">

        {/* Subtle radial halo */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 h-[420px] w-[420px] rounded-full bg-primary/[0.05] blur-[120px]"
        />

        {/* Top bar — trust badge left, help right */}
        <div className="relative z-10 flex items-center justify-between px-8 sm:px-12 py-4">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:invisible">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <BuildingIcon className="h-3.5 w-3.5" />
            </div>
            <p className="text-sm font-bold text-foreground font-display">HRHub.ae</p>
          </div>

          <a
            href="mailto:support@hrhub.ae"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Headphones className="h-3.5 w-3.5" />
            Need help?
          </a>
        </div>

        {/* Form area */}
        <div className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 sm:px-8 py-8">
          <div className="w-full max-w-lg">
            {/* Card */}
            <div className="rounded-2xl border border-border bg-background shadow-sm shadow-black/5 px-8 py-8">
              {children}
            </div>
          </div>
        </div>

        {/* Security trust badges */}
        <div className="relative z-10 flex items-center justify-center gap-6 px-8 py-3 border-t border-border/50 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            MOHRE Compliant
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /></svg>
            WPS Ready
          </span>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            500+ Companies
          </span>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-center gap-3 px-8 py-3 text-[11px] text-muted-foreground/50">
          <span>&copy; 2026 HRHub.ae</span>
          <span className="text-border">·</span>
          <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
          <span className="text-border">·</span>
          <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          <span className="text-border">·</span>
          <span>v1.0</span>
        </div>

      </main>
    </div>
  )
}

