import { useState, useEffect } from 'react'
import { Check, ChevronDown, X, Loader2 } from 'lucide-react'
import { useEmployees, useEmployee } from '@/hooks/useEmployees'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Command, CommandEmpty, CommandGroup,
    CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import type { Employee } from '@/types'

interface EmployeeSelectProps {
    value: string
    onValueChange: (id: string) => void
    status?: 'active' | 'onboarding' | 'inactive'
    placeholder?: string
    className?: string
    disabled?: boolean
    clearable?: boolean
    /** Exclude a specific employee ID from the results (e.g. exclude self in handover selects) */
    excludeId?: string
}

function EmployeeAvatar({ employee, size = 'sm' }: { employee: Pick<Employee, 'firstName' | 'lastName' | 'avatarUrl'>; size?: 'sm' | 'xs' }) {
    const initials = `${employee.firstName?.[0] ?? ''}${employee.lastName?.[0] ?? ''}`.toUpperCase()
    const sizeClass = size === 'xs' ? 'h-5 w-5 text-[9px]' : 'h-6 w-6 text-[10px]'
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
    value, onValueChange, status = 'active',
    placeholder, className, disabled = false, clearable = false, excludeId,
}: EmployeeSelectProps) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300)
        return () => clearTimeout(timer)
    }, [search])

    const { data, isFetching } = useEmployees({
        search: debouncedSearch || undefined,
        status,
        limit: 20,
    })

    const employees = (data?.data ?? []).filter(e => !excludeId || e.id !== excludeId)
    const selectedInResults = employees.find(e => e.id === value)

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
                                aria-label="Clear"
                                onClick={e => { e.stopPropagation(); onValueChange('') }}
                                className="flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-3 w-3" />
                            </span>
                        )}
                        <ChevronDown className={cn(
                            'h-4 w-4 text-muted-foreground/60 transition-transform duration-200',
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
                    <CommandList className="max-h-56 overflow-y-auto">
                        {isFetching ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                {t('common.loading', 'Loading…')}
                            </div>
                        ) : employees.length === 0 ? (
                            <CommandEmpty className="py-6 text-sm text-muted-foreground text-center">
                                {debouncedSearch
                                    ? t('common.noResults', 'No employees found.')
                                    : t('common.typeToSearch', 'Start typing to search.')}
                            </CommandEmpty>
                        ) : (
                            <CommandGroup className="p-1">
                                {employees.map(emp => (
                                    <CommandItem
                                        key={emp.id}
                                        value={emp.id}
                                        onSelect={() => {
                                            onValueChange(emp.id)
                                            setOpen(false)
                                            setSearch('')
                                        }}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                                    >
                                        <Check className={cn(
                                            'h-3.5 w-3.5 shrink-0 text-primary transition-opacity',
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
                </Command>
            </PopoverContent>
        </Popover>
    )
}
