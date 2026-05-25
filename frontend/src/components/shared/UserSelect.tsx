// ─── Shared User Picker ─────────────────────────────────────────────────────
// Sibling of EmployeeSelect, but for the *tenant users* table (login accounts).
// Used wherever a setting needs to pick a "user" rather than an "employee" —
// e.g. HR partners on the offboarding flow, approvers on a workflow rule,
// clearance owners that resolve to a login account.
//
// Why not just reuse EmployeeSelect?
//   • Users have a `role` + `isActive` flag that's relevant when picking an
//     approver (you usually only want active users with HR/manager roles).
//   • The same employee can have zero or many users; here we want the user id.
//   • The total user count per tenant is bounded (~10–100), so we can fetch
//     once via useTenantUsers and filter client-side in the Command — no
//     separate API needed.
//
// Single-select API matches EmployeeSelect; pass `multiple` to get a chip-
// based multi-select (used by the HR-partner picker).

import { useId, useMemo, useState } from 'react'
import { Check, ChevronDown, X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTenantUsers, type TenantUser } from '@/hooks/useSettings'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Command, CommandEmpty, CommandGroup,
    CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { cn, onActivate } from '@/lib/utils'

// ─── Shared bits ───────────────────────────────────────────────────────────

function UserAvatar({ user, size = 'sm' }: { user: Pick<TenantUser, 'name' | 'avatarUrl'>; size?: 'sm' | 'xs' }) {
    const initials = user.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('')
    const sizeClass = size === 'xs' ? 'size-5 text-[9px]' : 'size-6 text-[10px]'
    return user.avatarUrl ? (
        <img
            src={user.avatarUrl}
            alt={user.name}
            className={cn('rounded-full object-cover shrink-0 ring-1 ring-border', sizeClass)}
        />
    ) : (
        <span
            className={cn(
                'rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 ring-1 ring-border',
                sizeClass,
            )}
        >
            {initials || '?'}
        </span>
    )
}

interface BaseProps {
    placeholder?: string
    className?: string
    disabled?: boolean
    /** Only show users whose `role` is in this set. Omit to show all roles. */
    roleFilter?: string[]
    /** Hide inactive users from the dropdown. Default: true. */
    activeOnly?: boolean
    /** Exclude specific user ids (e.g. exclude self when picking a peer). */
    excludeIds?: string[]
}

interface SingleProps extends BaseProps {
    multiple?: false
    value: string
    onValueChange: (id: string) => void
    onUserChange?: (user: TenantUser | null) => void
    clearable?: boolean
}

interface MultiProps extends BaseProps {
    multiple: true
    value: string[]
    onValueChange: (ids: string[]) => void
}

type UserSelectProps = SingleProps | MultiProps

// ─── Component ─────────────────────────────────────────────────────────────

export function UserSelect(props: UserSelectProps) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const listboxId = useId()

    const usersQ = useTenantUsers()
    const allUsers = usersQ.data ?? []
    const isLoading = usersQ.isLoading

    const { roleFilter, activeOnly = true, excludeIds } = props
    const excludeSet = useMemo(() => new Set(excludeIds ?? []), [excludeIds])

    const filtered = useMemo(() => {
        const lc = search.trim().toLowerCase()
        return allUsers.filter((u) => {
            if (activeOnly && !u.isActive) return false
            if (roleFilter && roleFilter.length > 0 && !roleFilter.includes(u.role)) return false
            if (excludeSet.has(u.id)) return false
            if (!lc) return true
            return (
                u.name.toLowerCase().includes(lc) ||
                u.email.toLowerCase().includes(lc) ||
                (u.department?.toLowerCase().includes(lc) ?? false) ||
                (u.designation?.toLowerCase().includes(lc) ?? false)
            )
        })
    }, [allUsers, search, activeOnly, roleFilter, excludeSet])

    // ─── Single-select rendering ────────────────────────────────────────
    if (!props.multiple) {
        const { value, onValueChange, onUserChange, placeholder, className, disabled, clearable } = props
        const selectedUser = allUsers.find((u) => u.id === value) ?? null
        const displayName = selectedUser?.name ?? (value ? '…' : null)

        function handleOpenChange(next: boolean) {
            setOpen(next)
            if (!next) setSearch('')
        }

        return (
            <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        role="combobox"
                        aria-expanded={open}
                        aria-controls={listboxId}
                        disabled={disabled}
                        className={cn(
                            'flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm ring-offset-background transition-all duration-150',
                            open ? 'border-ring ring-2 ring-ring/20' : 'border-input hover:border-input/80',
                            'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                            !value && 'text-muted-foreground',
                            className,
                        )}
                    >
                        <span className="flex items-center gap-2 flex-1 min-w-0">
                            {selectedUser && <UserAvatar user={selectedUser} size="xs" />}
                            <span className="truncate text-left text-sm">
                                {displayName ?? (placeholder ?? t('common.selectUser', { defaultValue: 'Select user…' }))}
                            </span>
                        </span>
                        <span className="flex items-center shrink-0 ml-2 gap-1">
                            {clearable && value && (
                                <span
                                    role="button"
                                    tabIndex={0}
                                    aria-label={t('common.clear', { defaultValue: 'Clear' })}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onValueChange('')
                                        onUserChange?.(null)
                                    }}
                                    onKeyDown={onActivate(() => {
                                        onValueChange('')
                                        onUserChange?.(null)
                                    })}
                                    className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="size-3" />
                                </span>
                            )}
                            <ChevronDown
                                className={cn(
                                    'size-4 text-muted-foreground/60 transition-transform duration-200',
                                    open && 'rotate-180',
                                )}
                            />
                        </span>
                    </button>
                </PopoverTrigger>

                <PopoverContent
                    className="p-0 overflow-hidden border border-border shadow-lg"
                    align="start"
                    sideOffset={2}
                    style={{ width: 'var(--radix-popover-trigger-width)' }}
                >
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder={t('common.searchUsers', { defaultValue: 'Search users…' })}
                            value={search}
                            onValueChange={setSearch}
                            className="h-9 text-sm"
                        />
                        <CommandList id={listboxId} className="max-h-56 overflow-y-auto">
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                                    <Loader2 className="size-3.5 animate-spin" />
                                    {t('common.loading', { defaultValue: 'Loading…' })}
                                </div>
                            ) : filtered.length === 0 ? (
                                <CommandEmpty className="py-6 text-sm text-muted-foreground text-center">
                                    {t('common.noUsersFound', { defaultValue: 'No users found.' })}
                                </CommandEmpty>
                            ) : (
                                <CommandGroup className="p-1">
                                    {filtered.map((u) => (
                                        <CommandItem
                                            key={u.id}
                                            value={u.id}
                                            onSelect={() => {
                                                onValueChange(u.id)
                                                onUserChange?.(u)
                                                setOpen(false)
                                                setSearch('')
                                            }}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                                        >
                                            <Check
                                                className={cn(
                                                    'size-3.5 shrink-0 text-primary transition-opacity',
                                                    value === u.id ? 'opacity-100' : 'opacity-0',
                                                )}
                                            />
                                            <UserAvatar user={u} size="sm" />
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm leading-tight">{u.name}</span>
                                                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-tight truncate">
                                                    {u.email}
                                                    {u.department ? ` • ${u.department}` : ''}
                                                </span>
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        )
    }

    // ─── Multi-select rendering ─────────────────────────────────────────
    const { value, onValueChange, placeholder, className, disabled } = props
    const selectedIds = new Set(value)
    const selectedUsers = allUsers.filter((u) => selectedIds.has(u.id))

    function toggle(id: string) {
        if (selectedIds.has(id)) {
            onValueChange(value.filter((v) => v !== id))
        } else {
            onValueChange([...value, id])
        }
    }

    function handleOpenChangeMulti(next: boolean) {
        setOpen(next)
        if (!next) setSearch('')
    }

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <Popover open={open} onOpenChange={handleOpenChangeMulti}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        role="combobox"
                        aria-expanded={open}
                        aria-controls={listboxId}
                        disabled={disabled}
                        className={cn(
                            'flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm ring-offset-background transition-all duration-150',
                            open ? 'border-ring ring-2 ring-ring/20' : 'border-input hover:border-input/80',
                            'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                        )}
                    >
                        <span className="truncate text-left text-sm text-muted-foreground">
                            {value.length === 0
                                ? (placeholder ?? t('common.selectUsers', { defaultValue: 'Select users…' }))
                                : t('common.selectedUsers', { count: value.length, defaultValue: '{{count}} selected' })}
                        </span>
                        <ChevronDown
                            className={cn(
                                'size-4 text-muted-foreground/60 transition-transform duration-200 shrink-0',
                                open && 'rotate-180',
                            )}
                        />
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    className="p-0 overflow-hidden border border-border shadow-lg"
                    align="start"
                    sideOffset={2}
                    style={{ width: 'var(--radix-popover-trigger-width)' }}
                >
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder={t('common.searchUsers', { defaultValue: 'Search users…' })}
                            value={search}
                            onValueChange={setSearch}
                            className="h-9 text-sm"
                        />
                        <CommandList id={listboxId} className="max-h-56 overflow-y-auto">
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                                    <Loader2 className="size-3.5 animate-spin" />
                                    {t('common.loading', { defaultValue: 'Loading…' })}
                                </div>
                            ) : filtered.length === 0 ? (
                                <CommandEmpty className="py-6 text-sm text-muted-foreground text-center">
                                    {t('common.noUsersFound', { defaultValue: 'No users found.' })}
                                </CommandEmpty>
                            ) : (
                                <CommandGroup className="p-1">
                                    {filtered.map((u) => {
                                        const selected = selectedIds.has(u.id)
                                        return (
                                            <CommandItem
                                                key={u.id}
                                                value={u.id}
                                                onSelect={() => toggle(u.id)}
                                                className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                                            >
                                                <Check
                                                    className={cn(
                                                        'size-3.5 shrink-0 text-primary transition-opacity',
                                                        selected ? 'opacity-100' : 'opacity-0',
                                                    )}
                                                />
                                                <UserAvatar user={u} size="sm" />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm leading-tight">{u.name}</span>
                                                    <span className="block text-[11px] text-muted-foreground mt-0.5 leading-tight truncate">
                                                        {u.email}
                                                        {u.department ? ` • ${u.department}` : ''}
                                                    </span>
                                                </span>
                                            </CommandItem>
                                        )
                                    })}
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selectedUsers.map((u) => (
                        <span
                            key={u.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                            <UserAvatar user={u} size="xs" />
                            <span className="font-medium">{u.name}</span>
                            <button
                                type="button"
                                onClick={() => toggle(u.id)}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label={t('common.remove', { defaultValue: 'Remove' })}
                            >
                                <X className="size-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}
