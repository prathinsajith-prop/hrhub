import * as React from 'react'
import { format, parse, isValid } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { Matcher } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface DatePickerProps {
    /** Controlled value as an ISO `YYYY-MM-DD` string (or `''`). */
    value?: string
    /** Fires with the new ISO `YYYY-MM-DD` string (or `''` when cleared). */
    onChange?: (value: string) => void
    placeholder?: string
    /** Earliest selectable date, ISO `YYYY-MM-DD`. */
    min?: string
    /** Latest selectable date, ISO `YYYY-MM-DD`. */
    max?: string
    disabled?: boolean
    className?: string
    id?: string
    /** Sets aria-invalid + red border to match the `<Input>` invalid styling. */
    'aria-invalid'?: boolean
}

const ISO_FORMAT = 'yyyy-MM-dd'

function toIso(d: Date | undefined): string {
    return d ? format(d, ISO_FORMAT) : ''
}

function fromIso(s: string | undefined): Date | undefined {
    if (!s) return undefined
    const d = parse(s, ISO_FORMAT, new Date())
    return isValid(d) ? d : undefined
}

/**
 * Calendar-backed date picker that mirrors the `<input type="date">` API:
 * value + onChange both use ISO `YYYY-MM-DD` strings, so form state code is
 * identical to the native input.
 */
export function DatePicker({
    value,
    onChange,
    placeholder = 'Pick a date',
    min,
    max,
    disabled,
    className,
    id,
    'aria-invalid': ariaInvalid,
}: DatePickerProps) {
    const selected = fromIso(value)
    const minDate = fromIso(min)
    const maxDate = fromIso(max)

    const disabledMatcher = React.useMemo<Matcher[] | undefined>(() => {
        const rules: Matcher[] = []
        if (minDate) rules.push({ before: minDate })
        if (maxDate) rules.push({ after: maxDate })
        return rules.length ? rules : undefined
    }, [minDate, maxDate])

    const [open, setOpen] = React.useState(false)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    aria-invalid={ariaInvalid || undefined}
                    data-invalid={ariaInvalid || undefined}
                    className={cn(
                        'w-full justify-start text-left font-normal h-9',
                        !selected && 'text-muted-foreground',
                        className,
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
                    {selected ? format(selected, 'dd MMM yyyy') : <span>{placeholder}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={selected}
                    defaultMonth={selected}
                    onSelect={(d) => {
                        onChange?.(toIso(d))
                        setOpen(false)
                    }}
                    disabled={disabledMatcher}
                    captionLayout="dropdown"
                    startMonth={minDate ?? new Date(1900, 0)}
                    endMonth={maxDate ?? new Date(new Date().getFullYear() + 20, 11)}
                />
            </PopoverContent>
        </Popover>
    )
}

DatePicker.displayName = 'DatePicker'
