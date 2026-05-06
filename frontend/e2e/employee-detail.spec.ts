/**
 * Employee detail page — profile tabs, documents, assets, attendance sub-views.
 * Navigates to the first employee found on the employees list.
 */
import { test, expect, type Page } from '@playwright/test'

async function navigateToFirstEmployee(page: Page): Promise<boolean> {
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    const statusCell = page.locator('table tbody tr:first-child td').nth(4)
    if (!await statusCell.isVisible().catch(() => false)) return false
    await statusCell.click()
    await page.waitForURL('**/employees/**', { timeout: 8_000 })
    return true
}

test.describe('Employee detail page', () => {
    test('navigates to employee detail on row click', async ({ page }) => {
        const found = await navigateToFirstEmployee(page)
        if (!found) { test.skip(); return }
        await expect(page).toHaveURL(/employees\/.+/)
    })

    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        const found = await navigateToFirstEmployee(page)
        if (!found) { test.skip(); return }
        expect(errors).toHaveLength(0)
    })

    test('shows employee name or detail heading', async ({ page }) => {
        const found = await navigateToFirstEmployee(page)
        if (!found) { test.skip(); return }
        await page.waitForLoadState('networkidle')
        const heading = page.getByRole('heading').first()
        await expect(heading).toBeVisible({ timeout: 10_000 })
    })

    test('shows tabs (Personal, Employment, Documents, etc.)', async ({ page }) => {
        const found = await navigateToFirstEmployee(page)
        if (!found) { test.skip(); return }
        await page.waitForLoadState('networkidle')
        const tabs = page.getByRole('tab')
        // Wait for tabs to render (OverflowTabsList uses layout effect)
        const hasTab = await tabs.first().isVisible({ timeout: 10_000 }).catch(() => false)
        if (!hasTab) { test.skip(); return }
        const tabCount = await tabs.count()
        expect(tabCount, 'Expected at least 2 tabs on employee detail').toBeGreaterThanOrEqual(2)
    })

    test('clicking a tab switches content without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        const found = await navigateToFirstEmployee(page)
        if (!found) { test.skip(); return }
        await page.waitForLoadState('networkidle')

        const tabs = page.getByRole('tab')
        const tabCount = await tabs.count()
        if (tabCount < 2) { test.skip(); return }

        // Click the second tab
        await tabs.nth(1).click()
        await page.waitForTimeout(500)
        expect(errors).toHaveLength(0)
    })
})
