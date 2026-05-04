import { useState } from 'react'
import { Check, ChevronDown, X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Command, CommandEmpty, CommandGroup,
    CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'

export interface ComboboxOption {
    value: string
    label: string
    /** Shown beneath the label in smaller muted text */
    secondary?: string
}

interface ComboboxProps {
    value: string
    onValueChange: (value: string) => void
    options: ComboboxOption[]
    placeholder?: string
    searchPlaceholder?: string
    emptyMessage?: string
    className?: string
    disabled?: boolean
    clearable?: boolean
    /** Allow typing a custom value not in the list */
    creatable?: boolean
}

export function Combobox({
    value, onValueChange, options,
    placeholder = 'Select…',
    searchPlaceholder = 'Search…',
    emptyMessage = 'No results.',
    className, disabled = false, clearable = false, creatable = false,
}: ComboboxProps) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')

    const selected = options.find(o => o.value.toLowerCase() === value.toLowerCase())
    const displayLabel = selected?.label ?? value

    const exactMatch = options.some(
        o => o.label.toLowerCase() === search.trim().toLowerCase(),
    )
    const showCreate = creatable && search.trim().length > 0 && !exactMatch

    function handleSelect(optValue: string) {
        onValueChange(optValue === value ? '' : optValue)
        setSearch('')
        setOpen(false)
    }

    function handleCreate() {
        const trimmed = search.trim()
        if (trimmed) {
            onValueChange(trimmed)
            setSearch('')
            setOpen(false)
        }
    }

    return (
        <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch('') }}>
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
                        'focus:outline-none',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        !value && 'text-muted-foreground',
                        className,
                    )}
                >
                    <span className="truncate text-left flex-1 min-w-0 text-sm">
                        {value ? displayLabel : placeholder}
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
                className="p-0 overflow-hidden border border-border shadow-lg min-w-[320px]"
                align="start"
                sideOffset={2}
                style={{ width: 'var(--radix-popover-trigger-width)' }}
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={searchPlaceholder}
                        className="h-9 py-2 text-sm"
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList className="max-h-56 overflow-y-auto">
                        {!showCreate && (
                            <CommandEmpty className="py-5 text-sm text-muted-foreground text-center">
                                {emptyMessage}
                            </CommandEmpty>
                        )}
                        <CommandGroup className="p-1">
                            {options
                                .filter(o =>
                                    search.trim() === '' ||
                                    o.label.toLowerCase().includes(search.trim().toLowerCase()) ||
                                    (o.secondary?.toLowerCase().includes(search.trim().toLowerCase()) ?? false),
                                )
                                .map(opt => (
                                    <CommandItem
                                        key={opt.value}
                                        value={opt.secondary ? `${opt.label} ${opt.secondary}` : opt.label}
                                        onSelect={() => handleSelect(opt.value)}
                                        className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer"
                                    >
                                        <Check className={cn(
                                            'h-3.5 w-3.5 shrink-0 text-primary transition-opacity',
                                            value.toLowerCase() === opt.value.toLowerCase() ? 'opacity-100' : 'opacity-0',
                                        )} />
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm leading-tight text-foreground">{opt.label}</span>
                                            {opt.secondary && (
                                                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                                    {opt.secondary}
                                                </span>
                                            )}
                                        </span>
                                    </CommandItem>
                                ))}
                        </CommandGroup>

                        {showCreate && (
                            <CommandGroup className="p-1 border-t border-border/50">
                                <CommandItem
                                    value={`__create__${search.trim()}`}
                                    onSelect={handleCreate}
                                    className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer text-primary"
                                >
                                    <Plus className="h-3.5 w-3.5 shrink-0" />
                                    <span className="text-sm">
                                        Use <span className="font-medium">"{search.trim()}"</span>
                                    </span>
                                </CommandItem>
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
