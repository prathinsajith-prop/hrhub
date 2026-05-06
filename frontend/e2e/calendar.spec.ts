/**
 * Calendar page tests — renders, no JS errors, event list or grid visible.
 */
import { test, expect } from '@playwright/test'

test.describe('Calendar page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/calendar')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows calendar heading', async ({ page }) => {
        await page.goto('/calendar')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /calendar/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('calendar grid or event list renders', async ({ page }) => {
        await page.goto('/calendar')
        await page.waitForLoadState('networkidle')
        const grid = page.locator('[class*="calendar"], [class*="grid"], table').first()
        const card = page.locator('[class*="card"]').first()
        const hasGrid = await grid.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasGrid || hasCard).toBe(true)
    })
})
