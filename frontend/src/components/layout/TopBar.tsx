import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, Search, Menu, Check } from 'lucide-react'
import { cn, formatDate, getInitials } from '@/lib/utils'
import { useUIStore } from '@/store/uiStore'
import { Avatar, AvatarFallback } from '@/components/ui/primitives'
import { useAuthStore } from '@/store/authStore'
import * as PopoverPrimitive from '@radix-ui/react-popover'

const routeLabels: Record<string, { title: string; description: string }> = {
  '/dashboard': { title: 'Dashboard', description: 'Overview of your HR operations' },
  '/employees': { title: 'Employees', description: 'Manage your workforce' },
  '/recruitment': { title: 'Recruitment', description: 'Jobs, candidates, and hiring pipeline' },
  '/onboarding': { title: 'Onboarding', description: 'New joiner workflows and checklists' },
  '/visa': { title: 'Visa Management', description: 'Track and process visa applications' },
  '/documents': { title: 'Document Centre', description: 'Manage and track all company documents' },
  '/payroll': { title: 'Payroll & WPS', description: 'Salary processing and WPS compliance' },
  '/leave': { title: 'Leave Management', description: 'Leave requests and balances' },
  '/compliance': { title: 'Compliance', description: 'UAE labour law compliance dashboard' },
  '/reports': { title: 'Reports', description: 'Analytics and reporting' },
  '/settings': { title: 'Settings', description: 'Platform configuration' },
}

const notifColor: Record<string, string> = {
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  success: 'bg-emerald-500',
  info: 'bg-blue-500',
}

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const location = useLocation()
  const { user } = useAuthStore()
  const { notifications, unreadCount, markNotificationRead, markAllRead } = useUIStore()
  const [notifOpen, setNotifOpen] = useState(false)

  const base = '/' + location.pathname.split('/')[1]
  const meta = routeLabels[base] ?? { title: 'HRHub.ae', description: '' }

  return (
    <header
      className="h-[60px] flex items-center justify-between px-5 shrink-0 gap-4"
      style={{
        background: 'white',
        borderBottom: '1px solid hsl(var(--border))',
      }}
    >
      {/* Left — title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="p-1.5 rounded-lg hover:bg-[hsl(var(--muted))] transition-colors md:hidden shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1
            className="text-[15px] font-bold text-[hsl(var(--foreground))] leading-tight"
          >
            {meta.title}
          </h1>
          {meta.description && (
            <p className="text-[11px] text-[hsl(var(--muted-foreground))] hidden sm:block leading-none mt-0.5">
              {meta.description}
            </p>
          )}
        </div>
      </div>

      {/* Center — search */}
      <div className="hidden md:flex flex-1 max-w-xs">
        <div
          className="relative w-full group"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Search employees, documents…"
            className={cn(
              'w-full h-8 pl-8 pr-3 rounded-lg text-sm border bg-[hsl(var(--muted))]',
              'border-transparent placeholder:text-gray-400',
              'focus:outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100',
              'transition-all duration-150'
            )}
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-mono hidden group-focus-within:hidden">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Notifications */}
        <PopoverPrimitive.Root open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverPrimitive.Trigger asChild>
            <button className="relative h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[hsl(var(--muted))] transition-colors">
              <Bell style={{ height: 16, width: 16 }} className="text-gray-500" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-[7px] w-[7px] rounded-full bg-red-500 ring-[1.5px] ring-white" />
              )}
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              align="end"
              sideOffset={8}
              className="z-50 w-96 rounded-xl border border-[hsl(var(--border))] bg-white shadow-xl shadow-black/8"
            >
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                <div>
                  <p className="text-sm font-semibold">Notifications</p>
                  {unreadCount > 0 && (
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{unreadCount} unread</p>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                  >
                    <Check className="h-3 w-3" /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-[hsl(var(--border))]">
                {notifications.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-10">
                    No notifications yet
                  </p>
                ) : notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => markNotificationRead(n.id)}
                    className={cn(
                      'px-4 py-3 flex gap-3 cursor-pointer hover:bg-[hsl(var(--muted))] transition-colors',
                      !n.read && 'bg-blue-50/60'
                    )}
                  >
                    <div className="mt-2 shrink-0">
                      <span className={cn('inline-block h-2 w-2 rounded-full', notifColor[n.type] ?? 'bg-gray-400')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', !n.read ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                        {n.title}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1.5">
                        {formatDate(n.timestamp, 'relative')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>

        {/* Divider */}
        <div className="h-5 w-px bg-[hsl(var(--border))] mx-1" />

        {/* User */}
        <div className="flex items-center gap-2.5 pl-1">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback
              className="text-[10px] font-semibold"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white' }}
            >
              {getInitials(user?.name ?? 'U')}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-gray-800 leading-none">{user?.name}</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5 capitalize">
              {user?.role?.replace('_', ' ')}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
