/**
 * Payroll page tests — renders, no JS errors, pagination correct.
 */
import { test, expect } from '@playwright/test'

test.describe('Payroll page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/payroll')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows heading', async ({ page }) => {
        await page.goto('/payroll')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /payroll/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('content renders (table, run list, or empty state)', async ({ page }) => {
        await page.goto('/payroll')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const card = page.locator('[class*="card"]').first()
        const empty = page.getByText(/no payroll|no runs|no data/i)
        const hasTable = await table.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasCard || hasEmpty).toBe(true)
    })

    test('only one pagination bar visible', async ({ page }) => {
        await page.goto('/payroll')
        await page.waitForLoadState('networkidle')
        const bars = page.locator('text=/Showing \\d+/')
        const count = await bars.count()
        expect(count, 'Duplicate pagination detected').toBeLessThanOrEqual(1)
    })

    test('no internal DataTable page controls', async ({ page }) => {
        await page.goto('/payroll')
        await page.waitForLoadState('networkidle')
        const pageControls = page.locator('text=/Page \\d+ of \\d+/')
        expect(await pageControls.count()).toBe(0)
    })
})
