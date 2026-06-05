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
 *
 * Reuses existing auth state when it's less than 12 hours old to avoid hitting
 * the login rate limiter during repeated local runs.
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_FILE = path.join(__dirname, '.auth/admin.json')

const AUTH_KEY = 'hrhub-auth'
const KEEP_SIGNED_IN_KEY = 'hrhub-keep-signed-in'

// Credentials — update to match the test account
const EMAIL = process.env.E2E_EMAIL ?? 'prathin@propcrm.com'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123'

// Tokens are considered fresh only when the access JWT won't expire before the
// full test suite finishes. We use a 10-minute buffer so tokens don't expire
// mid-run even if the suite takes a while.
const TOKEN_BUFFER_MS = 10 * 60 * 1000

function isAuthFileFresh(): boolean {
    try {
        if (!fs.existsSync(AUTH_FILE)) return false
        const content = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'))
        const origins = content?.origins ?? []
        for (const origin of origins) {
            const entry = (origin.localStorage ?? []).find((e: any) => e.name === AUTH_KEY)
            if (!entry?.value) continue
            const state = JSON.parse(entry.value)?.state
            const token: string = state?.accessToken ?? ''
            if (!token) return false
            // Decode JWT payload (base64url, second segment)
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
            const expiresAtMs = (payload.exp ?? 0) * 1000
            return Date.now() + TOKEN_BUFFER_MS < expiresAtMs
        }
        return false
    } catch {
        return false
    }
}

setup('authenticate as admin', async ({ page }) => {
    // Reuse existing auth file if it's still fresh — avoids hitting the rate limiter
    if (isAuthFileFresh()) {
        console.log('[setup:admin] Reusing existing auth state (token still valid)')
        return
    }

    await page.goto('/login')

    // Fill credentials and sign in
    await page.getByRole('textbox', { name: 'Work Email' }).fill(EMAIL)
    await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

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
