// ─── Employee Search Select ─────────────────────────────────────────────────
// Project-wide convention for picking an employee. Every employee-listing
// dropdown should use this — no inline `<Select>` over `employees.map(...)`.
//
// Contract:
//   • API-backed search   → 300ms debounce, server-side `?search=` query.
//                            No client-side filter (Command's `shouldFilter` is
//                            off) — what the API returns is what's shown.
//   • Initial limit = 25  → first open fetches the most recent 25 active
//                            employees. To see more, the user must type.
//   • Status filter       → defaults to `active`. Pass status="onboarding" or
//                            "inactive" if your context needs those.
//   • Hydration safe      → when `value` is set to an employee outside the
//                            current 25, we issue a one-off `useEmployee(id)`
//                            fetch so the trigger button can render the name
//                            without forcing a search.
//
// If you find yourself prefetching a big employee list elsewhere just so you
// can render a `<Select>` of names, swap it for this component instead.

import { useId, useState, useEffect } from 'react'
import { Check, ChevronDown, X, Loader2 } from 'lucide-react'
import { useEmployees, useEmployee } from '@/hooks/useEmployees'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Command, CommandEmpty, CommandGroup,
    CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { cn, onActivate } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import type { Employee } from '@/types'

interface EmployeeSelectProps {
    value: string
    onValueChange: (id: string) => void
    /** Called with the full employee object whenever a selection or clear happens. */
    onEmployeeChange?: (employee: Employee | null) => void
    status?: 'active' | 'onboarding' | 'inactive'
    placeholder?: string
    className?: string
    disabled?: boolean
    clearable?: boolean
    /** Exclude a specific employee ID from the results (e.g. exclude self in handover selects) */
    excludeId?: string
    /**
     * Number of employees fetched on first open and on every keystroke. Default 25.
     *
     * Don't override this for visual reasons. The whole point of the typeahead
     * is that the list is bounded — bumping the limit defeats the contract.
     */
    initialLimit?: number
}

function EmployeeAvatar({ employee, size = 'sm' }: { employee: Pick<Employee, 'firstName' | 'lastName' | 'avatarUrl'>; size?: 'sm' | 'xs' }) {
    const initials = `${employee.firstName?.[0] ?? ''}${employee.lastName?.[0] ?? ''}`.toUpperCase()
    const sizeClass = size === 'xs' ? 'size-5 text-[9px]' : 'size-6 text-[10px]'
    return employee.avatarUrl ? (
        <img
            src={employee.avatarUrl}
            alt={`${employee.firstName} ${employee.lastName}`}
            className={cn('rounded-full object-cover shrink-0 ring-1 ring-border', sizeClass)}
        />
    ) : (
        <span className={cn(
            'rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center shrink-0 ring-1 ring-border',
            sizeClass,
        )}>
            {initials}
        </span>
    )
}

export function EmployeeSelect({
    value, onValueChange, onEmployeeChange, status = 'active',
    placeholder, className, disabled = false, clearable = false, excludeId,
    initialLimit = 25,
}: EmployeeSelectProps) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const listboxId = useId()

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(timer)
    }, [search])

    const { data, isFetching } = useEmployees({
        search: debouncedSearch || undefined,
        status,
        limit: initialLimit,
    })

    const employees = (data?.data ?? []).filter(e => !excludeId || e.id !== excludeId)
    const selectedInResults = employees.find(e => e.id === value)

    // Distinguish "loading initial 25" from "fetching matches as the user
    // types" — the trailing footer copy and overlay both depend on it.
    const isSearching = isFetching && debouncedSearch.length > 0
    const total = data?.total ?? employees.length
    const hasMoreOnServer = !debouncedSearch && total > employees.length

    // Pre-fetch selected employee name if not in current search results
    const { data: resolvedEmployee } = useEmployee(value && !selectedInResults ? value : '')

    const selectedEmployee = selectedInResults ?? resolvedEmployee ?? null
    const displayName = selectedEmployee
        ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
        : value ? '…' : null

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
                        open
                            ? 'border-ring ring-2 ring-ring/20'
                            : 'border-input hover:border-input/80',
                        'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                        !value && 'text-muted-foreground',
                        className,
                    )}
                >
                    <span className="flex items-center gap-2 flex-1 min-w-0">
                        {selectedEmployee && (
                            <EmployeeAvatar employee={selectedEmployee} size="xs" />
                        )}
                        <span className="truncate text-left text-sm">
                            {displayName ?? (placeholder ?? t('common.selectEmployee', 'Select employee…'))}
                        </span>
                    </span>
                    <span className="flex items-center shrink-0 ml-2 gap-1">
                        {clearable && value && (
                            <span
                                role="button"
                                tabIndex={0}
                                aria-label="Clear"
                                onClick={e => { e.stopPropagation(); onValueChange(''); onEmployeeChange?.(null) }}
                                onKeyDown={onActivate(() => { onValueChange(''); onEmployeeChange?.(null) })}
                                className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="size-3" />
                            </span>
                        )}
                        <ChevronDown className={cn(
                            'size-4 text-muted-foreground/60 transition-transform duration-200',
                            open && 'rotate-180',
                        )} />
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
                        placeholder={t('common.searchEmployees', 'Search employees…')}
                        value={search}
                        onValueChange={setSearch}
                        className="h-9 text-sm"
                    />
                    <CommandList id={listboxId} className="max-h-56 overflow-y-auto">
                        {isFetching && employees.length === 0 ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" />
                                {isSearching
                                    ? t('common.searching', { defaultValue: 'Searching…' })
                                    : t('common.loading', 'Loading…')}
                            </div>
                        ) : employees.length === 0 ? (
                            <CommandEmpty className="py-6 text-sm text-muted-foreground text-center">
                                {debouncedSearch
                                    ? t('common.noEmployeeMatches', { q: debouncedSearch, defaultValue: 'No employees match "{{q}}".' })
                                    : t('common.noResults', 'No employees found.')}
                            </CommandEmpty>
                        ) : (
                            <CommandGroup className="p-1">
                                {employees.map(emp => (
                                    <CommandItem
                                        key={emp.id}
                                        value={emp.id}
                                        onSelect={() => {
                                            onValueChange(emp.id)
                                            onEmployeeChange?.(emp)
                                            setOpen(false)
                                            setSearch('')
                                        }}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                                    >
                                        <Check className={cn(
                                            'size-3.5 shrink-0 text-primary transition-opacity',
                                            value === emp.id ? 'opacity-100' : 'opacity-0',
                                        )} />
                                        <EmployeeAvatar employee={emp} size="sm" />
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm leading-tight">
                                                {emp.firstName} {emp.lastName}
                                            </span>
                                            {emp.department && (
                                                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                                    {emp.department}
                                                </span>
                                            )}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                    {/* Footer hint: tells the user the list is bounded and that
                        typing narrows the server query. Only shown when the
                        first page is back AND the server has more matches the
                        user hasn't seen — otherwise the chrome is noise. */}
                    {employees.length > 0 && hasMoreOnServer && (
                        <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                            <span>
                                {t('common.employeeSelect.showingFirst', {
                                    shown: employees.length,
                                    total,
                                    defaultValue: 'Showing first {{shown}} of {{total}}',
                                })}
                            </span>
                            <span className="italic">
                                {t('common.employeeSelect.typeToFilter', { defaultValue: 'Type to search' })}
                            </span>
                        </div>
                    )}
                </Command>
            </PopoverContent>
        </Popover>
    )
}
