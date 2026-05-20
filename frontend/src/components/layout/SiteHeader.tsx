import { useState, useMemo } from 'react'
import { SearchIcon, LogOut, UserIcon, Building2, ChevronRight, Check, SunIcon, MoonIcon, MonitorIcon, Loader2Icon, PlusIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { labelFor, ROLE_BADGE_STYLE, ROLE_LABELS } from '@/lib/enums'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { NotificationsBell } from '@/components/layout/NotificationsBell'
import { useAuthStore } from '@/store/authStore'
import { useMyTenants, useSwitchTenant } from '@/hooks/useTenants'
import { GlobalSearch } from '@/components/shared/GlobalSearch'
import { NewOrganizationDialog } from '@/components/shared/NewOrganizationDialog'
import { ROOT_NAV_LABELS, ROUTES } from '@/lib/routes'

/** Humanise a URL segment as a fallback label (kebab/snake → Title Case). */
/** Deterministic colour palette for org/tenant avatar tiles. */
const ORG_COLORS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
  'bg-indigo-500',
]
function orgColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return ORG_COLORS[h % ORG_COLORS.length]
}

function humaniseSegment(seg: string): string {
  const decoded = decodeURIComponent(seg)
  // UUIDs and long opaque IDs become "Details"
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)) return 'Details'
  if (/^\d+$/.test(decoded) || decoded.length > 24) return 'Details'
  return decoded
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Global application header.
 *
 * Layout (LTR):  [☰] | Home › Section › Detail   ────  [search] [lang] [bell] [avatar]
 * Layout (RTL): full mirror via flex + logical CSS.
 *
 * - Icon buttons use `outline` variant for a clearer affordance.
 * - Breadcrumb is generated from `useLocation()`; root segment is translated
 *   via `ROOT_LABELS`, deeper segments humanised.
 */
export function SiteHeader() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchOpen, setSearchOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  const crumbs = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0) return [] as { href: string; label: string; isLast: boolean }[]
    const detailsLabel = t('common.details', { defaultValue: 'Details' })
    return segments.map((seg, idx) => {
      const href = '/' + segments.slice(0, idx + 1).join('/')
      const isRoot = idx === 0
      const labelKey = isRoot ? ROOT_NAV_LABELS[seg] : undefined
      const humanised = humaniseSegment(seg)
      const label = labelKey
        ? t(labelKey, { defaultValue: humanised })
        : humanised === 'Details'
          ? detailsLabel
          : humanised
      return { href, label, isLast: idx === segments.length - 1 }
    })
  }, [pathname, t])

  const { user, tenant, logout } = useAuthStore()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'hr_manager'
  const profileRoute = isAdmin ? ROUTES.settings : '/my/account'
  const { data: myTenants } = useMyTenants()
  const switchMut = useSwitchTenant()
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [newOrgOpen, setNewOrgOpen] = useState(false)

  const initials = user?.name
    ? user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  function handleLogout() {
    logout()
    navigate(ROUTES.login, { replace: true })
  }

  function handleSwitchTenant(tenantId: string) {
    if (tenantId === tenant?.id || switchingId) return
    setSwitchingId(tenantId)
    switchMut.mutate(tenantId, {
      onSuccess: () => { window.location.assign('/dashboard') },
      onError: () => setSwitchingId(null),
    })
  }

  const hasMultipleOrgs = (myTenants?.length ?? 0) > 1

  const iconBtn = 'size-9 border-border bg-background hover:bg-muted'

  return (
    <>
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 px-4 lg:px-6',
        'header-blur text-foreground',
      )}
    >
      <SidebarTrigger
        className="-ms-1 text-foreground"
        aria-label={t('common.toggleMenu', { defaultValue: 'Toggle menu' })}
      />
      <Separator orientation="vertical" className="h-5" />

      {/* Breadcrumb */}
      <nav
        aria-label={t('common.breadcrumb', { defaultValue: 'Breadcrumb' })}
        className="flex items-center min-w-0 flex-1"
      >
        <ol className="flex items-center gap-1.5 min-w-0 text-sm">
          {crumbs.map((c, idx) => (
            <li key={c.href} className="flex items-center gap-1.5 min-w-0">
              {idx > 0 && (
                <ChevronRight
                  className="size-3.5 text-muted-foreground/60 shrink-0"
                  data-rtl-flip
                  aria-hidden="true"
                />
              )}
              {c.isLast ? (
                <span
                  className="font-semibold text-foreground truncate"
                  aria-current="page"
                  title={c.label}
                >
                  {c.label}
                </span>
              ) : (
                <Link
                  to={c.href}
                  className="text-muted-foreground hover:text-foreground transition-colors truncate"
                  title={c.label}
                >
                  {c.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Right: actions */}
      <div className="ms-auto flex items-center gap-2">
        {/* Search - desktop pill */}
        <Button
          variant="outline"
          size="sm"
          className="hidden md:flex gap-2 text-muted-foreground w-56 h-9 ps-3 pe-2 justify-start font-normal border-border bg-background hover:bg-muted"
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon className="size-3.5 shrink-0" />
          <span className="text-xs flex-1 text-start">
            {t('search.placeholder', { defaultValue: 'Search anything…' })}
          </span>
          <kbd className="ms-auto pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
            <span className="text-[10px]">⌘</span>K
          </kbd>
        </Button>

        {/* Search - mobile icon */}
        <Button
          variant="outline"
          size="icon"
          className={cn('md:hidden', iconBtn)}
          aria-label={t('search.placeholder', { defaultValue: 'Search' })}
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon className="size-4" />
        </Button>

        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

        {/* Theme switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={iconBtn}
              aria-label={t('common.toggleTheme')}
            >
              <SunIcon className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-36">
            <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => setTheme('light')}>
              <SunIcon className="size-4 text-muted-foreground" />
              <span className="text-sm">{t('common.themeLight')}</span>
              {theme === 'light' && <Check className="ms-auto size-3.5 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => setTheme('dark')}>
              <MoonIcon className="size-4 text-muted-foreground" />
              <span className="text-sm">{t('common.themeDark')}</span>
              {theme === 'dark' && <Check className="ms-auto size-3.5 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => setTheme('system')}>
              <MonitorIcon className="size-4 text-muted-foreground" />
              <span className="text-sm">{t('common.themeSystem')}</span>
              {theme === 'system' && <Check className="ms-auto size-3.5 text-primary" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications - popover preview with the same UX as the portal:
            unread-first ordering, refetch-on-open, mark-read + deep-link
            from any item. Falls through to /notifications for the full list. */}
        <NotificationsBell triggerClassName={iconBtn} />

        {/* Profile - hidden for now; user menu lives in the sidebar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hidden flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ms-1"
              aria-label={t('common.userMenu', { defaultValue: 'User menu' })}
            >
              <Avatar className="size-9 border border-border">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" sideOffset={8} className="w-80 p-0 overflow-hidden">
            {/* Identity card */}
            <div className="px-5 pt-5 pb-4 bg-gradient-to-b from-muted/50 to-muted/20 border-b border-border">
              <div className="flex items-start gap-3">
                <Avatar className="size-12 border-2 border-background shadow-sm shrink-0">
                  {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  {/* Row 1: Name + role badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-bold leading-tight truncate text-foreground">{user?.name ?? t('common.user', { defaultValue: 'User' })}</p>
                    {user?.role && (
                      <span className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none shrink-0',
                        ROLE_BADGE_STYLE[user.role] ?? '',
                      )}>
                        {ROLE_LABELS[user.role] ?? labelFor(user.role)}
                      </span>
                    )}
                  </div>
                  {/* Row 2: Email */}
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>

                  {/* Row 3: Company name - hover to switch (sub-menu opens automatically) */}
                  {tenant && (
                    hasMultipleOrgs ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger
                          className={cn(
                            'mt-2 flex items-center gap-1.5 min-w-0 w-full rounded-md px-1.5 py-1 -mx-1.5 cursor-pointer',
                            'hover:bg-blue-100/60 focus:bg-blue-100/60 data-[state=open]:bg-blue-100/70',
                            'transition-colors [&>svg:last-child]:hidden',
                          )}
                          aria-label={t('common.switchOrganization')}
                          title={t('common.switchOrganization')}
                        >
                          <Building2 className="size-3.5 shrink-0 text-blue-600" />
                          <span className="text-xs font-bold text-foreground truncate flex-1 text-start">{tenant.name}</span>
                          {switchingId
                            ? <Loader2Icon className="size-3 shrink-0 animate-spin text-blue-700" strokeWidth={2.5} />
                            : <ChevronRight className="size-3.5 shrink-0 text-blue-700" strokeWidth={2.5} data-rtl-flip />}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="min-w-56 rounded-xl p-1.5 shadow-lg">
                            {myTenants?.map(m => (
                              <DropdownMenuItem
                                key={m.tenantId}
                                className={cn('gap-2.5 cursor-pointer px-2 py-2 rounded-md', m.tenantId === tenant?.id && 'bg-primary/8 cursor-default')}
                                onClick={() => handleSwitchTenant(m.tenantId)}
                                disabled={m.tenantId === tenant?.id || !!switchingId}
                              >
                                <div className={cn(
                                  'size-7 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden',
                                  m.logoUrl ? 'bg-muted text-muted-foreground' : cn(orgColor(m.tenantName ?? '?'), 'text-white'),
                                )}>
                                  {m.logoUrl
                                    ? <img src={m.logoUrl} alt="" className="size-full object-cover" />
                                    : (m.tenantName ?? '?').slice(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate leading-tight">{m.tenantName}</p>
                                  <p className="text-[11px] text-muted-foreground capitalize truncate leading-tight">
                                    {labelFor(m.role)}
                                  </p>
                                </div>
                                <span className="ml-auto shrink-0">
                                  {switchingId === m.tenantId
                                    ? <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                                    : m.tenantId === tenant?.id
                                      ? <Check className="size-3.5 text-primary" />
                                      : null}
                                </span>
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator className="my-1" />
                            <DropdownMenuItem
                              className="gap-2 rounded-md px-2.5 py-2 cursor-pointer"
                              onClick={() => setNewOrgOpen(true)}
                            >
                              <PlusIcon className="size-3.5 text-muted-foreground" />
                              <span className="text-sm">{t('common.newOrganization')}</span>
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                    ) : (
                      <div className="mt-2 flex items-center gap-1.5 min-w-0">
                        <Building2 className="size-3.5 shrink-0 text-blue-600" />
                        <span className="text-xs font-bold text-foreground truncate flex-1">{tenant.name}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Menu actions - Organization Settings removed by design (use sidebar) */}
            <div className="p-1.5">
              <DropdownMenuItem onClick={() => navigate(profileRoute)} className="gap-2.5 cursor-pointer h-9 px-2.5 rounded-md">
                <UserIcon className="size-4 text-muted-foreground" />
                <span className="text-sm">{t('profile.myAccount', { defaultValue: 'My Account' })}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1.5" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="gap-2.5 cursor-pointer h-9 px-2.5 rounded-md text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="size-4" />
                <span className="text-sm font-medium">{t('auth.signOut', { defaultValue: 'Sign Out' })}</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

    <NewOrganizationDialog open={newOrgOpen} onOpenChange={setNewOrgOpen} />
    </>
  )
}
