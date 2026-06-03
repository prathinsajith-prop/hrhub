import type { KeyboardEvent } from 'react'
import { X as XIcon, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Free-form tag/chip input for the employee referral form — type a value, press
 * Enter (or +) to add, Backspace on an empty input removes the last chip.
 * Mirrors the admin frontend's ChipsField so referrals capture candidate skills
 * with the same UX.
 */
export function ChipsField({
    label, optional, chips, onRemove,
    inputValue, onInputChange, onKeyDown, onAdd,
    placeholder, chipClassName,
}: {
    label: string
    optional?: boolean
    chips: string[]
    onRemove: (value: string) => void
    inputValue: string
    onInputChange: (v: string) => void
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
    onAdd: () => void
    placeholder?: string
    chipClassName?: string
}) {
    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-1.5">{label}{optional && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}</Label>
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
