import { BellIcon, SearchIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
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
import { useNotifications } from '@/hooks/useDashboard'

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
  const segments = location.pathname.split('/').filter(Boolean)
  const rootPath = segments.length ? `/${segments[0]}` : '/dashboard'
  const rootMeta = routeMeta[rootPath] ?? { title: 'HRHub' }
  const isDetail = segments.length > 1
  const { data: notifData } = useNotifications(10)
  const notifications = (notifData as any[]) ?? []
  const unreadCount = notifications.length

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
        >
          <SearchIcon className="size-3.5" />
          <span className="text-xs">Search anything...</span>
          <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            &#8984;K
          </kbd>
        </Button>
        <Button variant="outline" size="icon-sm" className="md:hidden" aria-label="Search">
          <SearchIcon className="h-4 w-4" />
        </Button>

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
              ) : notifications.slice(0, 8).map((n: any, i: number) => (
                <div key={n.id ?? i} className="flex gap-3 p-3 hover:bg-muted/50 cursor-pointer">
                  <div
                    className={cn(
                      'mt-1 h-2 w-2 rounded-full shrink-0',
                      n.type === 'warning' && 'bg-warning',
                      n.type === 'info' && 'bg-info',
                      (!n.type || n.type === 'default') && 'bg-primary',
                    )}
                  />
                  <div>
                    <p className="text-xs font-medium">{n.title ?? n.message}</p>
                    <p className="text-[11px] text-muted-foreground">{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-border">
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                View all notifications
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
