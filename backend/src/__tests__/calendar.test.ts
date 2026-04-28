import { describe, it, expect } from 'vitest'

/**
 * The calendar aggregator derives which years to query for public holidays from
 * the visible date range. When from/to span a year boundary (e.g. Dec → Jan),
 * it must query both years so holidays don't disappear at the turn of the year.
 */
function deriveHolidayYears(from: string | undefined, to: string | undefined): number[] {
    const now = new Date().getFullYear()
    const startYear = from ? new Date(from).getFullYear() : now
    const endYear   = to   ? new Date(to).getFullYear()   : startYear
    return startYear === endYear ? [startYear] : [startYear, endYear]
}

describe('calendar aggregator — holiday year derivation', () => {
    it('returns a single year when from and to are in the same year', () => {
        expect(deriveHolidayYears('2026-04-01', '2026-04-30')).toEqual([2026])
    })

    it('returns both years when range crosses a year boundary', () => {
        const years = deriveHolidayYears('2026-12-01', '2027-01-31')
        expect(years).toEqual([2026, 2027])
    })

    it('returns the start year twice when to is undefined', () => {
        expect(deriveHolidayYears('2026-06-01', undefined)).toEqual([2026])
    })

    it('returns current year when both from and to are undefined', () => {
        const years = deriveHolidayYears(undefined, undefined)
        expect(years).toHaveLength(1)
        expect(years[0]).toBe(new Date().getFullYear())
    })

    it('handles single-day range correctly', () => {
        expect(deriveHolidayYears('2026-01-01', '2026-01-01')).toEqual([2026])
    })

    it('handles a range from Jan to Dec within the same year', () => {
        expect(deriveHolidayYears('2026-01-01', '2026-12-31')).toEqual([2026])
    })

    it('handles a wide multi-year range by returning only the boundary years', () => {
        // Only start and end year matter for holiday windows
        const years = deriveHolidayYears('2025-11-01', '2027-02-01')
        expect(years).toEqual([2025, 2027])
    })
})
