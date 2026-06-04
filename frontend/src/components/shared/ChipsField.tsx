import { useMemo, useState, type KeyboardEvent } from 'react'
import { X as XIcon, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

/**
 * Free-form tag/chip input — type a value, press Enter (or the + button) to add,
 * Backspace on an empty input removes the last chip. Shared by the job form, the
 * candidate add/edit dialogs, the public careers apply form, and the portal
 * referral form so they all collect skills/tags with one consistent UX.
 *
 * Optional `suggestions` enables type-ahead: as the user types (or focuses an
 * empty input) a dropdown of matching, not-yet-added suggestions appears;
 * clicking one adds it. This keeps tags consistent across records (e.g. everyone
 * picks "TypeScript" instead of "Typescript"/"TS"). Matching and de-duplication
 * are case-insensitive.
 *
 * Kept in its own tiny module (rather than inside action-dialogs.tsx) so the
 * public careers bundle can use it without pulling in the admin dialogs.
 */
export function ChipsField({
    label, optional, icon, chips, onRemove,
    inputRef, inputValue, onInputChange, onKeyDown, onAdd, onAddValue,
    placeholder, chipClassName, suggestions,
}: {
    label: string
    optional?: boolean
    icon?: React.ReactNode
    chips: string[]
    onRemove: (value: string) => void
    inputRef?: React.RefObject<HTMLInputElement | null>
    inputValue: string
    onInputChange: (v: string) => void
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
    onAdd: () => void
    /** Add a specific value (used when a suggestion is picked). Falls back to the
     *  typed-input flow when omitted. */
    onAddValue?: (value: string) => void
    placeholder?: string
    chipClassName?: string
    suggestions?: string[]
}) {
    const [focused, setFocused] = useState(false)

    // Case-insensitive: hide suggestions already added; filter by the typed text.
    const filtered = useMemo(() => {
        if (!suggestions || suggestions.length === 0) return []
        const added = new Set(chips.map(c => c.toLowerCase()))
        const q = inputValue.trim().toLowerCase()
        return suggestions
            .filter(s => !added.has(s.toLowerCase()))
            .filter(s => (q ? s.toLowerCase().includes(q) : true))
            .slice(0, 8)
    }, [suggestions, chips, inputValue])

    const pick = (value: string) => {
        if (onAddValue) onAddValue(value)
        else { onInputChange(value); onAdd() }
    }

    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-1.5">{icon}{label}{optional && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}</Label>
            {chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="list" aria-label={label}>
                    {chips.map(c => (
                        <span key={c} role="listitem" className={cn('inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full', chipClassName ?? 'bg-primary/10 text-primary')}>
                            {c}
                            <button type="button" aria-label={`Remove "${c}"`} onClick={() => onRemove(c)} className="ml-0.5 opacity-60 hover:opacity-100">
                                <XIcon className="size-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="relative">
                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        value={inputValue}
                        onChange={e => onInputChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        onFocus={() => setFocused(true)}
                        // Delay so a suggestion click (mousedown) registers before blur closes the list.
                        onBlur={() => setTimeout(() => setFocused(false), 120)}
                        aria-label={`Add ${label.toLowerCase()}`}
                        placeholder={placeholder}
                        className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={!inputValue.trim()}>
                        <Plus className="size-3.5" />
                    </Button>
                </div>
                {focused && filtered.length > 0 && (
                    <ul
                        role="listbox"
                        aria-label={`${label} suggestions`}
                        className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
                    >
                        {filtered.map(s => (
                            <li key={s}>
                                <button
                                    type="button"
                                    // mousedown (not click) so it fires before the input's blur.
                                    onMouseDown={(e) => { e.preventDefault(); pick(s) }}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                >
                                    <Plus className="size-3 opacity-50 shrink-0" />
                                    <span className="truncate">{s}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
