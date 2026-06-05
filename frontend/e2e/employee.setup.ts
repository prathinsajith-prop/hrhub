/**
 * Employee setup — logs in as employee role and saves auth state.
 * Set E2E_EMP_EMAIL / E2E_EMP_PASSWORD env vars to override defaults.
 * Defaults match the local seed data (employee@hrhub.ae / Admin@12345).
 * Reuses existing auth state when < 12 hours old to avoid rate limiting.
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_FILE = path.join(__dirname, '.auth/employee.json')

const EMAIL = process.env.E2E_EMP_EMAIL ?? 'employee@hrhub.ae'
const PASSWORD = process.env.E2E_EMP_PASSWORD ?? 'Admin@12345'
const AUTH_KEY = 'hrhub-auth'
const KEEP_SIGNED_IN_KEY = 'hrhub-keep-signed-in'

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
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
            const expiresAtMs = (payload.exp ?? 0) * 1000
            return Date.now() + TOKEN_BUFFER_MS < expiresAtMs
        }
        return false
    } catch {
        return false
    }
}

setup('authenticate as employee', async ({ page }) => {
    if (isAuthFileFresh()) {
        console.log('[setup:employee] Reusing existing auth state (token still valid)')
        return
    }

    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Work Email' }).fill(EMAIL)
    await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL('**/dashboard', { timeout: 30_000 })
    await expect(page).toHaveURL(/dashboard/)

    await page.evaluate(({ authKey, keepKey }) => {
        const data = sessionStorage.getItem(authKey)
        if (data) {
            localStorage.setItem(authKey, data)
            localStorage.setItem(keepKey, 'true')
        }
    }, { authKey: AUTH_KEY, keepKey: KEEP_SIGNED_IN_KEY })

    await page.context().storageState({ path: AUTH_FILE })
})
