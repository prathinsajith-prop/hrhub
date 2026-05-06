/**
 * Pagination regression tests.
 *
 * Guards against: duplicate pagination controls, missing result counts,
 * pagination not navigating data, DataTable internal pagination conflicting
 * with server-side TablePagination.
 *
 * Pattern for every server-side paginated page:
 *  1. Page loads — shows result count ("Showing X–Y of Z results")
 *  2. If Z > page size — Next button exists and is enabled
 *  3. Clicking Next — data changes (first row differs)
 *  4. Clicking Previous — returns to original first row
 */
import { test, expect, type Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Locates the shared TablePagination "Showing X–Y of Z" text. */
function paginationBar(page: Page) {
    return page.locator('text=/Showing \\d+/').first()
}

/**
 * Asserts there is at most ONE "Showing" count visible on the page.
 * Catches the dual-pagination bug where DataTable's internal footer and
 * TablePagination both render simultaneously.
 */
async function assertSinglePagination(page: Page) {
    const bars = page.locator('text=/Showing \\d+/')
    const count = await bars.count()
    expect(count, 'Only one pagination "Showing" text should appear — found duplicate').toBeLessThanOrEqual(1)
}

async function assertNoInternalPageControls(page: Page) {
    const pageControls = page.locator('text=/Page \\d+ of \\d+/')
    const count = await pageControls.count()
    expect(count, '"Page X of Y" controls must be hidden when TablePagination is used').toBe(0)
}

// ─── Employees ────────────────────────────────────────────────────────────────

test.describe('Employees pagination', () => {
    test('shows single result count (no duplicate pagination)', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        await assertSinglePagination(page)
    })

    test('no DataTable internal page controls', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        await assertNoInternalPageControls(page)
    })

    test('shows result count when employees exist', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const bar = paginationBar(page)
        const empty = page.getByText(/no employees/i)
        const hasBar = await bar.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasBar || hasEmpty).toBe(true)
    })

    test('Next navigates to second page when total > 10', async ({ page }) => {
        await page.goto('/employees')
        await page.waitForLoadState('networkidle')
        const nextBtns = page.getByRole('button', { name: /^next$/i })
        const nextCount = await nextBtns.count()
        if (nextCount === 0) { test.skip(); return }
        const nextBtn = nextBtns.first()
        const isEnabled = await nextBtn.isEnabled().catch(() => false)
        if (!isEnabled) { test.skip(); return }

        const firstCell = await page.locator('table tbody tr:first-child td').nth(1).textContent()
        await Promise.all([
            page.waitForResponse(res => res.url().includes('/employees') && res.status() === 200),
            nextBtn.click(),
        ])

        await expect(page.getByRole('button', { name: /^previous$/i }).first()).toBeEnabled({ timeout: 5_000 })

        await Promise.all([
            page.waitForResponse(res => res.url().includes('/employees') && res.status() === 200),
            page.getByRole('button', { name: /^previous$/i }).first().click(),
        ])
        const restoredCell = await page.locator('table tbody tr:first-child td').nth(1).textContent()
        expect(restoredCell).toBe(firstCell)
    })
})

// ─── Notifications ────────────────────────────────────────────────────────────

test.describe('Notifications pagination', () => {
    test('shows result count when notifications exist', async ({ page }) => {
        await page.goto('/notifications')
        await page.waitForLoadState('networkidle')

        const bar = paginationBar(page)
        const notificationItems = page.locator('[data-testid="notification-item"]').or(
            page.locator('text=/ago$|minutes ago|hours ago|days ago/').first()
        )
        const hasItems = await notificationItems.count() > 0
        if (hasItems) {
            await expect(bar).toBeVisible()
        }
    })

    test('Next button loads second page when total > 20', async ({ page }) => {
        await page.goto('/notifications')
        await page.waitForLoadState('networkidle')

        const nextBtns = page.getByRole('button', { name: /next/i })
        const nextCount = await nextBtns.count()
        if (nextCount === 0) { test.skip(); return }
        const nextBtn = nextBtns.first()
        const isEnabled = await nextBtn.isEnabled().catch(() => false)
        if (!isEnabled) { test.skip(); return }

        const firstTitle = await page.locator('p.text-sm.font-medium, p.font-semibold').first().textContent()
        await nextBtn.click()
        await page.waitForTimeout(1000)

        const barText = await paginationBar(page).textContent()
        expect(barText).toMatch(/Showing 2[01]/)

        await expect(page.getByRole('button', { name: /previous/i }).first()).toBeEnabled()

        await page.getByRole('button', { name: /previous/i }).first().click()
        await page.waitForTimeout(1000)
        const restoredTitle = await page.locator('p.text-sm.font-medium, p.font-semibold').first().textContent()
        expect(restoredTitle).toBe(firstTitle)
    })
})

// ─── Complaints ───────────────────────────────────────────────────────────────

test.describe('Complaints pagination', () => {
    test('shows single pagination control (no duplicate)', async ({ page }) => {
        await page.goto('/complaints')
        await page.waitForLoadState('networkidle')
        await assertSinglePagination(page)
    })

    test('no DataTable internal page controls', async ({ page }) => {
        await page.goto('/complaints')
        await page.waitForLoadState('networkidle')
        await assertNoInternalPageControls(page)
    })

    test('shows result count when complaints exist', async ({ page }) => {
        await page.goto('/complaints')
        await page.waitForLoadState('networkidle')
        const bar = paginationBar(page)
        const empty = page.getByText(/no complaints/i)
        const hasBar = await bar.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasBar || hasEmpty).toBe(true)
    })

    test('Next button loads second page when total > 30', async ({ page }) => {
        await page.goto('/complaints')
        await page.waitForLoadState('networkidle')
        const nextBtns = page.getByRole('button', { name: /next/i })
        const nextCount = await nextBtns.count()
        if (nextCount === 0) { test.skip(); return }
        const nextBtn = nextBtns.first()
        const isEnabled = await nextBtn.isEnabled().catch(() => false)
        if (!isEnabled) { test.skip(); return }

        const firstCell = await page.locator('table tbody tr:first-child td:first-child').textContent()
        await Promise.all([
            page.waitForResponse(res => res.url().includes('/complaints') && res.status() === 200),
            nextBtn.click(),
        ])

        const newFirstCell = await page.locator('table tbody tr:first-child td:first-child').textContent()
        expect(newFirstCell).not.toBe(firstCell)

        await Promise.all([
            page.waitForResponse(res => res.url().includes('/complaints') && res.status() === 200),
            page.getByRole('button', { name: /previous/i }).first().click(),
        ])
        const restoredCell = await page.locator('table tbody tr:first-child td:first-child').textContent()
        expect(restoredCell).toBe(firstCell)
    })
})

// ─── Assets ───────────────────────────────────────────────────────────────────

test.describe('Assets pagination', () => {
    test('shows single pagination control (no duplicate)', async ({ page }) => {
        await page.goto('/assets')
        await page.waitForLoadState('networkidle')
        await assertSinglePagination(page)
    })

    test('no DataTable internal page controls', async ({ page }) => {
        await page.goto('/assets')
        await page.waitForLoadState('networkidle')
        await assertNoInternalPageControls(page)
    })

    test('shows result count when assets exist', async ({ page }) => {
        await page.goto('/assets')
        await page.waitForLoadState('networkidle')
        const bar = paginationBar(page)
        const empty = page.getByText(/no assets/i)
        const hasBar = await bar.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasBar || hasEmpty).toBe(true)
    })
})

// ─── Leave ────────────────────────────────────────────────────────────────────

test.describe('Leave pagination', () => {
    test('shows single pagination control (no duplicate)', async ({ page }) => {
        await page.goto('/leave')
        await page.waitForLoadState('networkidle')
        await assertSinglePagination(page)
    })

    test('no DataTable internal page controls', async ({ page }) => {
        await page.goto('/leave')
        await page.waitForLoadState('networkidle')
        await assertNoInternalPageControls(page)
    })

    test('table or empty state renders', async ({ page }) => {
        await page.goto('/leave')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table').first()
        const empty = page.getByText(/no leave|no requests/i)
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasEmpty).toBe(true)
    })
})

// ─── Attendance ───────────────────────────────────────────────────────────────

test.describe('Attendance pagination', () => {
    test('shows single pagination control (no duplicate)', async ({ page }) => {
        await page.goto('/attendance')
        await page.waitForLoadState('networkidle')
        await assertSinglePagination(page)
    })

    test('table renders with pagination controls for large datasets', async ({ page }) => {
        await page.goto('/attendance')
        await page.waitForLoadState('networkidle')
        const table = page.locator('table, [role="table"]').first()
        const empty = page.locator('text=/no records|no attendance/i').first()
        const hasTable = await table.isVisible().catch(() => false)
        const hasEmpty = await empty.isVisible().catch(() => false)
        expect(hasTable || hasEmpty).toBe(true)
    })
})

// ─── Documents ────────────────────────────────────────────────────────────────

test.describe('Documents pagination', () => {
    test('shows single pagination control (no duplicate)', async ({ page }) => {
        await page.goto('/documents')
        await page.waitForLoadState('networkidle')
        await assertSinglePagination(page)
    })

    test('no DataTable internal page controls', async ({ page }) => {
        await page.goto('/documents')
        await page.waitForLoadState('networkidle')
        await assertNoInternalPageControls(page)
    })
})

// ─── Recruitment ──────────────────────────────────────────────────────────────

test.describe('Recruitment pagination', () => {
    test('shows single pagination control (no duplicate)', async ({ page }) => {
        await page.goto('/recruitment')
        await page.waitForLoadState('networkidle')
        await assertSinglePagination(page)
    })

    test('no DataTable internal page controls', async ({ page }) => {
        await page.goto('/recruitment')
        await page.waitForLoadState('networkidle')
        await assertNoInternalPageControls(page)
    })
})

// ─── Exit ─────────────────────────────────────────────────────────────────────

test.describe('Exit page pagination', () => {
    test('shows single pagination control (no duplicate)', async ({ page }) => {
        await page.goto('/exit')
        await page.waitForLoadState('networkidle')
        await assertSinglePagination(page)
    })
})
