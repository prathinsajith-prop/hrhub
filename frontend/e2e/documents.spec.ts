/**
 * Documents page tests — list renders, pagination correct, no duplicate.
 */
import { test, expect } from '@playwright/test'

test.describe('Documents page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/documents')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows heading', async ({ page }) => {
        await page.goto('/documents')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /documents/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('table or empty state renders', async ({ page }) => {
        await page.goto('/documents')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const empty = page.getByText(/no documents/i)
        const card = page.locator('[class*="card"]').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasTable || hasEmpty || hasCard).toBe(true)
    })

    test('only one pagination bar visible (no DataTable duplicate)', async ({ page }) => {
        await page.goto('/documents')
        await page.waitForLoadState('networkidle')
        const bars = page.locator('text=/Showing \\d+/')
        const count = await bars.count()
        expect(count, 'Duplicate pagination detected').toBeLessThanOrEqual(1)
    })

    test('DataTable internal page controls hidden', async ({ page }) => {
        await page.goto('/documents')
        await page.waitForLoadState('networkidle')
        const pageControls = page.locator('text=/Page \\d+ of \\d+/')
        const count = await pageControls.count()
        expect(count).toBe(0)
    })

    test('search filters results', async ({ page }) => {
        await page.goto('/documents')
        await page.waitForLoadState('networkidle')
        const searchInput = page.getByPlaceholder(/search/i).first()
        if (!await searchInput.isVisible().catch(() => false)) { test.skip(); return }

        const rowsBefore = await page.locator('table tbody tr').count()
        if (rowsBefore === 0) { test.skip(); return }

        await searchInput.fill('ZZZZZ_NO_MATCH_999')
        await page.waitForTimeout(600)
        await page.waitForLoadState('networkidle')

        const rowsAfter = await page.locator('table tbody tr').count()
        const emptyMsg = await page.getByText(/no documents|no results/i).isVisible().catch(() => false)
        expect(rowsAfter === 0 || emptyMsg).toBe(true)
    })
})
