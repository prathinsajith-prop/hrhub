/**
 * Exit & Offboarding page tests — list renders, pagination, no JS errors.
 */
import { test, expect } from '@playwright/test'

test.describe('Exit page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/exit')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows exit management heading', async ({ page }) => {
        await page.goto('/exit')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /exit/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('table or empty state renders', async ({ page }) => {
        await page.goto('/exit')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const empty = page.getByText(/no exit requests/i)
        const card = page.locator('[class*="card"]').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasTable || hasEmpty || hasCard).toBe(true)
    })

    test('only one pagination bar (no DataTable duplicate)', async ({ page }) => {
        await page.goto('/exit')
        await page.waitForLoadState('networkidle')
        const bars = page.locator('text=/Showing \\d+/')
        expect(await bars.count(), 'Duplicate pagination detected').toBeLessThanOrEqual(1)
    })

    test('no internal DataTable page controls', async ({ page }) => {
        await page.goto('/exit')
        await page.waitForLoadState('networkidle')
        expect(await page.locator('text=/Page \\d+ of \\d+/').count()).toBe(0)
    })
})
