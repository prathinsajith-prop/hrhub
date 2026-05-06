/**
 * Employees page tests — table renders, search narrows results, row click navigates.
 */
import { test, expect } from '@playwright/test'

test.describe('Employees page', () => {
    test('renders employee table or empty state', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table, [role="grid"]').first()
        const empty = page.getByText(/no employees/i)
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasEmpty, 'Expected table or empty state').toBe(true)
    })

    test('search input filters results', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const searchInput = page.getByPlaceholder(/search/i).first()
        if (!await searchInput.isVisible().catch(() => false)) {
            test.skip()
            return
        }

        // Count rows before search
        const rowsBefore = await page.locator('table tbody tr').count()
        if (rowsBefore === 0) { test.skip(); return }

        // Search for something that definitely won't match
        await searchInput.fill('ZZZZZ_NOBODY_HAS_THIS_NAME')
        await page.waitForLoadState('networkidle')

        const rowsAfter = await page.locator('table tbody tr').count()
        // Either 0 rows (no match) or an empty-state message
        const emptyMsg = await page.getByText(/no.*(employee|result)/i).isVisible().catch(() => false)
        expect(rowsAfter === 0 || emptyMsg, 'Search did not filter results').toBe(true)

        // Clear search — results should return
        await searchInput.clear()
        await page.waitForLoadState('networkidle')
        const rowsRestored = await page.locator('table tbody tr').count()
        expect(rowsRestored, 'Results did not restore after clearing search').toBe(rowsBefore)
    })

    test('clicking a row navigates to employee detail', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const firstRow = page.locator('table tbody tr').first()
        if (!await firstRow.isVisible().catch(() => false)) { test.skip(); return }

        await firstRow.click()
        await page.waitForURL('**/employees/**', { timeout: 8_000 })
        await expect(page).toHaveURL(/employees\/.+/)
    })

    test('Add Employee button is visible for super-admin', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const addBtn = page.getByRole('button', { name: /add employee/i })
            .or(page.getByRole('link', { name: /add employee/i }))
        await expect(addBtn).toBeVisible({ timeout: 10_000 })
    })

    test('only one pagination bar visible (no DataTable duplicate)', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const bars = page.locator('text=/Showing \\d+/')
        const count = await bars.count()
        expect(count, 'Duplicate pagination detected').toBeLessThanOrEqual(1)
    })

    test('DataTable internal page controls hidden', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const pageControls = page.locator('text=/Page \\d+ of \\d+/')
        const count = await pageControls.count()
        expect(count).toBe(0)
    })
})
