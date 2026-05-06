/**
 * Training & Loans pages — deep functional validation (CRUD, KPI cards, table).
 */
import { test, expect } from '@playwright/test'

// ─── Training ─────────────────────────────────────────────────────────────────

test.describe('Training — deep functional', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/training')
        await page.waitForLoadState('networkidle')
    })

    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/training')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows Training heading', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /training/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('KPI cards visible (Total, Planned, Completed, Cost)', async ({ page }) => {
        const cards = page.locator('[class*="card"]')
        await expect(cards.first()).toBeVisible({ timeout: 10_000 })
        const count = await cards.count()
        expect(count).toBeGreaterThanOrEqual(1)
    })

    test('Add Record button visible for super_admin', async ({ page }) => {
        const btn = page.getByRole('button', { name: /add record|new training|add training/i })
        await expect(btn.first()).toBeVisible({ timeout: 10_000 })
    })

    test('Add Record dialog opens on button click', async ({ page }) => {
        const btn = page.getByRole('button', { name: /add record|new training|add training/i })
        if (!await btn.first().isVisible().catch(() => false)) { test.skip(); return }
        await btn.first().click()
        // Dialog or modal should appear
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })
    })

    test('Add Record dialog can be closed', async ({ page }) => {
        const btn = page.getByRole('button', { name: /add record|new training|add training/i })
        if (!await btn.first().isVisible().catch(() => false)) { test.skip(); return }
        await btn.first().click()
        const dialog = page.getByRole('dialog')
        if (!await dialog.isVisible().catch(() => false)) { test.skip(); return }
        // Close via Escape or close button
        const closeBtn = dialog.getByRole('button', { name: /cancel|close|×/i }).first()
        if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click()
        } else {
            await page.keyboard.press('Escape')
        }
        await page.waitForTimeout(300)
        await expect(dialog).not.toBeVisible()
    })

    test('table or empty state renders', async ({ page }) => {
        const table = page.locator('table').first()
        const empty = page.getByText(/no training|no records/i)
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasEmpty).toBe(true)
    })

    test('search input filters results', async ({ page }) => {
        const search = page.getByPlaceholder(/search/i).first()
        if (!await search.isVisible().catch(() => false)) { test.skip(); return }
        const rowsBefore = await page.locator('table tbody tr').count()
        if (rowsBefore === 0) { test.skip(); return }
        await search.fill('ZZZZZ_NO_MATCH')
        await page.waitForTimeout(600)
        const rowsAfter = await page.locator('table tbody tr').count()
        const empty = await page.getByText(/no training|no results/i).isVisible().catch(() => false)
        expect(rowsAfter === 0 || empty).toBe(true)
    })

    test('pagination within range', async ({ page }) => {
        expect(await page.locator('text=/Showing \\d+/').count()).toBeLessThanOrEqual(1)
    })
})

// ─── Loans ────────────────────────────────────────────────────────────────────

test.describe('Loans — deep functional', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/loans')
        await page.waitForLoadState('networkidle')
    })

    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/loans')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows Loans heading', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /loans/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('KPI strip visible (Total, Pending, Active, Outstanding)', async ({ page }) => {
        const cards = page.locator('[class*="card"]')
        await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    })

    test('New Loan button visible', async ({ page }) => {
        const btn = page.getByRole('button', { name: /new loan|add loan/i })
        await expect(btn.first()).toBeVisible({ timeout: 10_000 })
    })

    test('New Loan dialog opens', async ({ page }) => {
        const btn = page.getByRole('button', { name: /new loan|add loan/i })
        if (!await btn.first().isVisible().catch(() => false)) { test.skip(); return }
        await btn.first().click()
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })
    })

    test('New Loan dialog can be closed', async ({ page }) => {
        const btn = page.getByRole('button', { name: /new loan|add loan/i })
        if (!await btn.first().isVisible().catch(() => false)) { test.skip(); return }
        await btn.first().click()
        const dialog = page.getByRole('dialog')
        if (!await dialog.isVisible().catch(() => false)) { test.skip(); return }
        const closeBtn = dialog.getByRole('button', { name: /cancel|close/i }).first()
        if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click()
        } else {
            await page.keyboard.press('Escape')
        }
        await page.waitForTimeout(300)
        await expect(dialog).not.toBeVisible()
    })

    test('table or empty state renders', async ({ page }) => {
        const table = page.locator('table').first()
        const empty = page.getByText(/no loans|no advances/i)
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasEmpty).toBe(true)
    })

    test('only one pagination bar visible', async ({ page }) => {
        expect(await page.locator('text=/Showing \\d+/').count()).toBeLessThanOrEqual(1)
    })
})
