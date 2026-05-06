/**
 * Self-service (employee portal) pages — my leave, my payslips, my profile.
 * These are accessible to any authenticated user including super_admin.
 */
import { test, expect } from '@playwright/test'

test.describe('My Leave page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/my/leave')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows my leave heading', async ({ page }) => {
        await page.goto('/my/leave')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /my leave/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('leave balance or request list renders', async ({ page }) => {
        await page.goto('/my/leave')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const card = page.locator('[class*="card"]').first()
        const empty = page.getByText(/no leave|no requests/i)
        const hasTable = await table.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasCard || hasEmpty).toBe(true)
    })

    test('only one pagination bar visible', async ({ page }) => {
        await page.goto('/my/leave')
        await page.waitForLoadState('networkidle')
        expect(await page.locator('text=/Showing \\d+/').count()).toBeLessThanOrEqual(1)
    })
})

test.describe('My Payslips page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/my/payslips')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows payslips heading', async ({ page }) => {
        await page.goto('/my/payslips')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /payslips?/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('payslip list or empty state renders', async ({ page }) => {
        await page.goto('/my/payslips')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const card = page.locator('[class*="card"]').first()
        const empty = page.getByText(/no payslips|no pay/i)
        const hasTable = await table.isVisible().catch(() => false)
        const hasCard = await card.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasCard || hasEmpty).toBe(true)
    })
})

test.describe('My Profile page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/my/profile')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows my profile heading', async ({ page }) => {
        await page.goto('/my/profile')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /my profile/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('profile details render (name, email, or employee fields)', async ({ page }) => {
        await page.goto('/my/profile')
        await page.waitForLoadState('networkidle')
        const card = page.locator('[class*="card"]').first()
        const tabs = page.getByRole('tab').first()
        const hasCard = await card.isVisible().catch(() => false)
        const hasTabs = await tabs.isVisible().catch(() => false)
        expect(hasCard || hasTabs).toBe(true)
    })
})

test.describe('Settings page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/settings')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows settings heading', async ({ page }) => {
        await page.goto('/settings')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /settings/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('settings sections render (profile, security, etc.)', async ({ page }) => {
        await page.goto('/settings')
        await page.waitForLoadState('networkidle')
        const card = page.locator('[class*="card"]').first()
        const tabs = page.getByRole('tab').first()
        const hasCard = await card.isVisible().catch(() => false)
        const hasTabs = await tabs.isVisible().catch(() => false)
        expect(hasCard || hasTabs).toBe(true)
    })
})
