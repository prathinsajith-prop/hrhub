/**
 * Organizations and workspace management pages — org structure, team, users, apps.
 */
import { test, expect } from '@playwright/test'

test.describe('Organizations page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/organizations')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows organizations heading', async ({ page }) => {
        await page.goto('/organizations')
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('heading', { name: /organizations?/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    test('content renders (tree, list, or empty state)', async ({ page }) => {
        await page.goto('/organizations')
        await page.waitForLoadState('networkidle')
        const card = page.locator('[class*="card"]').first()
        const button = page.getByRole('button').first()
        const hasCard = await card.isVisible().catch(() => false)
        const hasButton = await button.isVisible().catch(() => false)
        expect(hasCard || hasButton).toBe(true)
    })
})

test.describe('Organization Settings page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/organization-settings')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows settings heading or tabs', async ({ page }) => {
        await page.goto('/organization-settings')
        await page.waitForLoadState('networkidle')
        const heading = page.getByRole('heading').first()
        const tabs = page.getByRole('tab').first()
        const hasHeading = await heading.isVisible().catch(() => false)
        const hasTabs = await tabs.isVisible().catch(() => false)
        expect(hasHeading || hasTabs).toBe(true)
    })
})

test.describe('Team page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/team')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows team heading', async ({ page }) => {
        await page.goto('/team')
        await page.waitForLoadState('networkidle')
        // /team renders the Org Structure page, headed "Organization" / "Organization Structure".
        await expect(page.getByRole('heading', { name: /organization|team/i }).first()).toBeVisible({ timeout: 10_000 })
    })
})

test.describe('Users page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/users')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows users heading or member list', async ({ page }) => {
        await page.goto('/users')
        await page.waitForLoadState('networkidle')
        const heading = page.getByRole('heading', { name: /users?|members?/i }).first()
        await expect(heading).toBeVisible({ timeout: 10_000 })
    })
})

test.describe('Connected Apps page', () => {
    test('renders without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', err => errors.push(err.message))
        await page.goto('/apps')
        await page.waitForLoadState('networkidle')
        expect(errors).toHaveLength(0)
    })

    test('shows apps or integrations heading', async ({ page }) => {
        await page.goto('/apps')
        await page.waitForLoadState('networkidle')
        const heading = page.getByRole('heading', { name: /apps?|integrations?|connected/i }).first()
        await expect(heading).toBeVisible({ timeout: 10_000 })
    })
})
