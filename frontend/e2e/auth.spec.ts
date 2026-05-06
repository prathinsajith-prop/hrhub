/**
 * Auth tests — login, logout, and invalid-credentials error.
 * These run without the saved auth state (they test the login page itself).
 */
import { test, expect } from '@playwright/test'

// Override storageState so these tests start unauthenticated
test.use({ storageState: { cookies: [], origins: [] } })

const EMAIL = process.env.E2E_EMAIL ?? 'prathin@propcrm.com'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123'

test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('textbox', { name: 'Work Email' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible()
    await expect(page.getByText('Forgot password?')).toBeVisible()
})

test('login with valid credentials redirects to dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Work Email' }).fill(EMAIL)
    await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await page.waitForURL('**/dashboard', { timeout: 20_000 })
    await expect(page).toHaveURL(/dashboard/)
})

test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('textbox', { name: 'Work Email' }).fill('nonexistent_test_user_xyz@example-fake-domain.test')
    await page.getByRole('textbox', { name: 'Password' }).fill('WrongPassword_XYZ_999!')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    // Should stay on login and show an error (not navigate away)
    await expect(page).toHaveURL(/login/)
    await expect(page.getByRole('alert').or(page.getByText(/invalid|incorrect|failed|not found/i)).first()).toBeVisible({ timeout: 8_000 })
})

test('protected routes redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/employees')
    await page.waitForURL('**/login', { timeout: 5_000 })
    await expect(page).toHaveURL(/login/)
})

test.describe('"Keep me signed in" checkbox', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login')
    })

    test('checkbox is unchecked by default', async ({ page }) => {
        const checkbox = page.locator('#rememberMe')
        await expect(checkbox).not.toBeChecked()
    })

    test('clicking the label text checks the checkbox', async ({ page }) => {
        const checkbox = page.locator('#rememberMe')
        const labelText = page.getByText('Keep me signed in')

        await expect(checkbox).not.toBeChecked()
        await labelText.click()
        await expect(checkbox).toBeChecked()
    })

    test('clicking the label text toggles off after being checked', async ({ page }) => {
        const checkbox = page.locator('#rememberMe')
        const labelText = page.getByText('Keep me signed in')

        await labelText.click()
        await expect(checkbox).toBeChecked()

        await labelText.click()
        await expect(checkbox).not.toBeChecked()
    })

    test('clicking the label element checks the box', async ({ page }) => {
        const checkbox = page.locator('#rememberMe')
        const label = page.locator('label[for="rememberMe"]')

        await expect(checkbox).not.toBeChecked()
        await label.click()
        await expect(checkbox).toBeChecked()
    })

    test('checkmark appears when checked and disappears when unchecked', async ({ page }) => {
        const checkbox = page.locator('#rememberMe')
        const labelText = page.getByText('Keep me signed in')
        const checkmark = page.locator('label[for="rememberMe"] svg')

        await expect(checkbox).not.toBeChecked()
        await expect(checkmark).not.toBeVisible()

        await labelText.click()
        await expect(checkbox).toBeChecked()
        await expect(checkmark).toBeVisible()

        await labelText.click()
        await expect(checkbox).not.toBeChecked()
        await expect(checkmark).not.toBeVisible()
    })
})
