/**
 * Recruitment page tests — job list renders, pagination correct.
 */
import { test, expect } from '@playwright/test'

test.describe('Recruitment page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/recruitment')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows heading', async ({ page }) => {
        await page.goto('/recruitment')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /recruitment/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('content renders (job list, kanban, or empty state)', async ({ page }) => {
        await page.goto('/recruitment')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const kanban = page.locator('[class*="kanban"], [class*="board"], [class*="pipeline"]').first()
        const empty = page.getByText(/no jobs|no openings|no candidates/i)
        const card = page.locator('[class*="card"]').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasKanban = await kanban.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasTable || hasKanban || hasEmpty || hasCard).toBe(true)
    })

    test('only one pagination bar visible (no DataTable duplicate)', async ({ page }) => {
        await page.goto('/recruitment')
        await page.waitForLoadState('networkidle')
        const bars = page.locator('text=/Showing \\d+/')
        const count = await bars.count()
        expect(count, 'Duplicate pagination detected').toBeLessThanOrEqual(1)
    })

    test('DataTable internal page controls hidden', async ({ page }) => {
        await page.goto('/recruitment')
        await page.waitForLoadState('networkidle')
        const pageControls = page.locator('text=/Page \\d+ of \\d+/')
        const count = await pageControls.count()
        expect(count).toBe(0)
    })
})
