import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Briefcase, FileText, CreditCard,
  Calendar, Shield, LogOut, ChevronLeft, ChevronRight,
  UserCheck, Plane, BarChart3
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { Avatar, AvatarFallback } from '@/components/ui/primitives'

const navGroups = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ]
  },
  {
    label: 'People',
    items: [
      { to: '/employees', icon: Users, label: 'Employees' },
      { to: '/recruitment', icon: Briefcase, label: 'Recruitment' },
      { to: '/onboarding', icon: UserCheck, label: 'Onboarding' },
    ]
  },
  {
    label: 'PRO Services',
    items: [
      { to: '/visa', icon: Plane, label: 'Visa Management' },
      { to: '/documents', icon: FileText, label: 'Documents' },
    ]
  },
  {
    label: 'Operations',
    items: [
      { to: '/payroll', icon: CreditCard, label: 'Payroll & WPS' },
      { to: '/leave', icon: Calendar, label: 'Leave Management' },
    ]
  },
  {
    label: 'Compliance',
    items: [
      { to: '/compliance', icon: Shield, label: 'Compliance' },
      { to: '/reports', icon: BarChart3, label: 'Reports' },
    ]
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, tenant, logout } = useAuthStore()

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full transition-all duration-300 ease-in-out shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
      style={{
        background: 'linear-gradient(180deg, hsl(228 39% 7%) 0%, hsl(228 35% 9%) 100%)',
        borderRight: '1px solid hsl(var(--sidebar-border))',
      }}
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[72px] z-20 h-6 w-6 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors"
        style={{ border: '1px solid hsl(var(--border))' }}
      >
        {collapsed ? <ChevronRight className="h-3 w-3 text-gray-500" /> : <ChevronLeft className="h-3 w-3 text-gray-500" />}
      </button>

      {/* Logo */}
      <div
        className={cn('flex items-center h-[60px] px-4 shrink-0', collapsed ? 'justify-center' : 'gap-3')}
        style={{ borderBottom: '1px solid hsl(var(--sidebar-border))' }}
      >
        <div
          className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white font-bold text-xs"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
        >
          HR
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-tight font-display">
              HRHub.ae
            </p>
            <p className="text-[10px] text-white/35 truncate mt-0.5">
              {tenant?.name ?? 'Platform'}
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4 sidebar-scroll">
        {navGroups.map(group => (
          <div key={group.label} className="px-2">
            {!collapsed && (
              <p className="px-2 mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/25">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => cn(
                    'flex items-center gap-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                    collapsed ? 'justify-center px-0 py-2.5 mx-0' : 'px-2.5 py-2 mx-0',
                    isActive ? 'nav-item-active' : 'nav-item text-white/55'
                  )}
                >
                  <item.icon
                    className={cn(
                      'shrink-0 transition-colors',
                      collapsed ? 'h-[18px] w-[18px]' : 'h-4 w-4'
                    )}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div
        className="shrink-0 p-3"
        style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}
      >
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-1">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback
                className="text-[10px] font-semibold"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white' }}
              >
                {getInitials(user?.name ?? 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white/90 truncate">{user?.name}</p>
              <p className="text-[10px] text-white/35 truncate capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-white/35 hover:text-white hover:bg-white/8 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={logout}
            title="Sign out"
            className="w-full flex items-center justify-center h-8 rounded-lg text-white/35 hover:text-white hover:bg-white/8 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  )
}
