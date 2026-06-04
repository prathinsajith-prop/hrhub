import { useId, useState, type ReactNode } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

export interface MultiSelectOption {
    value: string
    label: string
    /** Smaller muted text under the label (e.g. an employee's designation). */
    secondary?: string
    /** Avatar image URL — shows a small avatar (initials fallback) in the list. */
    avatar?: string
}

/** Small avatar shown in option rows: image if available, initials otherwise. */
function OptionAvatar({ src, name }: { src?: string; name: string }) {
    return (
        <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            {src ? <img src={src} alt={name} className="size-full object-cover" /> : getInitials(name)}
        </span>
    )
}

interface MultiSelectProps {
    options: MultiSelectOption[]
    /** Full selected option objects — kept so chips render even when the
     *  current `options` (e.g. an async search result) don't include them. */
    selected: MultiSelectOption[]
    onChange: (selected: MultiSelectOption[]) => void
    placeholder?: string
    searchPlaceholder?: string
    emptyMessage?: string
    disabled?: boolean
    className?: string
    /** Controlled search text — pass with `onSearchChange` for async/server search. */
    search?: string
    onSearchChange?: (q: string) => void
    /** Loading indicator for async option fetches. */
    loading?: boolean
    /** Filter `options` internally by the search box. Set false when the parent
     *  already returns filtered options (server-side search). Default: true. */
    filter?: boolean
    /** Show an avatar (option.avatar image, initials fallback) on each row. */
    withAvatars?: boolean
}

/**
 * Searchable multi-select dropdown. Selected values show as removable chips in
 * the trigger; the popover lists checkable options and stays open while you pick
 * several. Works for static lists (internal filter) and async search (pass
 * `search`/`onSearchChange`/`loading` + `filter={false}`).
 */
export function MultiSelect({
    options, selected, onChange,
    placeholder = 'Select…',
    searchPlaceholder = 'Search…',
    emptyMessage = 'No results.',
    disabled = false, className,
    search: controlledSearch, onSearchChange, loading = false, filter = true,
    withAvatars = false,
}: MultiSelectProps) {
    const [open, setOpen] = useState(false)
    const [internalSearch, setInternalSearch] = useState('')
    const listboxId = useId()

    const search = controlledSearch ?? internalSearch
    const setSearch = (q: string) => { if (onSearchChange) onSearchChange(q); else setInternalSearch(q) }

    const selectedValues = new Set(selected.map(s => s.value))

    function toggle(opt: MultiSelectOption) {
        if (selectedValues.has(opt.value)) onChange(selected.filter(s => s.value !== opt.value))
        else onChange([...selected, opt])
    }
    function remove(value: string) {
        onChange(selected.filter(s => s.value !== value))
    }

    const visible = filter && search.trim()
        ? options.filter(o => {
            const q = search.trim().toLowerCase()
            return o.label.toLowerCase().includes(q) || (o.secondary?.toLowerCase().includes(q) ?? false)
        })
        : options

    return (
        <Popover open={open} onOpenChange={o => { setOpen(o); if (!o && !onSearchChange) setInternalSearch('') }}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    disabled={disabled}
                    className={cn(
                        'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-sm ring-offset-background transition-all duration-150',
                        open ? 'border-ring ring-2 ring-ring/20' : 'border-input hover:border-input/80',
                        'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
                        className,
                    )}
                >
                    <span className="flex flex-1 flex-wrap items-center gap-1 min-w-0">
                        {selected.length === 0
                            ? <span className="px-1 text-muted-foreground">{placeholder}</span>
                            : selected.map(s => (
                                <span key={s.value} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-primary/20">
                                    {s.label}
                                    <span
                                        role="button"
                                        tabIndex={-1}
                                        aria-label={`Remove ${s.label}`}
                                        onClick={e => { e.stopPropagation(); remove(s.value) }}
                                        className="opacity-60 hover:opacity-100"
                                    >
                                        <X className="size-3" />
                                    </span>
                                </span>
                            ))}
                    </span>
                    <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200', open && 'rotate-180')} />
                </button>
            </PopoverTrigger>

            <PopoverContent
                className="p-0 overflow-hidden border border-border shadow-lg"
                align="start"
                sideOffset={2}
                style={{ width: 'var(--radix-popover-trigger-width)' }}
            >
                <Command shouldFilter={false}>
                    <CommandInput placeholder={searchPlaceholder} className="h-9 py-2 text-sm" value={search} onValueChange={setSearch} />
                    <CommandList id={listboxId} className="max-h-56 overflow-y-auto">
                        {loading
                            ? <p className="py-5 text-center text-sm text-muted-foreground">Searching…</p>
                            : visible.length === 0
                                ? <CommandEmpty className="py-5 text-center text-sm text-muted-foreground">{emptyMessage}</CommandEmpty>
                                : (
                                    <CommandGroup className="p-1">
                                        {visible.reduce<ReactNode[]>((acc, opt) => {
                                            const isSel = selectedValues.has(opt.value)
                                            acc.push(
                                                <CommandItem
                                                    key={opt.value}
                                                    value={opt.secondary ? `${opt.label} ${opt.secondary}` : opt.label}
                                                    onSelect={() => toggle(opt)}
                                                    className="flex items-center gap-2 rounded-md p-2 cursor-pointer"
                                                >
                                                    <span className={cn(
                                                        'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                                        isSel ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                                                    )}>
                                                        {isSel && <Check className="size-3" />}
                                                    </span>
                                                    {withAvatars && <OptionAvatar src={opt.avatar} name={opt.label} />}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-sm leading-tight text-foreground">{opt.label}</span>
                                                        {opt.secondary && <span className="block text-[11px] leading-tight text-muted-foreground mt-0.5">{opt.secondary}</span>}
                                                    </span>
                                                </CommandItem>,
                                            )
                                            return acc
                                        }, [])}
                                    </CommandGroup>
                                )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
