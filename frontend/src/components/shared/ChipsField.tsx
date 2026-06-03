import type { KeyboardEvent } from 'react'
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
 * Kept in its own tiny module (rather than inside action-dialogs.tsx) so the
 * public careers bundle can use it without pulling in the admin dialogs.
 */
export function ChipsField({
    label, optional, icon, chips, onRemove,
    inputRef, inputValue, onInputChange, onKeyDown, onAdd,
    placeholder, chipClassName,
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
    placeholder?: string
    chipClassName?: string
}) {
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
            <div className="flex gap-2">
                <input
                    ref={inputRef}
                    value={inputValue}
                    onChange={e => onInputChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    aria-label={`Add ${label.toLowerCase()}`}
                    placeholder={placeholder}
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={!inputValue.trim()}>
                    <Plus className="size-3.5" />
                </Button>
            </div>
        </div>
    )
}
