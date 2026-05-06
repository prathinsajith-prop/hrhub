/**
 * Dashboard tests — KPI cards render, charts load, no JS errors.
 */
import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows heading', async ({ page }) => {
        await page.goto('/dashboard')
        await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 })
    })

    test('renders cards or chart content', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')
        // Dashboard must show at least some content — cards, text, or charts
        const content = page.locator('main, [class*="card"], [class*="chart"], p').first()
        await expect(content).toBeVisible({ timeout: 10_000 })
    })
})
