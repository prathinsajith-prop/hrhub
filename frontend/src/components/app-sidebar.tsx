import * as React from "react"
import { NavLink, useLocation } from "react-router-dom"
import {
  LayoutDashboardIcon,
  UsersIcon,
  BriefcaseIcon,
  UserPlusIcon,
  IdCardIcon,
  FolderOpenIcon,
  BanknoteIcon,
  CalendarCheckIcon,
  ShieldCheckIcon,
  BarChart3Icon,
  SettingsIcon,
  BuildingIcon,
  ClipboardListIcon,
  GitBranchIcon,
  ClockIcon,
  StarIcon,
  PackageIcon,
  UserMinusIcon,
} from "lucide-react"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useAuthStore } from "@/store/authStore"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, tenant } = useAuthStore()
  const location = useLocation()
  const { t } = useTranslation()

  // The sidebar re-renders on every route change because of useLocation().
  // Memoize the static-shape nav config so we don't rebuild dozens of objects
  // per navigation. The translation function reference changes only when
  // language switches, so this list is genuinely stable in steady state.
  const navGroups = React.useMemo(() => [
    {
      label: t('nav.overview'),
      items: [
        { title: t('nav.dashboard'), url: "/dashboard", icon: LayoutDashboardIcon },
        { title: t('nav.calendar', { defaultValue: 'Calendar' }), url: "/calendar", icon: CalendarCheckIcon },
      ],
    },
    {
      label: t('nav.people'),
      items: [
        { title: t('nav.employees'), url: "/employees", icon: UsersIcon },
        { title: t('nav.orgChart'), url: "/org-chart", icon: GitBranchIcon },
        { title: t('nav.recruitment'), url: "/recruitment", icon: BriefcaseIcon },
        { title: t('nav.onboarding'), url: "/onboarding", icon: UserPlusIcon },
        { title: t('nav.exit', { defaultValue: 'Exit & Offboarding' }), url: "/exit", icon: UserMinusIcon },
      ],
    },
    {
      label: t('nav.complianceGroup'),
      items: [
        { title: t('nav.visa'), url: "/visa", icon: IdCardIcon },
        { title: t('nav.documents'), url: "/documents", icon: FolderOpenIcon },
        { title: t('nav.compliance'), url: "/compliance", icon: ShieldCheckIcon },
      ],
    },
    {
      label: t('nav.finance'),
      items: [
        { title: t('nav.payroll'), url: "/payroll", icon: BanknoteIcon },
        { title: t('nav.leave'), url: "/leave", icon: CalendarCheckIcon },
        { title: t('nav.attendance'), url: "/attendance", icon: ClockIcon },
        { title: t('nav.performance'), url: "/performance", icon: StarIcon },
        { title: t('nav.assets', { defaultValue: 'Asset Management' }), url: "/assets", icon: PackageIcon },
      ],
    },
    {
      label: t('nav.insights'),
      items: [
        { title: t('nav.reports'), url: "/reports", icon: BarChart3Icon },
        { title: t('nav.auditLog'), url: "/audit", icon: ClipboardListIcon },
      ],
    },
  ], [t])

  const navSecondary = React.useMemo(() => [
    { title: t('nav.settings'), url: "/settings", icon: SettingsIcon },
  ], [t])

  const userData = React.useMemo(() => ({
    name: user?.name ?? "HR Admin",
    email: user?.email ?? "",
    avatar: user?.avatarUrl ?? "",
  }), [user?.name, user?.email, user?.avatarUrl])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              tooltip={tenant?.name ?? 'HRHub'}
              className="hover:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
            >
              <NavLink to="/dashboard">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shrink-0">
                  <BuildingIcon className="h-4 w-4 text-white" />
                </div>
                <div className="flex flex-col leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
                  <span className="text-sm font-bold text-sidebar-foreground truncate">
                    {tenant?.name ?? "HRHub"}
                  </span>
                  <span className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest truncate">
                    UAE HRM Platform
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        {navGroups.map((group, gi) => (
          <SidebarGroup
            key={group.label}
            className={cn(
              gi > 0 && 'group-data-[collapsible=icon]:border-t group-data-[collapsible=icon]:border-sidebar-border/60 group-data-[collapsible=icon]:mt-2 group-data-[collapsible=icon]:pt-2',
            )}
          >
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40 px-3 mb-1">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive = location.pathname.startsWith(item.url)
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className="transition-all duration-150"
                    >
                      <NavLink to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}

        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            {navSecondary.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <NavLink to={item.url}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  )
}
