/**
 * Leave page tests — request list renders, pagination correct, no duplicate.
 */
import { test, expect } from '@playwright/test'

test.describe('Leave page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/leave')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows heading', async ({ page }) => {
        await page.goto('/leave')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /leave/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('table or empty state renders', async ({ page }) => {
        await page.goto('/leave')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const empty = page.getByText(/no leave|no requests/i)
        const card = page.locator('[class*="card"]').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasTable || hasEmpty || hasCard).toBe(true)
    })

    test('only one pagination bar visible (no DataTable duplicate)', async ({ page }) => {
        await page.goto('/leave')
        await page.waitForLoadState('networkidle')
        const bars = page.locator('text=/Showing \\d+/')
        const count = await bars.count()
        expect(count, 'Duplicate pagination detected').toBeLessThanOrEqual(1)
    })

    test('DataTable internal page controls hidden', async ({ page }) => {
        await page.goto('/leave')
        await page.waitForLoadState('networkidle')
        const pageControls = page.locator('text=/Page \\d+ of \\d+/')
        const count = await pageControls.count()
        expect(count).toBe(0)
    })
})
