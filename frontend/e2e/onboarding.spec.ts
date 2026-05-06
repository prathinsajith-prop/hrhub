/**
 * Onboarding page tests — checklist renders, no JS errors.
 */
import { test, expect } from '@playwright/test'

test.describe('Onboarding page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/onboarding')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows onboarding heading', async ({ page }) => {
        await page.goto('/onboarding')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /onboarding/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('content renders (checklist, table, or empty state)', async ({ page }) => {
        await page.goto('/onboarding')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const card = page.locator('[class*="card"]').first()
        const empty = page.getByText(/no onboarding|no employees/i)
        const hasTable = await table.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasCard || hasEmpty).toBe(true)
    })

    test('only one pagination bar visible', async ({ page }) => {
        await page.goto('/onboarding')
        await page.waitForLoadState('networkidle')
        const bars = page.locator('text=/Showing \\d+/')
        expect(await bars.count()).toBeLessThanOrEqual(1)
    })
})
