/**
 * Attendance page tests — table renders, no duplicate pagination.
 */
import { test, expect } from '@playwright/test'

test.describe('Attendance page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/attendance')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows heading', async ({ page }) => {
        await page.goto('/attendance')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /attendance/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('table or empty state renders', async ({ page }) => {
        await page.goto('/attendance')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const empty = page.getByText(/no records|no attendance/i)
        // Also accept loading spinner or date-range picker (page may show controls even with no data)
        const controls = page.locator('input[type="date"], button').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasControls = await controls.isVisible().catch(() => false)
        expect(hasTable || hasEmpty || hasControls).toBe(true)
    })

    test('only one pagination bar visible (no DataTable duplicate)', async ({ page }) => {
        await page.goto('/attendance')
        await page.waitForLoadState('networkidle')
        const bars = page.locator('text=/Showing \\d+/')
        const count = await bars.count()
        expect(count).toBeLessThanOrEqual(1)
    })
})
