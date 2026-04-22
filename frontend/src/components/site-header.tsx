import { useState } from 'react'
import { BellIcon, SearchIcon, LogOut, Settings, User, Building2, ChevronRight, Languages } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'
import { useNotificationsList, useUnreadCount, useMarkNotificationRead } from '@/hooks/useNotifications'
import { useAuthStore } from '@/store/authStore'
import { GlobalSearch } from '@/components/GlobalSearch'
import { applyLanguageDirection } from '@/lib/i18n'

const routeMeta: Record<string, { title: string; parent?: string }> = {
  '/dashboard': { title: 'Dashboard' },
  '/employees': { title: 'Employees' },
  '/recruitment': { title: 'Recruitment' },
  '/onboarding': { title: 'Onboarding' },
  '/visa': { title: 'Visa & PRO Services' },
  '/documents': { title: 'Documents' },
  '/payroll': { title: 'Payroll' },
  '/leave': { title: 'Leave Management' },
  '/compliance': { title: 'Compliance' },
  '/reports': { title: 'Reports' },
  '/settings': { title: 'Settings' },
}

/**
 * Global application header: sidebar trigger, breadcrumbs, search, notifications.
 * Sticky, translucent, adapts from xs → xl.
 */
export function SiteHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const [searchOpen, setSearchOpen] = useState(false)
  const segments = location.pathname.split('/').filter(Boolean)
  const rootPath = segments.length ? `/${segments[0]}` : '/dashboard'
  const rootMeta = routeMeta[rootPath] ?? { title: 'HRHub' }
  const isDetail = segments.length > 1
  const { data: notifData } = useNotificationsList({ limit: 8 })
  const { data: unreadCount = 0 } = useUnreadCount()
  const markRead = useMarkNotificationRead()
  const notifications = notifData?.data ?? []
  const { user, tenant, logout } = useAuthStore()

  const initials = user?.name
    ? user.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b px-4 lg:px-6',
        'bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70',
      )}
    >
      <SidebarTrigger className="-ml-1 text-foreground" />
      <Separator orientation="vertical" className="mx-2 h-4" />

      {/* Breadcrumbs */}
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="text-[13px]">
          <BreadcrumbItem className="hidden sm:flex">
            <BreadcrumbLink asChild>
              <Link to="/dashboard" className="font-medium">
                HRHub
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:block" />
          <BreadcrumbItem>
            {isDetail ? (
              <BreadcrumbLink asChild>
                <Link to={rootPath} className="font-medium text-foreground/90 truncate">
                  {rootMeta.title}
                </Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="font-semibold text-foreground truncate">
                {rootMeta.title}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {isDetail && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-foreground">Details</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        {/* Search */}
        <Button
          variant="outline"
          size="sm"
          className="hidden md:flex gap-2 text-muted-foreground w-52 justify-start font-normal"
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon className="size-3.5" />
          <span className="text-xs">Search anything...</span>
          <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            &#8984;K
          </kbd>
        </Button>
        <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="Search" onClick={() => setSearchOpen(true)}>
          <SearchIcon className="h-4 w-4" />
        </Button>

        <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <BellIcon className="size-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[9px]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="p-3 border-b border-border">
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
            </div>
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No new notifications</p>
              ) : notifications.slice(0, 8).map((n, i: number) => (
                <div
                  key={n.id ?? i}
                  className={cn(
                    'flex gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50',
                    !n.isRead && 'bg-muted/20',
                  )}
                  onClick={() => { if (!n.isRead) markRead.mutate(n.id) }}
                >
                  <div
                    className={cn(
                      'mt-1 h-2 w-2 rounded-full shrink-0',
                      n.type === 'warning' && 'bg-amber-500',
                      n.type === 'error' && 'bg-red-500',
                      n.type === 'success' && 'bg-emerald-500',
                      n.type === 'info' && 'bg-blue-500',
                    )}
                  />
                  <div className="min-w-0">
                    <p className={cn('text-xs', !n.isRead ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</p>
                  </div>
                  {!n.isRead && <span className="ml-auto mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => navigate('/notifications')}
              >
                View all notifications
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Language Toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Switch language">
              <Languages className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Language</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={cn('gap-2 cursor-pointer', i18n.language === 'en' && 'font-semibold text-primary')}
              onClick={() => { i18n.changeLanguage('en'); applyLanguageDirection('en') }}
            >
              🇬🇧 English
            </DropdownMenuItem>
            <DropdownMenuItem
              className={cn('gap-2 cursor-pointer', i18n.language === 'ar' && 'font-semibold text-primary')}
              onClick={() => { i18n.changeLanguage('ar'); applyLanguageDirection('ar') }}
            >
              🇦🇪 العربية
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="User menu">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="pb-1">
              <p className="text-sm font-semibold leading-tight">{user?.name ?? 'User'}</p>
              <p className="text-xs text-muted-foreground font-normal truncate">{user?.email}</p>
              {tenant && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground truncate">{tenant.name}</p>
                </div>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2 cursor-pointer">
              <User className="h-4 w-4" />
              Profile &amp; Settings
              <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
