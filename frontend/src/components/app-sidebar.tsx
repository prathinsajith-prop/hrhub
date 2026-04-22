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

const navGroups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboardIcon },
    ],
  },
  {
    label: "People",
    items: [
      { title: "Employees", url: "/employees", icon: UsersIcon },
      { title: "Org Chart", url: "/org-chart", icon: GitBranchIcon },
      { title: "Recruitment", url: "/recruitment", icon: BriefcaseIcon },
      { title: "Onboarding", url: "/onboarding", icon: UserPlusIcon },
    ],
  },
  {
    label: "Compliance",
    items: [
      { title: "Visa & PRO", url: "/visa", icon: IdCardIcon },
      { title: "Documents", url: "/documents", icon: FolderOpenIcon },
      { title: "Compliance", url: "/compliance", icon: ShieldCheckIcon },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Payroll", url: "/payroll", icon: BanknoteIcon },
      { title: "Leave", url: "/leave", icon: CalendarCheckIcon },
      { title: "Attendance", url: "/attendance", icon: ClockIcon },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Reports", url: "/reports", icon: BarChart3Icon },
      { title: "Audit Log", url: "/audit", icon: ClipboardListIcon },
    ],
  },
]

const navSecondary = [
  { title: "Settings", url: "/settings", icon: SettingsIcon },
  { title: "Help", url: "/help", icon: HelpCircleIcon },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, tenant } = useAuthStore()
  const location = useLocation()

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
