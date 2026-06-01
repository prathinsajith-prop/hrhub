import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DateRangePresets, defaultReportRange, resolvePreset, type ReportDateRangeValue } from '@/components/shared/DateRangePresets'

// Radix Popover relies on PointerEvent APIs that jsdom doesn't implement.
// Polyfill the two methods it touches so the popover can open in tests.
beforeAll(() => {
    if (!window.HTMLElement.prototype.hasPointerCapture) {
        window.HTMLElement.prototype.hasPointerCapture = () => false
    }
    if (!window.HTMLElement.prototype.releasePointerCapture) {
        window.HTMLElement.prototype.releasePointerCapture = () => { }
    }
    if (!window.HTMLElement.prototype.scrollIntoView) {
        window.HTMLElement.prototype.scrollIntoView = () => { }
    }
})

describe('resolvePreset', () => {
    const now = new Date(2026, 5, 15) // 15 Jun 2026 (local)

    it('this_month spans the 1st to today', () => {
        expect(resolvePreset('this_month', now)).toEqual({ startDate: '2026-06-01', endDate: '2026-06-15' })
    })
    it('today is a single day', () => {
        expect(resolvePreset('today', now)).toEqual({ startDate: '2026-06-15', endDate: '2026-06-15' })
    })
    it('last_30_days is an inclusive 30-day window', () => {
        expect(resolvePreset('last_30_days', now)).toEqual({ startDate: '2026-05-17', endDate: '2026-06-15' })
    })
    it('defaultReportRange seeds this_month', () => {
        expect(defaultReportRange().preset).toBe('this_month')
    })
})

describe('<DateRangePresets /> (react-date-range plugin under React 19)', () => {
    const value: ReportDateRangeValue = { preset: 'custom', startDate: '2026-05-26', endDate: '2026-06-01' }

    it('renders the trigger with the US-formatted range label', () => {
        render(<DateRangePresets value={value} onChange={() => { }} />)
        // 05/26/2026 - 06/01/2026
        expect(screen.getByText('05/26/2026 - 06/01/2026')).toBeInTheDocument()
    })

    it('mounts the plugin calendar + preset rail on open (no React 19 crash)', () => {
        render(<DateRangePresets value={value} onChange={() => { }} />)
        fireEvent.click(screen.getByText('05/26/2026 - 06/01/2026'))
        // Custom sidebar presets matching the classic daterangepicker layout
        expect(screen.getByText('This Month')).toBeInTheDocument()
        expect(screen.getByText('Last 7 Days')).toBeInTheDocument()
        expect(screen.getByText('Last 30 Days')).toBeInTheDocument()
        // Footer actions
        expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('Apply commits the current draft as ISO YYYY-MM-DD with preset=custom', () => {
        const onChange = vi.fn()
        render(<DateRangePresets value={value} onChange={onChange} />)
        fireEvent.click(screen.getByText('05/26/2026 - 06/01/2026'))
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
        expect(onChange).toHaveBeenCalledTimes(1)
        const arg = onChange.mock.calls[0][0] as ReportDateRangeValue
        expect(arg.preset).toBe('custom')
        expect(arg.startDate).toBe('2026-05-26')
        expect(arg.endDate).toBe('2026-06-01')
    })

    it('selecting a preset in the rail re-commits and keeps the popover usable', () => {
        const onChange = vi.fn()
        render(<DateRangePresets value={value} onChange={onChange} />)
        fireEvent.click(screen.getByText('05/26/2026 - 06/01/2026'))
        // Click the "Today" static range, then Apply.
        const rail = screen.getByText('Today')
        fireEvent.click(rail)
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
        expect(onChange).toHaveBeenCalled()
        const arg = onChange.mock.calls.at(-1)![0] as ReportDateRangeValue
        // A single-day "Today" selection → start === end.
        expect(arg.startDate).toBe(arg.endDate)
        // sanity: ISO shape
        expect(arg.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
})
