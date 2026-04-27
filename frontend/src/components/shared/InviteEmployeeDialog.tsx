import { useState } from 'react'
import { UserCheck, Mail, ShieldOff, RefreshCw, Shield } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, toast } from '@/components/ui/overlays'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/primitives'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils'
import { useEmployeeAccount, useInviteEmployee } from '@/hooks/useEmployees'
import { useUpdateUser } from '@/hooks/useSettings'
import type { Employee } from '@/types'

interface Props {
    employee: Employee
    open: boolean
    onOpenChange: (o: boolean) => void
}

export function InviteEmployeeDialog({ employee, open, onOpenChange }: Props) {
    const { data: accountData, isLoading } = useEmployeeAccount(employee.id)
    const invite = useInviteEmployee()
    const updateUser = useUpdateUser()
    const [emailOverride, setEmailOverride] = useState(employee.email ?? '')

    const close = () => onOpenChange(false)

    async function handleInvite() {
        try {
            await invite.mutateAsync({ employeeId: employee.id, email: emailOverride || undefined })
            toast.success('Invitation sent', `An invite email has been sent to ${emailOverride || employee.email}.`)
            close()
        } catch (err: unknown) {
            toast.error('Invite failed', (err as { message?: string })?.message ?? 'Could not send the invitation.')
        }
    }

    async function handleToggleActive(userId: string, activate: boolean) {
        try {
            await updateUser.mutateAsync({ id: userId, isActive: activate })
            toast.success(activate ? 'Account reactivated' : 'Account deactivated', `Login access has been ${activate ? 'restored' : 'revoked'}.`)
            close()
        } catch {
            toast.error('Update failed', 'Could not update the account status.')
        }
    }

    const account = accountData?.account

    return (
        <Dialog open={open} onOpenChange={o => !o && close()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4" />
                        Login Access — {employee.firstName} {employee.lastName}
                    </DialogTitle>
                    <DialogDescription>
                        Manage this employee's ability to log in to the self-service portal.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    {isLoading ? (
                        <div className="space-y-3">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : accountData?.hasAccount && account ? (
                        /* ── Has an account ── */
                        <div className="space-y-4">
                            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium">Account status</p>
                                    <Badge variant={account.isActive ? 'success' : 'secondary'}>
                                        {account.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                </div>
                                <div className="space-y-1 text-sm text-muted-foreground">
                                    <p className="flex items-center gap-2">
                                        <Mail className="h-3.5 w-3.5 shrink-0" />
                                        {account.email}
                                    </p>
                                    <p>Last login: {account.lastLoginAt ? formatDate(account.lastLoginAt) : 'Never'}</p>
                                    <p>Created: {formatDate(account.createdAt)}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ── No account yet ── */
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4">
                                <Shield className="h-8 w-8 text-muted-foreground/40 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium">No account yet</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Send an invitation so this employee can log in and view their leave, payslips, and profile.
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Invite email</Label>
                                <Input
                                    type="email"
                                    value={emailOverride}
                                    onChange={e => setEmailOverride(e.target.value)}
                                    placeholder="employee@company.com"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Pre-filled from employee record. Edit if different.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={close}>Cancel</Button>
                    {!isLoading && (
                        <>
                            {accountData?.hasAccount && account ? (
                                account.isActive ? (
                                    <Button
                                        variant="destructive"
                                        leftIcon={<ShieldOff className="h-3.5 w-3.5" />}
                                        onClick={() => handleToggleActive(account.id, false)}
                                        disabled={updateUser.isPending}
                                    >
                                        Deactivate
                                    </Button>
                                ) : (
                                    <Button
                                        leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                                        onClick={() => handleToggleActive(account.id, true)}
                                        disabled={updateUser.isPending}
                                    >
                                        Reactivate
                                    </Button>
                                )
                            ) : (
                                <Button
                                    leftIcon={<Mail className="h-3.5 w-3.5" />}
                                    onClick={handleInvite}
                                    disabled={invite.isPending || !emailOverride.trim()}
                                >
                                    {invite.isPending ? 'Sending…' : 'Send Invite'}
                                </Button>
                            )}
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
