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
  HelpCircleIcon,
  BuildingIcon,
  ClipboardListIcon,
  GitBranchIcon,
  ClockIcon,
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, tenant } = useAuthStore()
  const location = useLocation()
  const { t } = useTranslation()

  const navGroups = [
    {
      label: t('nav.overview'),
      items: [
        { title: t('nav.dashboard'), url: "/dashboard", icon: LayoutDashboardIcon },
      ],
    },
    {
      label: t('nav.people'),
      items: [
        { title: t('nav.employees'), url: "/employees", icon: UsersIcon },
        { title: t('nav.orgChart'), url: "/org-chart", icon: GitBranchIcon },
        { title: t('nav.recruitment'), url: "/recruitment", icon: BriefcaseIcon },
        { title: t('nav.onboarding'), url: "/onboarding", icon: UserPlusIcon },
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
      ],
    },
    {
      label: t('nav.insights'),
      items: [
        { title: t('nav.reports'), url: "/reports", icon: BarChart3Icon },
        { title: t('nav.auditLog'), url: "/audit", icon: ClipboardListIcon },
      ],
    },
  ]

  const navSecondary = [
    { title: t('nav.settings'), url: "/settings", icon: SettingsIcon },
    { title: t('nav.help'), url: "/help", icon: HelpCircleIcon },
  ]

  const userData = {
    name: user?.name ?? "HR Admin",
    email: user?.email ?? "",
    avatar: "",
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-sidebar-accent">
              <NavLink to="/dashboard">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <BuildingIcon className="h-4 w-4 text-white" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-sm font-bold text-sidebar-foreground">
                    {tenant?.name ?? "HRHub"}
                  </span>
                  <span className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest">
                    UAE HRM Platform
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 py-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
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
