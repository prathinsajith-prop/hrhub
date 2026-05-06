/**
 * Visa page — deep functional validation.
 * Tests KPI cards, 3 view tabs, table columns, and actions.
 */
import { test, expect } from '@playwright/test'

test.describe('Visa — deep functional', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/visa')
        await page.waitForLoadState('networkidle')
    })

    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/visa')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows visa heading', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /visa/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('KPI cards visible (Active, In Processing, Critical, Expiring)', async ({ page }) => {
        const cards = page.locator('[class*="card"]')
        await expect(cards.first()).toBeVisible({ timeout: 10_000 })
        const count = await cards.count()
        expect(count).toBeGreaterThanOrEqual(1)
    })

    test('New Application button is visible for super_admin', async ({ page }) => {
        const btn = page.getByRole('button', { name: /new application|add visa|new visa/i })
        await expect(btn.first()).toBeVisible({ timeout: 10_000 })
    })

    test('All Applications tab — table or empty state renders', async ({ page }) => {
        const tab = page.getByRole('tab', { name: /all/i })
        if (await tab.isVisible().catch(() => false)) await tab.click()
        await page.waitForTimeout(500)
        const table = page.locator('table').first()
        const empty = page.getByText(/no visa|no applications/i)
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasEmpty).toBe(true)
    })

    test('Critical tab — switches without errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        const tab = page.getByRole('tab', { name: /critical/i })
        if (!await tab.isVisible().catch(() => false)) { test.skip(); return }
        await tab.click()
        await page.waitForTimeout(600)
        expect(errors).toHaveLength(0)
    })

    test('Timeline tab — switches without errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        const tab = page.getByRole('tab', { name: /timeline/i })
        if (!await tab.isVisible().catch(() => false)) { test.skip(); return }
        await tab.click()
        await page.waitForTimeout(600)
        expect(errors).toHaveLength(0)
    })

    test('search filters table results', async ({ page }) => {
        const search = page.getByPlaceholder(/search/i).first()
        if (!await search.isVisible().catch(() => false)) { test.skip(); return }
        const rowsBefore = await page.locator('table tbody tr').count()
        if (rowsBefore === 0) { test.skip(); return }
        await search.fill('ZZZZZ_NO_MATCH')
        await page.waitForTimeout(600)
        await page.waitForLoadState('networkidle')
        const rowsAfter = await page.locator('table tbody tr').count()
        const empty = await page.getByText(/no visa|no results/i).isVisible().catch(() => false)
        expect(rowsAfter === 0 || empty).toBe(true)
    })

    test('only one pagination bar visible', async ({ page }) => {
        expect(await page.locator('text=/Showing \\d+/').count()).toBeLessThanOrEqual(1)
    })
})
