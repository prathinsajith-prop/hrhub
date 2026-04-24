import { useState, useMemo } from 'react'
import { BellIcon, SearchIcon, LogOut, UserIcon, Building2, ChevronRight } from 'lucide-react'
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
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useNotificationsList, useUnreadCount, useMarkNotificationRead, useMarkAllRead } from '@/hooks/useNotifications'
import { useAuthStore } from '@/store/authStore'
import { GlobalSearch } from '@/components/shared/GlobalSearch'
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

  const initials = user?.name
    ? user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  function handleLogout() {
    logout()
    navigate(ROUTES.login, { replace: true })
  }

  const iconBtn = 'h-9 w-9 border-border bg-background hover:bg-muted'

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 lg:px-6',
        'bg-background/80 text-foreground backdrop-blur supports-[backdrop-filter]:bg-background/70',
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
            <div className="flex items-center gap-3 p-4 bg-muted/40 border-b border-border">
              <Avatar className="h-11 w-11 border border-border">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight truncate">{user?.name ?? 'User'}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
                {tenant && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                    <p className="text-[11px] text-muted-foreground truncate">{tenant.name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Menu actions */}
            <div className="p-1.5">
              <DropdownMenuItem onClick={() => navigate(ROUTES.settings)} className="gap-2.5 cursor-pointer h-9 px-2.5 rounded-md">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('profile.settings', { defaultValue: 'Profile & Settings' })}</span>
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
  )
}
