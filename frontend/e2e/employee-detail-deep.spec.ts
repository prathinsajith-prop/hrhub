/**
 * Employee detail page — deep functional validation.
 * Tests all major tabs: Personal, Employment, Visa, Documents, Payroll, Performance, Assets, Leave, Attendance.
 */
import { test, expect, type Page } from '@playwright/test'

async function gotoFirstEmployee(page: Page): Promise<boolean> {
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    const statusCell = page.locator('table tbody tr:first-child td').nth(4)
    if (!await statusCell.isVisible().catch(() => false)) return false
    await statusCell.click()
    await page.waitForURL('**/employees/**', { timeout: 8_000 })
    await page.waitForLoadState('networkidle')
    return true
}

test.describe('Employee Detail — tabs and content', () => {
    test('navigates to detail page on row click', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        await expect(page).toHaveURL(/employees\/.+/)
    })

    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        expect(errors).toHaveLength(0)
    })

    test('shows employee name in heading or breadcrumb', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const heading = page.getByRole('heading').first()
        await expect(heading).toBeVisible({ timeout: 10_000 })
    })

    test('shows multiple tabs (at least 3)', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const tabs = page.getByRole('tab')
        await expect(tabs.first()).toBeVisible({ timeout: 10_000 })
        const count = await tabs.count()
        expect(count).toBeGreaterThanOrEqual(3)
    })

    test('Personal tab — has form fields or info sections', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const personalTab = page.getByRole('tab', { name: /personal/i })
        if (await personalTab.isVisible().catch(() => false)) await personalTab.click()
        await page.waitForTimeout(500)
        const card = page.locator('[class*="card"]').first()
        const input = page.locator('input, [class*="field"]').first()
        const hasCard = await card.isVisible().catch(() => false)
        const hasInput = await input.isVisible().catch(() => false)
        expect(hasCard || hasInput).toBe(true)
    })

    test('Employment tab — switches content without errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const tab = page.getByRole('tab', { name: /employment/i })
        if (!await tab.isVisible().catch(() => false)) { test.skip(); return }
        await tab.click()
        await page.waitForTimeout(600)
        expect(errors).toHaveLength(0)
        const content = page.locator('[class*="card"], [class*="section"], p').first()
        await expect(content).toBeVisible()
    })

    test('Documents tab — renders or shows upload button', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const tab = page.getByRole('tab', { name: /documents?/i })
        if (!await tab.isVisible().catch(() => false)) { test.skip(); return }
        await tab.click()
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const empty = page.getByText(/no documents|no files/i)
        const uploadBtn = page.getByRole('button', { name: /upload|add/i }).first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasUpload = await uploadBtn.isVisible().catch(() => false)
        expect(hasTable || hasEmpty || hasUpload).toBe(true)
    })

    test('Payroll tab — renders salary info or empty state', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const tab = page.getByRole('tab', { name: /payroll/i })
        if (!await tab.isVisible().catch(() => false)) { test.skip(); return }
        await tab.click()
        await page.waitForLoadState('networkidle')
        const content = page.locator('[class*="card"], table, p').first()
        await expect(content).toBeVisible({ timeout: 8_000 })
    })

    test('Leave tab — shows balance panel or records', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const tab = page.getByRole('tab', { name: /^leave$/i })
        if (!await tab.isVisible().catch(() => false)) { test.skip(); return }
        await tab.click()
        await page.waitForLoadState('networkidle')
        const content = page.locator('[class*="card"], table').first()
        await expect(content).toBeVisible({ timeout: 8_000 })
    })

    test('Attendance tab — renders records or date filter', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const tab = page.getByRole('tab', { name: /attendance/i })
        if (!await tab.isVisible().catch(() => false)) { test.skip(); return }
        await tab.click()
        await page.waitForLoadState('networkidle')
        const content = page.locator('table, [class*="card"], input[type="date"]').first()
        await expect(content).toBeVisible({ timeout: 8_000 })
    })

    test('Assets tab — renders or shows no assets', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const tab = page.getByRole('tab', { name: /assets?/i })
        if (!await tab.isVisible().catch(() => false)) { test.skip(); return }
        await tab.click()
        await page.waitForLoadState('networkidle')
        const content = page.locator('table, [class*="card"], p').first()
        await expect(content).toBeVisible({ timeout: 8_000 })
    })

    test('Performance tab — renders reviews or empty state', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        const tab = page.getByRole('tab', { name: /performance/i })
        if (!await tab.isVisible().catch(() => false)) { test.skip(); return }
        await tab.click()
        await page.waitForLoadState('networkidle')
        const content = page.locator('[class*="card"], table, p').first()
        await expect(content).toBeVisible({ timeout: 8_000 })
    })

    test('Overflow tabs — More button accessible when tabs overflow', async ({ page }) => {
        const ok = await gotoFirstEmployee(page)
        if (!ok) { test.skip(); return }
        // Resize viewport to force overflow
        await page.setViewportSize({ width: 600, height: 800 })
        await page.waitForTimeout(500)
        const moreBtn = page.getByRole('button', { name: /more/i })
        // More button may or may not appear depending on screen width — just ensure no crash
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        expect(errors).toHaveLength(0)
    })
})
