import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/**
 * shadcn-style Calendar wrapper around `react-day-picker` v9.
 * Themed with project tokens (primary, accent, muted).
 */
function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    ...props
}: CalendarProps) {
    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn('p-3', className)}
            classNames={{
                months: 'flex flex-col sm:flex-row gap-4',
                month: 'flex flex-col gap-4',
                month_caption: 'flex justify-center pt-1 relative items-center h-9',
                caption_label: 'text-sm font-medium',
                // ── Dropdown caption (captionLayout="dropdown" / "dropdown-buttons")
                dropdowns: 'flex items-center justify-center gap-2 w-full',
                dropdown_root: 'relative inline-flex items-center',
                dropdown:
                    'absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer',
                months_dropdown: '',
                years_dropdown: '',
                nav: 'flex items-center gap-1',
                button_previous: cn(
                    buttonVariants({ variant: 'outline' }),
                    'absolute left-1 top-1 size-7 bg-transparent p-0 opacity-60 hover:opacity-100',
                ),
                button_next: cn(
                    buttonVariants({ variant: 'outline' }),
                    'absolute right-1 top-1 size-7 bg-transparent p-0 opacity-60 hover:opacity-100',
                ),
                month_grid: 'w-full border-collapse space-y-1',
                weekdays: 'flex',
                weekday: 'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]',
                week: 'flex w-full mt-2',
                day: 'size-8 text-center text-sm p-0 relative focus-within:relative focus-within:z-20',
                day_button: cn(
                    buttonVariants({ variant: 'ghost' }),
                    'size-8 p-0 font-normal aria-selected:opacity-100',
                ),
                selected:
                    'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md',
                today: 'bg-accent text-accent-foreground rounded-md',
                outside: 'text-muted-foreground opacity-50',
                disabled: 'text-muted-foreground opacity-40 pointer-events-none',
                hidden: 'invisible',
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation, className: cls, ...rest }) => {
                    const Icon = orientation === 'left' ? ChevronLeft : ChevronRight
                    return <Icon className={cn('size-4', cls)} {...rest} />
                },
                // Render the dropdowns as styled "chip" labels with the
                // native <select> overlaid invisibly so they remain accessible.
                MonthsDropdown: ({ value, options, onChange }) => {
                    const current = options?.find((o) => o.value === value)
                    return (
                        <span className="relative inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent">
                            {current?.label ?? ''}
                            <ChevronRight className="size-3 rotate-90 opacity-60" />
                            <select
                                value={value}
                                onChange={onChange}
                                className="absolute inset-0 cursor-pointer opacity-0"
                                aria-label="Month"
                            >
                                {options?.map((o) => (
                                    <option key={o.value} value={o.value} disabled={o.disabled}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </span>
                    )
                },
                YearsDropdown: ({ value, options, onChange }) => {
                    const current = options?.find((o) => o.value === value)
                    return (
                        <span className="relative inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent">
                            {current?.label ?? ''}
                            <ChevronRight className="size-3 rotate-90 opacity-60" />
                            <select
                                value={value}
                                onChange={onChange}
                                className="absolute inset-0 cursor-pointer opacity-0"
                                aria-label="Year"
                            >
                                {options?.map((o) => (
                                    <option key={o.value} value={o.value} disabled={o.disabled}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </span>
                    )
                },
            }}
            {...props}
        />
    )
}

Calendar.displayName = 'Calendar'
export { Calendar }
