/**
 * Visa page tests — list renders, no JS errors.
 */
import { test, expect } from '@playwright/test'

test.describe('Visa page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/visa')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows heading', async ({ page }) => {
        await page.goto('/visa')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /visa/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('table or empty state renders', async ({ page }) => {
        await page.goto('/visa')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const empty = page.getByText(/no visa|no applications/i)
        const card = page.locator('[class*="card"]').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasTable || hasEmpty || hasCard).toBe(true)
    })

    test('only one pagination bar visible', async ({ page }) => {
        await page.goto('/visa')
        await page.waitForLoadState('networkidle')
        const bars = page.locator('text=/Showing \\d+/')
        const count = await bars.count()
        expect(count).toBeLessThanOrEqual(1)
    })
})
