import { useState } from 'react'
import { BellIcon, SearchIcon, LogOut, UserIcon, Building2, Languages, Check } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { GlobalSearch } from '@/components/GlobalSearch'
import { applyLanguageDirection } from '@/lib/i18n'

const routeMeta: Record<string, string> = {
  '/dashboard': 'navigation.dashboard',
  '/employees': 'navigation.employees',
  '/recruitment': 'navigation.recruitment',
  '/onboarding': 'navigation.onboarding',
  '/visa': 'navigation.visa',
  '/documents': 'navigation.documents',
  '/payroll': 'navigation.payroll',
  '/leave': 'navigation.leave',
  '/attendance': 'navigation.attendance',
  '/exit': 'navigation.exit',
  '/compliance': 'navigation.compliance',
  '/reports': 'navigation.reports',
  '/audit': 'audit.title',
  '/login-history': 'loginHistory.title',
  '/notifications': 'profile.notifications',
  '/settings': 'navigation.settings',
  '/help': 'navigation.help',
}

/**
 * Global application header.
 * Layout (LTR): [sidebar trigger] · [page title] ────── [search] [lang] [notifications] [profile]
 * Layout (RTL): mirrored automatically via flex direction inheritance.
 * Sticky, translucent backdrop, fully responsive.
 */
export function SiteHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [searchOpen, setSearchOpen] = useState(false)

  const segments = location.pathname.split('/').filter(Boolean)
  const rootPath = segments.length ? `/${segments[0]}` : '/dashboard'
  const titleKey = routeMeta[rootPath]
  const pageTitle = titleKey ? t(titleKey, { defaultValue: 'HRHub' }) : 'HRHub'
  const isDetail = segments.length > 1

  const { data: notifData } = useNotificationsList({ limit: 8 })
  const { data: unreadCount = 0 } = useUnreadCount()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllRead()
  const notifications = notifData?.data ?? []
  const { user, tenant, logout } = useAuthStore()

  const initials = user?.name
    ? user.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function changeLang(lang: 'en' | 'ar') {
    i18n.changeLanguage(lang)
    applyLanguageDirection(lang)
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:px-6',
        'bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70',
      )}
    >
      {/* Left: sidebar trigger + page title */}
      <SidebarTrigger className="-ms-1 text-foreground" aria-label={t('common.toggleMenu', { defaultValue: 'Toggle menu' })} />
      <Separator orientation="vertical" className="h-5" />
      <div className="flex items-center gap-2 min-w-0">
        <Link
          to={rootPath}
          className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate"
        >
          {pageTitle}
        </Link>
        {isDetail && (
          <>
            <span className="text-muted-foreground text-xs select-none">/</span>
            <span className="text-sm text-muted-foreground truncate">
              {t('common.details', { defaultValue: 'Details' })}
            </span>
          </>
        )}
      </div>

      {/* Right: actions */}
      <div className="ms-auto flex items-center gap-1.5">
        {/* Search — desktop pill */}
        <Button
          variant="outline"
          size="sm"
          className="hidden md:flex gap-2 text-muted-foreground w-56 h-9 ps-3 pe-2 justify-start font-normal hover:bg-muted/50"
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon className="size-3.5 shrink-0" />
          <span className="text-xs flex-1 text-start">{t('search.placeholder', { defaultValue: 'Search anything…' })}</span>
          <kbd className="ms-auto pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
            <span className="text-[10px]">⌘</span>K
          </kbd>
        </Button>

        {/* Search — mobile icon */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-9 w-9"
          aria-label={t('search.placeholder', { defaultValue: 'Search' })}
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon className="h-4 w-4" />
        </Button>

        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

        {/* Language */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t('common.switchLanguage', { defaultValue: 'Switch language' })}>
              <Languages className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {t('common.language', { defaultValue: 'Language' })}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer justify-between"
              onClick={() => changeLang('en')}
            >
              <span>English</span>
              {i18n.language === 'en' && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 cursor-pointer justify-between"
              onClick={() => changeLang('ar')}
            >
              <span>العربية</span>
              {i18n.language === 'ar' && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
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
                onClick={() => navigate('/notifications')}
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
              className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ms-1"
              aria-label={t('common.userMenu', { defaultValue: 'User menu' })}
            >
              <Avatar className="h-8 w-8 border border-border">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="pb-2 pt-2">
              <p className="text-sm font-semibold leading-tight truncate">{user?.name ?? 'User'}</p>
              <p className="text-xs text-muted-foreground font-normal truncate mt-0.5">{user?.email}</p>
              {tenant && (
                <div className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-md bg-muted/60">
                  <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <p className="text-[11px] text-muted-foreground truncate">{tenant.name}</p>
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2 cursor-pointer">
              <UserIcon className="h-4 w-4" />
              {t('profile.settings', { defaultValue: 'Profile & Settings' })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/notifications')} className="gap-2 cursor-pointer">
              <BellIcon className="h-4 w-4" />
              {t('profile.notifications', { defaultValue: 'Notifications' })}
              {unreadCount > 0 && (
                <span className="ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              {t('profile.signOut', { defaultValue: 'Sign Out' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
