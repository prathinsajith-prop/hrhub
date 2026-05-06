/**
 * Miscellaneous HR pages — compliance, reports, audit log, notifications,
 * training, loans. Each page must load without JS errors and show its heading.
 */
import { test, expect } from '@playwright/test'

// ─── Compliance ───────────────────────────────────────────────────────────────

test.describe('Compliance page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/compliance')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows compliance heading', async ({ page }) => {
        await page.goto('/compliance')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /compliance/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('content or empty state renders', async ({ page }) => {
        await page.goto('/compliance')
        await page.waitForLoadState('networkidle')
        const card = page.locator('[class*="card"]').first()
        const content = page.locator('main, [role="main"]').first()
        const hasCard = await card.isVisible().catch(() => false)
        const hasContent = await content.isVisible().catch(() => false)
        expect(hasCard || hasContent).toBe(true)
    })
})

// ─── Reports ─────────────────────────────────────────────────────────────────

test.describe('Reports page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/reports')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows reports heading', async ({ page }) => {
        await page.goto('/reports')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /reports/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('report sections or download buttons visible', async ({ page }) => {
        await page.goto('/reports')
        await page.waitForLoadState('networkidle')
        const card = page.locator('[class*="card"]').first()
        const button = page.getByRole('button').first()
        const hasCard = await card.isVisible().catch(() => false)
        const hasButton = await button.isVisible().catch(() => false)
        expect(hasCard || hasButton).toBe(true)
    })
})

// ─── Audit Log ───────────────────────────────────────────────────────────────

test.describe('Audit Log page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/audit')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows activity log heading', async ({ page }) => {
        await page.goto('/audit')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /activity log/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('table or empty state renders', async ({ page }) => {
        await page.goto('/audit')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const card = page.locator('[class*="card"]').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasTable || hasCard).toBe(true)
    })

    test('only one pagination bar visible', async ({ page }) => {
        await page.goto('/audit')
        await page.waitForLoadState('networkidle')
        expect(await page.locator('text=/Showing \\d+/').count()).toBeLessThanOrEqual(1)
    })
})

// ─── Notifications ────────────────────────────────────────────────────────────

test.describe('Notifications page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/notifications')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows notifications heading', async ({ page }) => {
        await page.goto('/notifications')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /notifications/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('notification list or empty state renders', async ({ page }) => {
        await page.goto('/notifications')
        await page.waitForLoadState('networkidle')
        const list = page.locator('ul, [role="list"], [class*="notification"]').first()
        const empty = page.getByText(/no notifications|all caught up/i)
        const card = page.locator('[class*="card"]').first()
        const hasList = await list.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasList || hasEmpty || hasCard).toBe(true)
    })
})

// ─── Training ─────────────────────────────────────────────────────────────────

test.describe('Training page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/training')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows training heading', async ({ page }) => {
        await page.goto('/training')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /training/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('table or empty state renders', async ({ page }) => {
        await page.goto('/training')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const empty = page.getByText(/no training|no records/i)
        const card = page.locator('[class*="card"]').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasTable || hasEmpty || hasCard).toBe(true)
    })

    test('only one pagination bar visible', async ({ page }) => {
        await page.goto('/training')
        await page.waitForLoadState('networkidle')
        expect(await page.locator('text=/Showing \\d+/').count()).toBeLessThanOrEqual(1)
    })
})

// ─── Loans ────────────────────────────────────────────────────────────────────

test.describe('Loans page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/loans')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows loans heading', async ({ page }) => {
        await page.goto('/loans')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /loans/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('table or empty state renders', async ({ page }) => {
        await page.goto('/loans')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const empty = page.getByText(/no loans|no advances/i)
        const card = page.locator('[class*="card"]').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        expect(hasTable || hasEmpty || hasCard).toBe(true)
    })

    test('only one pagination bar visible', async ({ page }) => {
        await page.goto('/loans')
        await page.waitForLoadState('networkidle')
        expect(await page.locator('text=/Showing \\d+/').count()).toBeLessThanOrEqual(1)
    })
})
