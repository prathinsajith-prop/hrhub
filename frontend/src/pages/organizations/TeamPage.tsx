import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { labelFor } from '@/lib/enums'
import { type ColumnDef } from '@tanstack/react-table'
import { UserPlus, MoreHorizontal, Copy, Mail, RefreshCcw } from 'lucide-react'
import { useTenantMembers, useInviteMember, useChangeMemberRole, useRemoveMember, type MemberRole, type MemberRow } from '@/hooks/useTenants'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { ApiError } from '@/lib/api'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { getInitials, formatDate } from '@/lib/utils'

const ROLE_VALUES: MemberRole[] = ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee']

const STATUS_VARIANT: Record<MemberRow['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
    accepted: 'default',
    pending: 'secondary',
    revoked: 'destructive',
}

export function TeamPage() {
    const { t } = useTranslation()
    const me = useAuthStore((s) => s.user)
    const { data: members, isLoading, isFetching, refetch } = useTenantMembers()
    const inviteMut = useInviteMember()
    const roleMut = useChangeMemberRole()
    const removeMut = useRemoveMember()

    const [inviteOpen, setInviteOpen] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<MemberRole>('employee')
    const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)
    const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null)

    const canManage = me?.role === 'super_admin' || me?.role === 'hr_manager'

    const submitInvite = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const res = await inviteMut.mutateAsync({ email: inviteEmail.trim(), role: inviteRole })
            setLastInviteUrl(res.acceptUrl)
            toast.success(t('team.invitationSent'))
            setInviteEmail('')
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('team.inviteFailed'))
        }
    }

    const onRoleChange = async (row: MemberRow, role: MemberRole) => {
        try {
            await roleMut.mutateAsync({ id: row.id, role })
            toast.success(t('team.roleUpdated'))
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('team.roleUpdateFailed'))
        }
    }

    const confirmRemove = async () => {
        if (!removeTarget) return
        try {
            await removeMut.mutateAsync(removeTarget.id)
            toast.success(t('team.memberRemoved'))
            setRemoveTarget(null)
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('team.removeFailed'))
        }
    }

    const columns = useMemo<ColumnDef<MemberRow>[]>(() => [
        {
            id: 'member',
            header: t('team.member'),
            cell: ({ row }) => {
                const m = row.original
                const name = m.userName ?? m.invitedEmail ?? t('team.pendingInvite')
                return (
                    <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                            {m.userAvatar && <AvatarImage src={m.userAvatar} alt={name} />}
                            <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{name}</div>
                            <div className="text-xs text-muted-foreground truncate">{m.userEmail ?? m.invitedEmail}</div>
                        </div>
                    </div>
                )
            },
        },
        {
            accessorKey: 'role',
            header: t('team.role'),
            cell: ({ row }) => {
                const m = row.original
                if (!canManage || m.userId === me?.id) {
                    return <Badge variant="outline" className="capitalize">{t(`team.roles.${m.role}`, { defaultValue: labelFor(m.role) })}</Badge>
                }
                return (
                    <Select value={m.role} onValueChange={(v) => onRoleChange(m, v as MemberRole)}>
                        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {ROLE_VALUES.map((r) => <SelectItem key={r} value={r}>{t(`team.roles.${r}`)}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )
            },
            size: 180,
        },
        {
            accessorKey: 'status',
            header: t('team.status'),
            cell: ({ row }) => (
                <Badge variant={STATUS_VARIANT[row.original.status]} className="capitalize text-[10px]">
                    {t(`team.statuses.${row.original.status}`, { defaultValue: row.original.status })}
                </Badge>
            ),
            size: 100,
        },
        {
            accessorKey: 'createdAt',
            header: t('team.joined'),
            cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{formatDate(getValue() as string)}</span>,
            size: 130,
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => {
                const m = row.original
                if (!canManage || m.userId === me?.id) return null
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setRemoveTarget(m)} className="text-destructive">
                                {t('team.removeFromTeam')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled>{t('team.viewActivity')}</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            },
            size: 44,
        },
    ], [canManage, me?.id, t])

    const total = members?.length ?? 0
    const pending = members?.filter((m) => m.status === 'pending').length ?? 0

    return (
        <PageWrapper>
            <PageHeader
                title={t('team.title')}
                description={t('team.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                            Refresh
                        </Button>
                        {canManage && (
                            <Button size="sm" leftIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => { setInviteOpen(true); setLastInviteUrl(null) }}>
                                {t('team.inviteMember')}
                            </Button>
                        )}
                    </div>
                }
            />

            <Card>
                <CardHeader className="flex-row items-start justify-between gap-3 flex-wrap">
                    <div>
                        <CardTitle className="text-base">{t('team.members')}</CardTitle>
                        <CardDescription className="mt-0.5">
                            {t('team.totalPending', { total, pending })}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={members ?? []}
                        isLoading={isLoading}
                        emptyMessage={t('team.noMembers')}
                    />
                </CardContent>
            </Card>

            {/* Invite dialog */}
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent className="sm:max-w-lg overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>{t('team.inviteMember')}</DialogTitle>
                        <DialogDescription>
                            {t('team.description')}
                        </DialogDescription>
                    </DialogHeader>

                    <form id="invite-form" onSubmit={submitInvite} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="invite-email">{t('team.emailLabel')} *</Label>
                            <Input
                                id="invite-email"
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="person@example.com"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('team.roleLabel')}</Label>
                            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as MemberRole)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ROLE_VALUES.map((r) => <SelectItem key={r} value={r}>{t(`team.roles.${r}`)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {lastInviteUrl && (
                            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Mail className="h-3.5 w-3.5 shrink-0" />
                                    Invitation sent — share this link if the email doesn't arrive
                                </p>
                                <div className="flex min-w-0 items-center gap-2">
                                    <code className="min-w-0 flex-1 truncate text-[11px] font-mono bg-background border border-border rounded px-2 py-1.5 text-foreground">{lastInviteUrl}</code>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0"
                                        onClick={() => { navigator.clipboard.writeText(lastInviteUrl); toast.success(t('team.linkCopied')) }}
                                        leftIcon={<Copy className="h-3.5 w-3.5" />}
                                    >
                                        {t('apps.copy')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </form>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>{t('common.close')}</Button>
                        <Button type="submit" form="invite-form" loading={inviteMut.isPending} leftIcon={<Mail className="h-3.5 w-3.5" />}>
                            {t('team.sendInvite')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!removeTarget}
                onOpenChange={(o) => !o && setRemoveTarget(null)}
                title={t('team.removeConfirmTitle')}
                description={t('team.removeConfirmDesc')}
                confirmLabel={t('common.delete')}
                variant="destructive"
                onConfirm={confirmRemove}
            />
        </PageWrapper>
    )
}
