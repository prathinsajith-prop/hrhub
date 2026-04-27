import {
  BellIcon,
  LogOutIcon,
  ChevronsUpDown,
  SettingsIcon,
  UserCircleIcon,
  ShieldIcon,
  GlobeIcon,
  Building2Icon,
  CheckIcon,
  Loader2Icon,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useAuthStore } from "@/store/authStore"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { applyLanguageDirection } from "@/lib/i18n"
import { useMyTenants, useSwitchTenant } from "@/hooks/useTenants"
import { useState } from "react"
import { labelFor } from "@/lib/enums"
import { cn } from "@/lib/utils"

export function NavUser({
  user,
}: {
  user: { name: string; email: string; avatar: string }
}) {
  const { isMobile } = useSidebar()
  const { logout, tenant } = useAuthStore()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const { data: tenants } = useMyTenants()
  const switchTenant = useSwitchTenant()

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  const toggleLanguage = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar'
    i18n.changeLanguage(next)
    applyLanguageDirection(next)
  }

  const handleSwitchOrg = (tenantId: string) => {
    if (tenantId === tenant?.id || switchingId) return
    setSwitchingId(tenantId)
    switchTenant.mutate(tenantId, {
      onSuccess: () => { window.location.assign('/dashboard') },
      onError: () => setSwitchingId(null),
    })
  }

  const isArabic = i18n.language === 'ar'
  const myTenants = tenants ?? []

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground hover:bg-sidebar-accent/60 rounded-lg"
            >
              <Avatar className="h-9 w-9 rounded-full ring-2 ring-primary/20">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs text-sidebar-foreground/60">
                  {tenant?.name ?? user.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-60 rounded-xl p-1.5 shadow-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-3 px-2.5 py-2.5 text-left text-sm rounded-lg bg-muted/40">
                <Avatar className="h-10 w-10 rounded-full ring-2 ring-primary/20">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  {tenant?.name && (
                    <span className="truncate text-[11px] text-primary/70 font-medium mt-0.5">
                      {tenant.name}
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>

            {/* Organisation switcher — only shown when user belongs to >1 org */}
            {myTenants.length > 1 && (
              <>
                <DropdownMenuSeparator className="my-1.5" />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                    <Building2Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">Switch Organisation</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="min-w-52 rounded-xl p-1.5 shadow-lg">
                      {myTenants.map((org) => {
                        const isCurrent = org.tenantId === tenant?.id
                        const isSwitching = switchingId === org.tenantId
                        return (
                          <DropdownMenuItem
                            key={org.tenantId}
                            onClick={() => handleSwitchOrg(org.tenantId)}
                            disabled={isCurrent || !!switchingId}
                            className={cn(
                              "gap-2.5 rounded-md px-2.5 py-2 cursor-pointer",
                              isCurrent && "bg-primary/8 text-primary font-medium cursor-default",
                            )}
                          >
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-background overflow-hidden">
                              {org.logoUrl ? (
                                <img src={org.logoUrl} alt={org.tenantName} className="h-full w-full object-contain" />
                              ) : (
                                <Building2Icon className="size-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-sm leading-tight">{org.tenantName}</p>
                              <p className="truncate text-[11px] text-muted-foreground capitalize leading-tight">
                                {labelFor(org.role)}
                              </p>
                            </div>
                            <span className="ml-auto shrink-0">
                              {isSwitching ? (
                                <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                              ) : isCurrent ? (
                                <CheckIcon className="size-3.5 text-primary" />
                              ) : null}
                            </span>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              </>
            )}

            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <UserCircleIcon className="size-4 text-muted-foreground" />
                {t('profile.myProfile')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/my/login-history')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <ShieldIcon className="size-4 text-muted-foreground" />
                {t('auth.myLoginHistory')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/notifications')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <BellIcon className="size-4 text-muted-foreground" />
                {t('profile.notifications')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <SettingsIcon className="size-4 text-muted-foreground" />
                {t('nav.settings')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem onClick={toggleLanguage} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
              <GlobeIcon className="size-4 text-muted-foreground" />
              <span>{isArabic ? 'Switch to English' : 'التبديل إلى العربية'}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem
              onClick={handleLogout}
              className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOutIcon className="size-4" />
              {t('auth.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
