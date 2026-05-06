/**
 * Smoke tests — verify every major route loads without crashing.
 * These catch broken imports, missing routes, and hard JS errors.
 */
import { test, expect } from '@playwright/test'

const PAGES = [
    { url: '/dashboard',        heading: /dashboard/i },
    { url: '/employees',        heading: /employees/i },
    { url: '/attendance',       heading: /attendance/i },
    { url: '/leave',            heading: /leave/i },
    { url: '/documents',        heading: /documents/i },
    { url: '/assets',           heading: /asset/i },
    { url: '/payroll',          heading: /payroll/i },
    { url: '/visa',             heading: /visa/i },
    { url: '/recruitment',      heading: /recruitment/i },
    { url: '/performance',      heading: /performance/i },
    { url: '/complaints',       heading: /complaints/i },
    { url: '/notifications',    heading: /notifications/i },
    { url: '/reports',          heading: /reports/i },
    { url: '/audit',            heading: /activity log/i },
]

for (const { url, heading } of PAGES) {
    test(`${url} loads without errors`, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))

        await page.goto(url)

        // Page must render a visible heading matching the route name
        await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 10_000 })

        // No unhandled JS errors
        expect(errors, `JS errors on ${url}: ${errors.join('; ')}`).toHaveLength(0)
    })
}
