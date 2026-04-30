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

const ORG_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-violet-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-fuchsia-500',
]
function orgColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return ORG_COLORS[h % ORG_COLORS.length]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
      {children}
    </DropdownMenuLabel>
  )
}

export function NavUser({
  user,
}: {
  user: { name: string; email: string; avatar: string }
}) {
  const { isMobile } = useSidebar()
  const { logout, tenant, user: authUser } = useAuthStore()
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
  // Use role directly from auth store — always available without waiting for the tenants fetch
  const currentRole = authUser?.role

  const isAdmin = currentRole === 'super_admin' || currentRole === 'hr_manager'
  const isBillingAdmin = currentRole === 'super_admin' || currentRole === 'hr_manager'

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
                  {currentRole ? labelFor(currentRole) : user.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-72 rounded-xl p-0 shadow-xl border border-border"
            side={isMobile ? "bottom" : "right"}
            align="end"
            alignOffset={-4}
            sideOffset={8}
            style={{ maxHeight: 'min(calc(100dvh - 5rem), 640px)', display: 'flex', flexDirection: 'column' }}
          >
            {/* ── Identity card ─────────────────────────────────── */}
            <div className="px-4 py-4 bg-muted/40 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 rounded-full ring-2 ring-primary/20 shrink-0">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                  {currentRole && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <ShieldIcon className="size-2.5 shrink-0" />
                      {labelFor(currentRole)}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Org row: plain text + switch button ─────────── */}
              {tenant && (
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Building2Icon className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <span className="text-xs text-muted-foreground truncate">{tenant.name}</span>
                  </div>
                  {myTenants.length > 1 && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="h-auto p-0 border-0 bg-transparent text-xs font-medium text-primary hover:text-primary/80 focus:bg-transparent data-[state=open]:bg-transparent shrink-0 gap-0.5 [&>svg]:hidden">
                        {switchingId ? (
                          <Loader2Icon className="size-3 animate-spin mr-0.5" />
                        ) : null}
                        Switch
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="min-w-56 rounded-xl p-1.5 shadow-lg">
                          {myTenants.map((org) => {
                            const isCurrent = org.tenantId === tenant?.id
                            const isSwitching = switchingId === org.tenantId
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
                                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white text-xs font-bold',
                                  orgColor(org.tenantName ?? 'X'),
                                )}>
                                  {(org.tenantName ?? '?')[0].toUpperCase()}
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
                  )}
                </div>
              )}
            </div>

            <div className="p-1.5 space-y-0.5 overflow-y-auto overscroll-contain min-h-0">

              {/* ── Workspace (admin only) ─────────────────────── */}
              {isAdmin && (
                <>
                  <SectionLabel>Workspace</SectionLabel>
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => navigate('/organization-settings')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                      <Building2Icon className="size-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">Organization Settings</span>
                    </DropdownMenuItem>
                    {isBillingAdmin && (
                      <DropdownMenuItem onClick={() => navigate('/subscription')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                        <CreditCardIcon className="size-4 text-muted-foreground shrink-0" />
                        <span className="text-sm">Billing &amp; Plans</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                      <SettingsIcon className="size-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">Settings</span>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="my-1" />
                </>
              )}

              {/* ── My Account (all roles) ─────────────────────── */}
              <SectionLabel>My Account</SectionLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigate('/my/account')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer font-medium">
                  <UserCircleIcon className="size-4 text-primary shrink-0" />
                  <span className="text-sm">My Account</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>


              <DropdownMenuSeparator className="my-1" />

              {/* ── Account ───────────────────────────────────── */}
              <SectionLabel>Account</SectionLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigate('/notifications')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                  <BellIcon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">Notifications</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/my/login-history')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                  <ShieldIcon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">Login History</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleLanguage} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                  <GlobeIcon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{isArabic ? 'Switch to English' : 'التبديل إلى العربية'}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator className="my-1" />

              {/* ── Sign out ──────────────────────────────────── */}
              <DropdownMenuItem
                onClick={handleLogout}
                className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOutIcon className="size-4 shrink-0" />
                <span className="text-sm font-medium">{t('auth.signOut')}</span>
              </DropdownMenuItem>

            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
