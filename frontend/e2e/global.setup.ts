/**
 * Global setup — runs once before all tests.
 * Logs in as the admin and saves the browser storage state so every
 * subsequent test starts already authenticated (no repeated login round-trips).
 *
 * Auth state is written to e2e/.auth/admin.json (gitignored).
 *
 * The app stores auth tokens in sessionStorage by default (unless "Keep me signed in"
 * is checked). Since Playwright's storageState only captures localStorage + cookies,
 * we manually copy the auth data from sessionStorage to localStorage after login so
 * the saved state includes the tokens.
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_FILE = path.join(__dirname, '.auth/admin.json')

const AUTH_KEY = 'hrhub-auth'
const KEEP_SIGNED_IN_KEY = 'hrhub-keep-signed-in'

// Credentials — update to match the test account
const EMAIL = process.env.E2E_EMAIL ?? 'prathin@propcrm.com'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123'

setup('authenticate as admin', async ({ page }) => {
    await page.goto('/login')

    // Fill credentials and sign in
    await page.getByRole('textbox', { name: 'Work Email' }).fill(EMAIL)
    await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()

    // Wait until we land on the dashboard — confirms auth succeeded
    await page.waitForURL('**/dashboard', { timeout: 30_000 })
    await expect(page).toHaveURL(/dashboard/)

    // Auth tokens land in sessionStorage (no "Remember me" checked).
    // Copy them to localStorage so Playwright's storageState captures them
    // and subsequent tests start authenticated.
    await page.evaluate(({ authKey, keepKey }) => {
        const data = sessionStorage.getItem(authKey)
        if (data) {
            localStorage.setItem(authKey, data)
            localStorage.setItem(keepKey, 'true')
        }
    }, { authKey: AUTH_KEY, keepKey: KEEP_SIGNED_IN_KEY })

    // Persist session (localStorage / cookies) so tests skip the login page
    await page.context().storageState({ path: AUTH_FILE })
})
