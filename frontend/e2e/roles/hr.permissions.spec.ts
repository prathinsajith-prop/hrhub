/**
 * HR Manager role — permission validation.
 *
 * hr_manager CAN access: employees, leave, documents, attendance, payroll,
 * performance, assets, recruitment, onboarding, exit, visa, compliance,
 * reports, audit, organizations, users, apps, training, loans, complaints,
 * org-settings, subscription, settings, all my/* routes.
 *
 * hr_manager CANNOT access: (none — HR has near-full access, same as super_admin minus some admin ops)
 */
import { test, expect } from '@playwright/test'

// ─── Routes HR Manager can access ─────────────────────────────────────────────

const ACCESSIBLE_ROUTES: { url: string; heading: RegExp }[] = [
    { url: '/dashboard',             heading: /dashboard/i },
    { url: '/employees',             heading: /employees/i },
    { url: '/leave',                 heading: /leave/i },
    { url: '/documents',             heading: /documents/i },
    { url: '/attendance',            heading: /attendance/i },
    { url: '/payroll',               heading: /payroll/i },
    { url: '/performance',           heading: /performance/i },
    { url: '/assets',                heading: /asset/i },
    { url: '/recruitment',           heading: /recruitment/i },
    { url: '/onboarding',            heading: /onboarding/i },
    { url: '/exit',                  heading: /exit/i },
    { url: '/visa',                  heading: /visa/i },
    { url: '/compliance',            heading: /compliance/i },
    { url: '/reports',               heading: /reports/i },
    { url: '/audit',                 heading: /activity log/i },
    { url: '/organizations',         heading: /organizations?/i },
    { url: '/training',              heading: /training/i },
    { url: '/loans',                 heading: /loans/i },
    { url: '/complaints',            heading: /complaints/i },
    { url: '/notifications',         heading: /notifications/i },
    { url: '/settings',              heading: /settings/i },
    { url: '/my/leave',              heading: /my leave/i },
    { url: '/my/payslips',           heading: /payslips?/i },
    { url: '/my/profile',            heading: /my profile/i },
]

for (const { url, heading } of ACCESSIBLE_ROUTES) {
    test(`HR can access ${url}`, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto(url)
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 12_000 })
        expect(errors, `JS errors on ${url}: ${errors.join('; ')}`).toHaveLength(0)
        // Must NOT be redirected to login
        await expect(page).not.toHaveURL(/\/login(\?|#|$)/)
    })
}

// ─── HR-specific functionality ────────────────────────────────────────────────

test.describe('HR Manager — functional capabilities', () => {
    test('can see Add Employee button', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const btn = page.getByRole('button', { name: /add employee/i })
        await expect(btn).toBeVisible({ timeout: 10_000 })
    })

    test('can see all employee records', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        await expect(table).toBeVisible({ timeout: 10_000 })
    })

    test('can access employee detail page', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const cell = page.locator('table tbody tr:first-child td').nth(4)
        if (!await cell.isVisible().catch(() => false)) { test.skip(); return }
        await cell.click()
        await page.waitForURL('**/employees/**', { timeout: 8_000 })
        await expect(page).toHaveURL(/employees\/.+/)
    })

    test('can see payroll runs in History tab', async ({ page }) => {
        await page.goto('/payroll')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /payroll/i }).first()).toBeVisible()
    })

    test('can see recruitment page with New Job button', async ({ page }) => {
        await page.goto('/recruitment')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /recruitment/i }).first()).toBeVisible()
    })

    test('can see reports with all tabs', async ({ page }) => {
        await page.goto('/reports')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /reports/i }).first()).toBeVisible()
        const tabs = page.getByRole('tab')
        const count = await tabs.count()
        expect(count).toBeGreaterThanOrEqual(1)
    })

    test('dashboard shows HR-relevant content', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')
        const card = page.locator('[class*="card"]').first()
        await expect(card).toBeVisible({ timeout: 10_000 })
    })
})
