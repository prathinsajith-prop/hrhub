import { useState, useMemo } from 'react'
import { BellIcon, SearchIcon, LogOut, UserIcon, Building2, ChevronRight, Check, Settings2, SunIcon, MoonIcon, MonitorIcon, ShieldIcon, Loader2Icon, PlusIcon, ArrowRightLeftIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { labelFor } from '@/lib/enums'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useNotificationsList, useUnreadCount, useMarkNotificationRead, useMarkAllRead } from '@/hooks/useNotifications'
import { useAuthStore } from '@/store/authStore'
import { useMyTenants, useSwitchTenant } from '@/hooks/useTenants'
import { GlobalSearch } from '@/components/shared/GlobalSearch'
import { NewOrganizationDialog } from '@/components/shared/NewOrganizationDialog'
import { ROOT_NAV_LABELS, ROUTES } from '@/lib/routes'

/** Humanise a URL segment as a fallback label (kebab/snake → Title Case). */
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
  const location = useLocation()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [searchOpen, setSearchOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  const crumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
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
  }, [location.pathname, t])

  const { data: notifData } = useNotificationsList({ limit: 8 })
  const { data: unreadCount = 0 } = useUnreadCount()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllRead()
  const notifications = notifData?.data ?? []
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

  const iconBtn = 'h-9 w-9 border-border bg-background hover:bg-muted'

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
                  className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0"
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
        {/* Search — desktop pill */}
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

        {/* Search — mobile icon */}
        <Button
          variant="outline"
          size="icon"
          className={cn('md:hidden', iconBtn)}
          aria-label={t('search.placeholder', { defaultValue: 'Search' })}
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon className="h-4 w-4" />
        </Button>

        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

        {/* Theme switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={iconBtn}
              aria-label="Toggle theme"
            >
              <SunIcon className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <MoonIcon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-36">
            <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => setTheme('light')}>
              <SunIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Light</span>
              {theme === 'light' && <Check className="ms-auto h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => setTheme('dark')}>
              <MoonIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Dark</span>
              {theme === 'dark' && <Check className="ms-auto h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2.5 cursor-pointer" onClick={() => setTheme('system')}>
              <MonitorIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">System</span>
              {theme === 'system' && <Check className="ms-auto h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={cn('relative', iconBtn)}
              aria-label={t('profile.notifications', { defaultValue: 'Notifications' })}
            >
              <BellIcon className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-semibold">{t('profile.notifications', { defaultValue: 'Notifications' })}</p>
                <p className="text-[11px] text-muted-foreground">
                  {unreadCount > 0
                    ? t('notifications.unreadCount', { count: unreadCount, defaultValue: `${unreadCount} unread` })
                    : t('notifications.allRead', { defaultValue: 'All caught up' })}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  {t('notifications.markAll', { defaultValue: 'Mark all read' })}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {notifications.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <BellIcon className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {t('notifications.empty', { defaultValue: 'No notifications yet' })}
                  </p>
                </div>
              ) : notifications.slice(0, 8).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cn(
                    'w-full flex gap-3 px-4 py-3 text-start cursor-pointer transition-colors hover:bg-muted/40',
                    !n.isRead && 'bg-primary/5',
                  )}
                  onClick={() => { if (!n.isRead) markRead.mutate(n.id) }}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 rounded-full shrink-0',
                      n.type === 'warning' && 'bg-amber-500',
                      n.type === 'error' && 'bg-destructive',
                      n.type === 'success' && 'bg-emerald-500',
                      n.type === 'info' && 'bg-blue-500',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-xs leading-tight', !n.isRead ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString(i18n.language === 'ar' ? 'ar-AE' : 'en-AE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <div className="p-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => navigate(ROUTES.notifications)}
              >
                {t('notifications.viewAll', { defaultValue: 'View all notifications' })}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ms-1"
              aria-label={t('common.userMenu', { defaultValue: 'User menu' })}
            >
              <Avatar className="h-9 w-9 border border-border">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-0">
            {/* Identity card */}
            <div className="px-4 py-4 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 border border-border shrink-0">
                  {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight truncate">{user?.name ?? 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
                  {user?.role && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <ShieldIcon className="size-2.5 shrink-0" />
                      {labelFor(user.role)}
                    </span>
                  )}
                </div>
              </div>

              {/* Org row: plain text + inline Switch button */}
              {tenant && (
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Building2 className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="text-xs text-muted-foreground truncate">{tenant.name}</span>
                  </div>
                  {hasMultipleOrgs && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="h-7 px-2 rounded-md bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 focus:bg-primary/15 data-[state=open]:bg-primary/15 text-xs font-medium shrink-0 gap-1 [&>svg:last-child]:size-3 [&>svg:last-child]:opacity-60">
                        {switchingId
                          ? <Loader2Icon className="size-3 animate-spin" />
                          : <ArrowRightLeftIcon className="size-3" />}
                        Switch
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
                              <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0 overflow-hidden">
                                {m.logoUrl
                                  ? <img src={m.logoUrl} alt="" className="h-full w-full object-cover" />
                                  : m.tenantName.slice(0, 2).toUpperCase()}
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
                            <span className="text-sm">New organization</span>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  )}
                </div>
              )}
            </div>

            {/* Menu actions */}
            <div className="p-1.5">

              {/* Org Settings — admin only */}
              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate('/organization-settings')} className="gap-2.5 cursor-pointer h-9 px-2.5 rounded-md">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{t('organizations.settings', { defaultValue: 'Organization Settings' })}</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="my-1.5" />

              <DropdownMenuItem onClick={() => navigate(profileRoute)} className="gap-2.5 cursor-pointer h-9 px-2.5 rounded-md">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('profile.myAccount', { defaultValue: 'My Account' })}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(ROUTES.notifications)} className="gap-2.5 cursor-pointer h-9 px-2.5 rounded-md">
                <BellIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('profile.notifications', { defaultValue: 'Notifications' })}</span>
                {unreadCount > 0 && (
                  <span className="ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1.5" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="gap-2.5 cursor-pointer h-9 px-2.5 rounded-md text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
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
