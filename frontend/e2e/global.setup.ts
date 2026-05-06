/**
 * Global setup — runs once before all tests.
 * Logs in as the super-admin and saves the browser storage state so every
 * subsequent test starts already authenticated (no repeated login round-trips).
 *
 * Auth state is written to e2e/.auth/admin.json (gitignored).
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_FILE = path.join(__dirname, '.auth/admin.json')

setup('authenticate as super-admin', async ({ page }) => {
    await page.goto('/login')

    // Fill credentials
    await page.getByRole('textbox', { name: 'Work Email' }).fill('admin@hrhub.ae')
    await page.getByRole('textbox', { name: 'Password' }).fill('Admin@12345')

    // Check "Keep me signed in" so tokens are stored in localStorage (not sessionStorage).
    // Without this, the auth state file won't capture tokens and every subsequent test
    // will be unauthenticated.
    await page.getByRole('checkbox').click()

    await page.getByRole('button', { name: 'Sign In', exact: true }).click()

    // Wait until we land on the dashboard — confirms auth succeeded
    await page.waitForURL('**/dashboard', { timeout: 15_000 })
    await expect(page).toHaveURL(/dashboard/)

    // Persist session (localStorage / cookies) so tests skip the login page
    await page.context().storageState({ path: AUTH_FILE })
})
