import { useState } from 'react'
import { UserCheck, Mail, ShieldOff, ShieldCheck, RefreshCw, Shield, Clock, Calendar, Send } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, toast } from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/primitives'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { useEmployeeAccount, useInviteEmployee, useResendInvite } from '@/hooks/useEmployees'
import { useUpdateUser } from '@/hooks/useSettings'
import { useAuthStore } from '@/store/authStore'
import { MultiRoleToggle, MULTI_ROLE_OPTIONS, MULTI_ROLE_OPTIONS_WITH_SUPER } from '@/components/shared/MultiRoleToggle'
import type { Employee } from '@/types'

interface RoleSelectorProps {
    userId: string
    currentRoles: string[]
    selectedRoles: string[]
    availableOptions: readonly { id: string; label: string }[]
    onRolesChange: (roles: string[]) => void
    onSave: (userId: string) => void
    isSaving: boolean
}

function RoleSelector({ userId, currentRoles, selectedRoles, availableOptions, onRolesChange, onSave, isSaving }: RoleSelectorProps) {
    const isDirty = JSON.stringify(selectedRoles.toSorted()) !== JSON.stringify(currentRoles.toSorted())
    return (
        <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Roles</p>
            <div className="flex items-center gap-2 flex-wrap">
                <MultiRoleToggle
                    roles={selectedRoles}
                    onChange={onRolesChange}
                    availableRoles={availableOptions}
                    disabled={isSaving}
                />
                {isDirty && (
                    <Button
                        size="sm"
                        className="h-6 text-xs shrink-0"
                        onClick={() => onSave(userId)}
                        loading={isSaving}
                    >
                        Save
                    </Button>
                )}
            </div>
        </div>
    )
}

interface FeatureFlagsSectionProps {
    userId: string
    initialPunch: boolean
    initialManual: boolean
    onSave: (userId: string, patch: { attendancePunchEnabled?: boolean; attendanceManualEntryEnabled?: boolean }) => void
    isSaving: boolean
}

/**
 * Two-switch panel for the per-user attendance toggles. Mirrors the layout
 * used on the Users page so HR sees the same control wherever they reach
 * Manage Access from. State is local-draft-with-Save (dirty-only) to match
 * the RoleSelector pattern above.
 */
function FeatureFlagsSection({ userId, initialPunch, initialManual, onSave, isSaving }: FeatureFlagsSectionProps) {
    const [punch, setPunch] = useState(initialPunch)
    const [manual, setManual] = useState(initialManual)
    // Reset draft state if the underlying user changes (e.g. dialog reopened
    // for a different employee).
    const [syncKey, setSyncKey] = useState(`${userId}:${initialPunch}:${initialManual}`)
    const nextKey = `${userId}:${initialPunch}:${initialManual}`
    if (nextKey !== syncKey) {
        setSyncKey(nextKey)
        setPunch(initialPunch)
        setManual(initialManual)
    }
    const dirty = punch !== initialPunch || manual !== initialManual
    return (
        <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Features</p>
            <div className="rounded-lg border bg-muted/20 divide-y">
                <label htmlFor={`punch-${userId}`} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer">
                    <div className="min-w-0">
                        <p className="text-sm font-medium">Attendance check-in / check-out</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                            When off, the live check-in / check-out buttons are hidden on the employee portal.
                        </p>
                    </div>
                    <Switch
                        id={`punch-${userId}`}
                        checked={punch}
                        onCheckedChange={setPunch}
                        disabled={isSaving}
                    />
                </label>
                <label htmlFor={`manual-${userId}`} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer">
                    <div className="min-w-0">
                        <p className="text-sm font-medium">Manual entry</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                            When off, the back-fill panel that lets the user add a past check-in / check-out is hidden.
                        </p>
                    </div>
                    <Switch
                        id={`manual-${userId}`}
                        checked={manual}
                        onCheckedChange={setManual}
                        disabled={isSaving}
                    />
                </label>
            </div>
            {dirty && (
                <div className="flex justify-end">
                    <Button
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => onSave(userId, {
                            ...(punch !== initialPunch ? { attendancePunchEnabled: punch } : {}),
                            ...(manual !== initialManual ? { attendanceManualEntryEnabled: manual } : {}),
                        })}
                        loading={isSaving}
                    >
                        Save
                    </Button>
                </div>
            )}
        </div>
    )
}

interface Props {
    employee: Employee
    open: boolean
    onOpenChange: (o: boolean) => void
}

type AccountState = 'no-account' | 'invite-pending' | 'deactivated' | 'active'

export function InviteEmployeeDialog({ employee, open, onOpenChange }: Props) {
    const { data: accountData, isLoading } = useEmployeeAccount(employee.id)
    const invite = useInviteEmployee()
    const resend = useResendInvite()
    const updateUser = useUpdateUser()
    const callerRole = useAuthStore(s => s.user?.role)
    const callerIsSuperAdmin = callerRole === 'super_admin'

    // Use || (not ??) so empty strings fall through to the next option
    const derivedEmail = employee.workEmail || employee.email || employee.personalEmail || ''
    const [emailInput, setEmailInput] = useState(derivedEmail)
    const [selectedRoles, setSelectedRoles] = useState<string[]>(['employee'])

    // Sync email when the dialog opens or employee changes.
    const [prevOpen, setPrevOpen] = useState(false)
    const [prevEmployeeId, setPrevEmployeeId] = useState(employee.id)
    if ((open && !prevOpen) || (open && employee.id !== prevEmployeeId)) {
        setPrevOpen(open)
        setPrevEmployeeId(employee.id)
        setEmailInput(employee.workEmail || employee.email || employee.personalEmail || '')
    } else if (!open && prevOpen) {
        setPrevOpen(false)
    }

    // Sync roles when account data loads.
    const loadedRole = accountData?.account?.role
    const loadedRoles = accountData?.account?.roles
    const [prevLoadedRole, setPrevLoadedRole] = useState<string | undefined>(undefined)
    if (loadedRole !== undefined && loadedRole !== prevLoadedRole) {
        setPrevLoadedRole(loadedRole)
        setSelectedRoles(loadedRoles?.length ? loadedRoles : [loadedRole])
    }

    const availableOptions = callerIsSuperAdmin ? MULTI_ROLE_OPTIONS_WITH_SUPER : MULTI_ROLE_OPTIONS

    const close = () => onOpenChange(false)

    const account = accountData?.account
    const employeeName =
        employee.fullName ||
        `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim() ||
        'Employee'

    const state: AccountState = !accountData?.hasAccount
        ? 'no-account'
        : !account?.isActive
            ? (account?.lastLoginAt ? 'deactivated' : 'invite-pending')
            : 'active'

    async function handleInvite() {
        const email = emailInput.trim()
        if (!email) { toast.error('Email required', 'Please enter an email address to send the invite.'); return }
        try {
            await invite.mutateAsync({ employeeId: employee.id, email, role: selectedRoles[0], roles: selectedRoles })
            toast.success('Invitation sent', `An invite email has been sent to ${email}.`)
            close()
        } catch (err: unknown) {
            toast.error('Invite failed', (err as { message?: string })?.message ?? 'Could not send the invitation.')
        }
    }

    async function handleResend() {
        try {
            await resend.mutateAsync({ employeeId: employee.id })
            toast.success('Invite resent', 'A fresh invite link has been emailed.')
            close()
        } catch (err: unknown) {
            toast.error('Resend failed', (err as { message?: string })?.message ?? 'Could not resend the invitation.')
        }
    }

    async function handleToggleActive(userId: string, activate: boolean) {
        try {
            await updateUser.mutateAsync({ id: userId, isActive: activate })
            toast.success(
                activate ? 'Account reactivated' : 'Access revoked',
                `Login access has been ${activate ? 'restored' : 'revoked'}.`,
            )
            close()
        } catch {
            toast.error('Update failed', 'Could not update the account status.')
        }
    }

    async function handleSaveRoles(userId: string) {
        try {
            await updateUser.mutateAsync({ id: userId, roles: selectedRoles, role: selectedRoles[0] })
            toast.success('Roles updated')
        } catch {
            toast.error('Update failed', 'Could not update the roles.')
        }
    }

    async function handleSaveFeatureFlags(
        userId: string,
        patch: { attendancePunchEnabled?: boolean; attendanceManualEntryEnabled?: boolean },
    ) {
        if (Object.keys(patch).length === 0) return
        try {
            await updateUser.mutateAsync({ id: userId, ...patch })
            toast.success('Features updated')
        } catch {
            toast.error('Update failed', 'Could not update the feature switches.')
        }
    }

    return (
        <Dialog open={open} onOpenChange={o => !o && close()}>
            <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden gap-0">

                {/* Header */}
                <div className="flex items-center gap-3.5 px-6 py-5 border-b">
                    <div className="size-9 rounded-xl bg-primary/10 ring-1 ring-primary/15 flex items-center justify-center text-primary shrink-0">
                        <UserCheck className="size-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground leading-none mb-1">
                            Login Access
                        </p>
                        <DialogTitle className="text-sm font-semibold leading-none truncate">
                            {employeeName}
                        </DialogTitle>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                    {isLoading ? (
                        <div className="space-y-2.5">
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-3.5 w-full" />
                            <Skeleton className="h-3.5 w-4/5" />
                        </div>
                    ) : state === 'no-account' ? (
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="size-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                                    <Shield className="size-5 text-muted-foreground" />
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-semibold">No login account yet</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Send an invitation so this employee can log in and access their leave, payslips, and profile.
                                    </p>
                                </div>
                            </div>

                            {/* Editable email */}
                            <div className="space-y-1.5">
                                <Label className="text-xs">Email address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        value={emailInput}
                                        onChange={e => setEmailInput(e.target.value)}
                                        placeholder="employee@example.com"
                                        className="pl-9"
                                    />
                                </div>
                                {!emailInput.trim() && (
                                    <p className="text-[11px] text-destructive">
                                        No email on file - enter one above to send the invite.
                                    </p>
                                )}
                            </div>

                            {/* Role picker */}
                            <div className="space-y-1.5">
                                <Label className="text-xs">Roles</Label>
                                <MultiRoleToggle
                                    roles={selectedRoles}
                                    onChange={setSelectedRoles}
                                    availableRoles={availableOptions}
                                />
                            </div>
                        </div>
                    ) : state === 'deactivated' ? (
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="size-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                                    <ShieldOff className="size-5 text-destructive" />
                                </div>
                                <div className="min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold">Access revoked</p>
                                        <Badge variant="destructive" className="text-[10px]">Deactivated</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        This employee's login access has been revoked. Restore it to allow them to sign in again.
                                    </p>
                                    {account?.email && (
                                        <div className="flex items-center gap-2 pt-0.5">
                                            <Mail className="size-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground truncate">{account.email}</span>
                                        </div>
                                    )}
                                    {account?.lastLoginAt && (
                                        <div className="flex items-center gap-2 pt-0.5">
                                            <Clock className="size-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground">Last login: {formatDate(account.lastLoginAt)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {account && <>
                                <RoleSelector userId={account.id} currentRoles={account.roles?.length ? account.roles : [account.role]} selectedRoles={selectedRoles} availableOptions={availableOptions} onRolesChange={setSelectedRoles} onSave={handleSaveRoles} isSaving={updateUser.isPending} />
                                <FeatureFlagsSection
                                    userId={account.id}
                                    initialPunch={account.attendancePunchEnabled ?? true}
                                    initialManual={account.attendanceManualEntryEnabled ?? true}
                                    onSave={handleSaveFeatureFlags}
                                    isSaving={updateUser.isPending}
                                />
                            </>}
                        </div>
                    ) : state === 'invite-pending' ? (
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="size-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                                    <Send className="size-5 text-warning" />
                                </div>
                                <div className="min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold">Invite pending</p>
                                        <Badge variant="warning" className="text-[10px]">Awaiting setup</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        An invite was sent but the employee hasn't set their password yet. You can resend a fresh link.
                                    </p>
                                    {account?.email && (
                                        <div className="flex items-center gap-2 pt-0.5">
                                            <Mail className="size-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-xs text-muted-foreground truncate">{account.email}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 pt-0.5">
                                        <Calendar className="size-3.5 text-muted-foreground shrink-0" />
                                        <span className="text-xs text-muted-foreground">Invited {formatDate(account?.createdAt ?? '')}</span>
                                    </div>
                                </div>
                            </div>
                            {account && <>
                                <RoleSelector userId={account.id} currentRoles={account.roles?.length ? account.roles : [account.role]} selectedRoles={selectedRoles} availableOptions={availableOptions} onRolesChange={setSelectedRoles} onSave={handleSaveRoles} isSaving={updateUser.isPending} />
                                <FeatureFlagsSection
                                    userId={account.id}
                                    initialPunch={account.attendancePunchEnabled ?? true}
                                    initialManual={account.attendanceManualEntryEnabled ?? true}
                                    onSave={handleSaveFeatureFlags}
                                    isSaving={updateUser.isPending}
                                />
                            </>}
                        </div>
                    ) : (
                        <div className="space-y-3.5">
                            <div className="flex items-center gap-2">
                                <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-sm font-medium">Active</span>
                                <Badge variant="success" className="text-[10px]">Can log in</Badge>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2.5">
                                    <Mail className="size-3.5 text-muted-foreground shrink-0" />
                                    <span className="truncate">{account?.email}</span>
                                </div>
                                <div className="flex items-center gap-2.5 text-muted-foreground">
                                    <Clock className="size-3.5 shrink-0" />
                                    <span>Last login: {account?.lastLoginAt ? formatDate(account.lastLoginAt) : 'Never'}</span>
                                </div>
                                <div className="flex items-center gap-2.5 text-muted-foreground">
                                    <Calendar className="size-3.5 shrink-0" />
                                    <span>Created {formatDate(account?.createdAt ?? '')}</span>
                                </div>
                            </div>
                            {account && <>
                                <RoleSelector userId={account.id} currentRoles={account.roles?.length ? account.roles : [account.role]} selectedRoles={selectedRoles} availableOptions={availableOptions} onRolesChange={setSelectedRoles} onSave={handleSaveRoles} isSaving={updateUser.isPending} />
                                <FeatureFlagsSection
                                    userId={account.id}
                                    initialPunch={account.attendancePunchEnabled ?? true}
                                    initialManual={account.attendanceManualEntryEnabled ?? true}
                                    onSave={handleSaveFeatureFlags}
                                    isSaving={updateUser.isPending}
                                />
                            </>}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/30">
                    <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>

                    {!isLoading && state === 'no-account' && (
                        <Button
                            size="sm"
                            leftIcon={<Mail className="size-3.5" />}
                            onClick={handleInvite}
                            loading={invite.isPending}
                            disabled={!emailInput.trim()}
                        >
                            Send Invite
                        </Button>
                    )}

                    {!isLoading && state === 'deactivated' && account && (
                        <Button
                            size="sm"
                            leftIcon={<ShieldCheck className="size-3.5" />}
                            onClick={() => handleToggleActive(account.id, true)}
                            loading={updateUser.isPending}
                        >
                            Restore Access
                        </Button>
                    )}

                    {!isLoading && state === 'invite-pending' && (
                        <Button
                            size="sm"
                            leftIcon={<RefreshCw className="size-3.5" />}
                            onClick={handleResend}
                            loading={resend.isPending}
                        >
                            Resend Invite
                        </Button>
                    )}

                    {!isLoading && state === 'active' && account && (
                        <Button
                            size="sm"
                            variant="destructive"
                            leftIcon={<ShieldOff className="size-3.5" />}
                            onClick={() => handleToggleActive(account.id, false)}
                            loading={updateUser.isPending}
                        >
                            Revoke Access
                        </Button>
                    )}
                </div>

            </DialogContent>
        </Dialog>
    )
}
