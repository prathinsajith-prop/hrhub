import * as React from 'react'
import { format, parse, isValid } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { Matcher } from 'react-day-picker'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
                    <CalendarIcon className="mr-2 size-4 opacity-70" />
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

const DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm"

function toDateTime(d: Date | undefined): string {
    return d ? format(d, DATETIME_FORMAT) : ''
}

function fromDateTime(s: string | undefined): Date | undefined {
    if (!s) return undefined
    // Accept both `yyyy-MM-ddTHH:mm` and full ISO strings.
    const d = parse(s.slice(0, 16), DATETIME_FORMAT, new Date())
    return isValid(d) ? d : undefined
}

export interface DateTimePickerProps extends Omit<DatePickerProps, 'value' | 'onChange'> {
    /** Controlled value as a local `yyyy-MM-ddTHH:mm` string (or `''`). */
    value?: string
    /** Fires with the new local `yyyy-MM-ddTHH:mm` string (or `''` when cleared). */
    onChange?: (value: string) => void
}

/**
 * Calendar + time picker for fields that need a date AND a time (e.g. an
 * announcement's publish/expire moment). value + onChange use a local
 * `yyyy-MM-ddTHH:mm` string — the same shape as `<input type="datetime-local">`
 * — so it's a drop-in replacement. Picking a date with no time set defaults to
 * 09:00; the time input then refines it.
 */
export function DateTimePicker({
    value,
    onChange,
    placeholder = 'Pick date & time',
    min,
    max,
    disabled,
    className,
    id,
    'aria-invalid': ariaInvalid,
}: DateTimePickerProps) {
    const selected = fromDateTime(value)
    const minDate = fromIso(min)
    const maxDate = fromIso(max)
    const [open, setOpen] = React.useState(false)

    const disabledMatcher = React.useMemo<Matcher[] | undefined>(() => {
        const rules: Matcher[] = []
        if (minDate) rules.push({ before: minDate })
        if (maxDate) rules.push({ after: maxDate })
        return rules.length ? rules : undefined
    }, [minDate, maxDate])

    const timeValue = selected ? format(selected, 'HH:mm') : ''

    const setDatePart = (d: Date | undefined) => {
        if (!d) return
        const next = new Date(d)
        if (selected) {
            next.setHours(selected.getHours(), selected.getMinutes(), 0, 0)
        } else {
            next.setHours(9, 0, 0, 0) // sensible default when no time chosen yet
        }
        onChange?.(toDateTime(next))
    }

    const setTimePart = (t: string) => {
        const [h, m] = t.split(':').map(Number)
        if (Number.isNaN(h) || Number.isNaN(m)) return
        const base = selected ? new Date(selected) : new Date()
        base.setHours(h, m, 0, 0)
        onChange?.(toDateTime(base))
    }

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
                    <CalendarIcon className="mr-2 size-4 opacity-70" />
                    {selected ? format(selected, 'dd MMM yyyy, HH:mm') : <span>{placeholder}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={selected}
                    defaultMonth={selected}
                    onSelect={setDatePart}
                    disabled={disabledMatcher}
                    captionLayout="dropdown"
                    startMonth={minDate ?? new Date(1900, 0)}
                    endMonth={maxDate ?? new Date(new Date().getFullYear() + 20, 11)}
                />
                <div className="flex items-center gap-2 border-t p-3">
                    <span className="text-xs font-medium text-muted-foreground">Time</span>
                    <Input
                        type="time"
                        value={timeValue}
                        onChange={(e) => setTimePart(e.target.value)}
                        className="h-8 flex-1"
                    />
                    {selected && (
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { onChange?.(''); setOpen(false) }}>
                            Clear
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

DateTimePicker.displayName = 'DateTimePicker'
