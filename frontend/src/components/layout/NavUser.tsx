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
  PlusIcon,
  ArrowRightLeftIcon,
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
import { useMyTenants, useSwitchTenant } from "@/hooks/useTenants"
import { useState } from "react"
import { labelFor, ROLE_BADGE_STYLE, ROLE_LABELS } from "@/lib/enums"
import { cn } from "@/lib/utils"
import { NewOrganizationDialog } from "@/components/shared/NewOrganizationDialog"

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
  const [newOrgOpen, setNewOrgOpen] = useState(false)

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
  }

  const handleSwitchOrg = (tenantId: string) => {
    if (tenantId === tenant?.id || switchingId) return
    setSwitchingId(tenantId)
    switchTenant.mutate(tenantId, {
      onSuccess: () => { window.location.assign('/dashboard') },
      onError: () => setSwitchingId(null),
    })
  }

  const myTenants = tenants ?? []
  // Use role directly from auth store — always available without waiting for the tenants fetch
  const currentRole = authUser?.role

  return (
    <>
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
            <div className="px-5 pt-5 pb-4 bg-gradient-to-b from-muted/50 to-muted/20 border-b border-border shrink-0">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 rounded-full border-2 border-background shadow-sm shrink-0">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-full bg-primary text-primary-foreground text-sm font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  {/* Row 1: Name + role badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-bold leading-tight truncate text-foreground">{user.name}</p>
                    {currentRole && (
                      <span className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none shrink-0",
                        ROLE_BADGE_STYLE[currentRole] ?? '',
                      )}>
                        {ROLE_LABELS[currentRole] ?? labelFor(currentRole)}
                      </span>
                    )}
                  </div>
                  {/* Row 2: Email */}
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>

                  {/* Row 3: Company name + switch icon — clean, no border */}
                  {tenant && (
                    <div className="mt-2 flex items-center gap-1.5 min-w-0">
                      <Building2Icon className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                      <span className="text-xs font-bold text-foreground truncate flex-1">{tenant.name}</span>
                      {myTenants.length > 1 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger
                            className={cn(
                              'h-5 w-5 aspect-square shrink-0 rounded inline-flex items-center justify-center text-blue-700',
                              'hover:bg-blue-100',
                              'focus:bg-blue-100 data-[state=open]:bg-blue-100',
                              'transition-colors [&>svg:last-child]:hidden',
                            )}
                            aria-label={t('organizations.switch')}
                            title={t('organizations.switch')}
                          >
                            {switchingId
                              ? <Loader2Icon className="h-3 w-3 animate-spin" strokeWidth={2.5} />
                              : <ArrowRightLeftIcon className="h-3 w-3" strokeWidth={2.5} />}
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
                                      <span className={cn(
                                        "mt-0.5 inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold",
                                        ROLE_BADGE_STYLE[org.role] ?? 'bg-slate-100 text-slate-600 border-slate-200',
                                      )}>
                                        {labelFor(org.role)}
                                      </span>
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
                              <DropdownMenuItem onClick={() => setNewOrgOpen(true)} className="gap-2 rounded-md px-2.5 py-2 cursor-pointer">
                                <PlusIcon className="size-3.5 text-muted-foreground" />
                                <span className="text-sm">{t('organizations.new')}</span>
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-1.5 space-y-0.5 overflow-y-auto overscroll-contain min-h-0">

              {/* ── My Account — single grouped section ───────── */}
              <SectionLabel>{t('myAccount.title')}</SectionLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => navigate('/my/account')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer font-medium">
                  <UserCircleIcon className="size-4 text-primary shrink-0" />
                  <span className="text-sm">{t('myAccount.title')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/notifications')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                  <BellIcon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{t('nav.notifications')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                  <SettingsIcon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{t('nav.settings')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/my/login-history')} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                  <ShieldIcon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{t('auth.myLoginHistory')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleLanguage} className="gap-2.5 rounded-lg h-9 px-2.5 cursor-pointer">
                  <GlobeIcon className="size-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{t('common.switchLanguage')}</span>
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

    <NewOrganizationDialog open={newOrgOpen} onOpenChange={setNewOrgOpen} />
    </>
  )
}
