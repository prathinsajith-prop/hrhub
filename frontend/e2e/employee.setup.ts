/**
 * Employee setup — logs in as employee role and saves auth state.
 * Set E2E_EMP_EMAIL / E2E_EMP_PASSWORD env vars to override defaults.
 * Defaults match the local seed data (employee@hrhub.ae / Admin@12345).
 */
import { test as setup, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_FILE = path.join(__dirname, '.auth/employee.json')

const EMAIL = process.env.E2E_EMP_EMAIL ?? 'employee@hrhub.ae'
const PASSWORD = process.env.E2E_EMP_PASSWORD ?? 'Admin@12345'
const AUTH_KEY = 'hrhub-auth'
const KEEP_SIGNED_IN_KEY = 'hrhub-keep-signed-in'

setup('authenticate as employee', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Work Email' }).fill(EMAIL)
    await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
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
