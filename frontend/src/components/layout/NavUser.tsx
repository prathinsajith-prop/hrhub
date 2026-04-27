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
  CreditCardIcon,
  PlusIcon,
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

/** Deterministic colour from org name for the initial avatar */
const ORG_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-violet-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500',
]
function orgColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return ORG_COLORS[h % ORG_COLORS.length]
}

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
  const currentMembership = myTenants.find(t => t.tenantId === tenant?.id)
  const currentRole = currentMembership?.role

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
            className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-64 rounded-xl p-1.5 shadow-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
          >
            {/* Profile card */}
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-3 px-2.5 py-2.5 text-left text-sm rounded-lg bg-muted/40">
                <Avatar className="h-10 w-10 rounded-full ring-2 ring-primary/20 shrink-0">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  {currentRole && (
                    <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <ShieldIcon className="size-2.5" />
                      {labelFor(currentRole)}
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator className="my-1.5" />

            {/* Organisation switcher */}
            {myTenants.length > 1 ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="rounded-md px-0 py-0 h-auto focus:bg-accent data-[state=open]:bg-accent">
                  <div className="flex w-full items-center gap-2.5 px-2.5 py-2">
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold',
                      orgColor(tenant?.name ?? 'X'),
                    )}>
                      {(tenant?.name ?? '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="truncate text-sm font-medium leading-tight">{tenant?.name}</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">Switch organization</p>
                    </div>
                  </div>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="min-w-56 rounded-xl p-1.5 shadow-lg">
                    {myTenants.map((org) => {
                      const isCurrent = org.tenantId === tenant?.id
                      const isSwitching = switchingId === org.tenantId
                      const initial = (org.tenantName ?? '?')[0].toUpperCase()
                      return (
                        <DropdownMenuItem
                          key={org.tenantId}
                          onClick={() => handleSwitchOrg(org.tenantId)}
                          disabled={isCurrent || !!switchingId}
                          className={cn(
                            "gap-2.5 rounded-md px-2 py-2 cursor-pointer",
                            isCurrent && "bg-primary/8 cursor-default",
                          )}
                        >
                          <div className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold',
                            orgColor(org.tenantName ?? 'X'),
                          )}>
                            {initial}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-medium leading-tight">{org.tenantName}</p>
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
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem onClick={() => navigate('/organizations/new')} className="gap-2 rounded-md px-2.5 py-2 cursor-pointer">
                      <PlusIcon className="size-3.5 text-muted-foreground" />
                      <span className="text-sm">New organization</span>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ) : myTenants.length === 1 ? (
              /* Single org: show as non-clickable info block */
              <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md">
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold',
                  orgColor(tenant?.name ?? 'X'),
                )}>
                  {(tenant?.name ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium leading-tight">{tenant?.name}</p>
                  <p className="text-[11px] text-muted-foreground capitalize leading-tight">{currentRole ? labelFor(currentRole) : ''}</p>
                </div>
                <CheckIcon className="size-3.5 text-primary shrink-0" />
              </div>
            ) : null}

            <DropdownMenuSeparator className="my-1.5" />

            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <UserCircleIcon className="size-4 text-muted-foreground" />
                {t('profile.myProfile')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/organization-settings')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <Building2Icon className="size-4 text-muted-foreground" />
                Organization
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/subscription')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <CreditCardIcon className="size-4 text-muted-foreground" />
                Billing &amp; Plans
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <SettingsIcon className="size-4 text-muted-foreground" />
                {t('nav.settings')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/my/login-history')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <ShieldIcon className="size-4 text-muted-foreground" />
                {t('auth.myLoginHistory')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/notifications')} className="gap-2.5 rounded-md h-9 px-2.5 cursor-pointer">
                <BellIcon className="size-4 text-muted-foreground" />
                {t('profile.notifications')}
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
