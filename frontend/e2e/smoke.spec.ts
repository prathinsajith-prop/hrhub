/**
 * Smoke tests — verify every major route loads without crashing.
 * These catch broken imports, missing routes, and hard JS errors.
 */
import { test, expect } from '@playwright/test'

const PAGES = [
    // Core
    { url: '/dashboard',                heading: /dashboard/i },
    { url: '/employees',                heading: /employees/i },
    { url: '/attendance',               heading: /attendance/i },
    { url: '/leave',                    heading: /leave/i },
    { url: '/documents',                heading: /documents/i },
    { url: '/assets',                   heading: /asset/i },
    { url: '/payroll',                  heading: /payroll/i },
    { url: '/visa',                     heading: /visa/i },
    { url: '/recruitment',              heading: /recruitment/i },
    { url: '/performance',              heading: /performance/i },
    { url: '/calendar',                 heading: /calendar/i },
    { url: '/onboarding',               heading: /onboarding/i },
    { url: '/exit',                     heading: /exit/i },
    { url: '/org-chart',                heading: /org/i },

    // Misc / HR ops
    { url: '/complaints',               heading: /complaints/i },
    { url: '/training',                 heading: /training/i },
    { url: '/loans',                    heading: /loans/i },
    { url: '/compliance',               heading: /compliance/i },
    // /leave-policies redirects to Organization Settings (leave tab) by design.
    { url: '/leave-policies',           heading: /organization settings|leave/i },

    // Insights
    { url: '/notifications',            heading: /notifications/i },
    { url: '/reports',                  heading: /reports/i },
    { url: '/audit',                    heading: /activity log/i },

    // Workspace management
    { url: '/organizations',            heading: /organizations?/i },
    { url: '/organization-settings',    heading: /company|settings|organization/i },
    // /team renders the Org Structure page ("Organization" / "Organization Structure").
    { url: '/team',                     heading: /organization|team/i },
    { url: '/users',                    heading: /users?|members?/i },
    { url: '/apps',                     heading: /apps?|integrations?|connected/i },
    { url: '/subscription',             heading: /subscription|plan/i },

    // Personal / self-service
    { url: '/settings',                 heading: /settings/i },
    { url: '/my/leave',                 heading: /my leave/i },
    { url: '/my/payslips',              heading: /payslips?/i },
    { url: '/my/profile',               heading: /my profile/i },
    { url: '/my/complaints',            heading: /complaints/i },
    { url: '/my/training',              heading: /training/i },
    { url: '/my/loans',                 heading: /loans/i },
    { url: '/my/login-history',         heading: /login history/i },
    { url: '/my/account',               heading: /account/i },
]

for (const { url, heading } of PAGES) {
    test(`${url} loads without errors`, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))

        await page.goto(url)
        await page.waitForLoadState('networkidle')

        // Page must render a visible heading matching the route name
        await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 15_000 })

        // No unhandled JS errors
        expect(errors, `JS errors on ${url}: ${errors.join('; ')}`).toHaveLength(0)
    })
}
