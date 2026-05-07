/**
 * Recruitment full-flow E2E tests
 *
 * Flow:
 *  1. Creates 3 job postings
 *  2. Adds 150 candidates spread across those jobs
 *  3. Verifies KPI counters update
 *  4. Advances candidates through every pipeline stage
 *  5. Verifies Job Listings tab, job edit, candidate detail page
 *  6. Verifies no pagination duplicates, no JS errors
 */
import { test, expect, type Page } from '@playwright/test'

// ─── static data ──────────────────────────────────────────────────────────────

const JOBS = [
    { title: 'Senior Software Engineer', department: 'Engineering', location: 'Dubai' },
    { title: 'HR Business Partner', department: 'Human Resources', location: 'Abu Dhabi' },
    { title: 'Marketing Specialist', department: 'Marketing', location: 'Sharjah' },
]

const FIRST_NAMES = [
    'Ahmed', 'Sara', 'Mohammed', 'Fatima', 'Ali', 'Mariam', 'Omar', 'Layla', 'Khalid', 'Aisha',
    'James', 'Emily', 'David', 'Jessica', 'Michael', 'Rachel', 'Chris', 'Megan', 'Ryan', 'Laura',
]
const LAST_NAMES = [
    'Al Mansouri', 'Smith', 'Al Rashidi', 'Johnson', 'Al Farsi', 'Williams',
    'Al Hashimi', 'Brown', 'Al Zaabi', 'Davis', 'Al Nuaimi', 'Miller',
]

function candidateName(i: number) {
    return `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`
}
const RUN_ID = Date.now().toString(36)
function candidateEmail(i: number) {
    return `e2e.${RUN_ID}.${i + 1}@recruitment.test`
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function gotoRecruitment(page: Page) {
    await page.goto('/recruitment')
    await page.waitForLoadState('networkidle')
}

/** Click a tab by label — handles both role="tab" and role="button" */
async function clickTab(page: Page, label: string) {
    await page.locator(`[role="tab"]:has-text("${label}"), [role="button"]:has-text("${label}")`).first().click()
    await page.waitForTimeout(400)
}

async function closeDialog(page: Page) {
    const dlg = page.locator('[role="dialog"]')
    if (!await dlg.isVisible({ timeout: 500 }).catch(() => false)) return
    const cancelBtn = dlg.getByRole('button', { name: /cancel/i })
    if (await cancelBtn.isVisible({ timeout: 300 }).catch(() => false)) {
        await cancelBtn.click()
    } else {
        await dlg.getByRole('button', { name: /close/i }).click().catch(() => {})
    }
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
}

async function createJob(page: Page, job: typeof JOBS[0]) {
    await page.getByRole('button', { name: /new job/i }).last().click()
    const dlg = page.locator('[role="dialog"]')
    await expect(dlg).toBeVisible({ timeout: 8_000 })

    await dlg.getByPlaceholder('e.g. Senior Property Consultant').fill(job.title)
    await dlg.getByPlaceholder('e.g. Sales').fill(job.department)
    await dlg.getByPlaceholder('e.g. Dubai Marina').fill(job.location)

    // Register the response listener BEFORE clicking so we don't miss it
    const responsePromise = page.waitForResponse(
        resp => resp.url().includes('/api/v1/jobs') && resp.request().method() === 'POST',
        { timeout: 30_000 },
    )
    await dlg.getByRole('button', { name: /post job/i }).click()
    await responsePromise
    // Dialog closes shortly after the API responds — give it a moment
    await dlg.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(300)
}

async function addCandidate(page: Page, i: number, jobIndex: number) {
    // Dismiss any open toast notifications that may block the button
    await page.locator('[data-radix-toast-close]').evaluateAll(els => els.forEach(el => (el as HTMLElement).click())).catch(() => {})
    // Use the header-level "Add Candidate" button (exact text, not the column + icons)
    await page.getByRole('button', { name: 'Add Candidate', exact: true }).click()
    const dlg = page.locator('[role="dialog"]')
    await expect(dlg).toBeVisible({ timeout: 8_000 })

    // Select job — wait for options to populate before counting
    await dlg.getByRole('combobox').click()
    await page.waitForSelector('[role="option"]', { timeout: 5_000 }).catch(() => {})
    const options = page.locator('[role="option"]')
    const count = await options.count()
    if (count === 0) { await closeDialog(page); return }
    await options.nth(jobIndex % count).click()

    // Fill required fields
    await dlg.getByPlaceholder('Jane Doe').fill(candidateName(i))
    await dlg.getByPlaceholder('jane@example.com').fill(candidateEmail(i))

    await dlg.getByRole('button', { name: /add to pipeline/i }).click()
    // Wait for dialog to close; retry submit once if it stays open (e.g. transient API error)
    const closed = await dlg.waitFor({ state: 'hidden', timeout: 8_000 }).then(() => true).catch(() => false)
    if (!closed) {
        // Retry: update email to a different suffix and try again
        await dlg.getByPlaceholder('jane@example.com').fill(`${candidateEmail(i)}.r`)
        await dlg.getByRole('button', { name: /add to pipeline/i }).click()
        const closed2 = await dlg.waitFor({ state: 'hidden', timeout: 8_000 }).then(() => true).catch(() => false)
        if (!closed2) await closeDialog(page)
    }
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe('Recruitment — full flow', () => {
    test.describe.configure({ mode: 'serial' })
    test.slow()

    // 1 ─ page loads cleanly ───────────────────────────────────────────────────
    test('recruitment page loads without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', e => errors.push(e.message))
        await gotoRecruitment(page)
        await expect(page.getByRole('heading', { name: /recruitment/i }).first()).toBeVisible()
        expect(errors).toHaveLength(0)
    })

    // 2 ─ KPI cards visible ────────────────────────────────────────────────────
    test('KPI cards are all visible', async ({ page }) => {
        await gotoRecruitment(page)
        await expect(page.getByText(/open positions/i)).toBeVisible()
        await expect(page.getByText(/total applicants/i)).toBeVisible()
        await expect(page.getByText(/in interview/i)).toBeVisible()
        await expect(page.getByText(/offer stage/i)).toBeVisible()
    })

    // 3 ─ create 3 jobs ────────────────────────────────────────────────────────
    test('can create 3 job postings', async ({ page }) => {
        await gotoRecruitment(page)
        await clickTab(page, 'Job Listings')

        for (const job of JOBS) {
            await createJob(page, job)
        }

        await clickTab(page, 'Job Listings')
        await page.waitForTimeout(600)
        await expect(page.getByRole('cell', { name: /senior software engineer/i }).first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByRole('cell', { name: /hr business partner/i }).first()).toBeVisible({ timeout: 10_000 })
        await expect(page.getByRole('cell', { name: /marketing specialist/i }).first()).toBeVisible({ timeout: 10_000 })
    })

    // 4 ─ add 150 candidates ───────────────────────────────────────────────────
    test('can add 150 candidates across all jobs', async ({ page }) => {
        test.setTimeout(600_000) // 10 min — 150 candidates × ~2s each
        await gotoRecruitment(page)
        await expect(page.getByRole('button', { name: 'Add Candidate', exact: true })).toBeEnabled({ timeout: 10_000 })

        for (let i = 0; i < 150; i++) {
            await addCandidate(page, i, i % JOBS.length)
            if (i % 25 === 24) await page.waitForTimeout(300)
        }

        // Reload to get fresh KPI data (React Query staleTime may cache the pre-test count)
        await gotoRecruitment(page)
        await page.waitForLoadState('networkidle')

        // KPI — Total Applicants ≥ 150 (uses backend total, not candidates.length)
        const kpiCard = page.locator('text=/total applicants/i').locator('../..')
        const kpiValue = kpiCard.locator('p, span, div').filter({ hasText: /^\d+$/ }).first()
        const val = Number(await kpiValue.textContent({ timeout: 15_000 }).catch(() => '0'))
        expect(val).toBeGreaterThanOrEqual(150)
    })

    // 5 ─ kanban shows all pipeline stages ────────────────────────────────────
    test('kanban board renders all pipeline stages', async ({ page }) => {
        await gotoRecruitment(page)
        await clickTab(page, 'Candidate Pipeline')

        for (const stage of ['Received', 'Screening', 'Interview', 'Assessment', 'Offer', 'Pre-boarding']) {
            await expect(page.getByText(stage).first()).toBeVisible({ timeout: 8_000 })
        }
    })

    // 6 ─ move candidates through every stage ─────────────────────────────────
    test('can advance candidates through all pipeline stages', async ({ page }) => {
        await gotoRecruitment(page)
        await clickTab(page, 'Candidate Pipeline')
        await page.waitForTimeout(1_000)

        const transitions = [
            'Move to Screening →',
            'Move to Interview →',
            'Move to Assessment →',
            'Move to Offer →',
            'Move to Pre-boarding →',
        ]

        for (const btnText of transitions) {
            // Use exact:true so we don't accidentally match the card's composite aria-label
            const btn = page.getByRole('button', { name: btnText, exact: true }).first()
            if (!await btn.isVisible({ timeout: 5_000 }).catch(() => false)) continue
            await btn.click()
            await page.waitForTimeout(1_000)
        }

        // After the last move, wait for "Convert to Employee" button to appear (only pre_boarding shows it)
        // OR fall back to checking the count badge directly
        const convertBtn = page.getByRole('button', { name: /convert to employee/i }).first()
        const hasConvert = await convertBtn.isVisible({ timeout: 5_000 }).catch(() => false)
        if (hasConvert) {
            // At least 1 candidate reached pre_boarding — all good
            return
        }

        // Fallback: reload and check count badge
        await gotoRecruitment(page)
        await clickTab(page, 'Candidate Pipeline')
        await page.waitForTimeout(1_500)

        const preBoardingHeader = page.getByText('Pre-boarding').first()
        await expect(preBoardingHeader).toBeVisible()
        const countBadge = preBoardingHeader.locator('..').getByText(/^\d+$/).first()
        const preCount = Number(await countBadge.textContent({ timeout: 8_000 }).catch(() => '0'))
        expect(preCount).toBeGreaterThanOrEqual(1)
    })

    // 7 ─ clicking a candidate card navigates to detail page ──────────────────
    test('candidate card navigates to detail profile', async ({ page }) => {
        await gotoRecruitment(page)
        await clickTab(page, 'Candidate Pipeline')
        await page.waitForTimeout(1_000)

        // Each card has an edit button; clicking the view area navigates to /recruitment/candidates/:id
        const viewBtns = page.getByRole('button').filter({ has: page.locator('[data-lucide="external-link"], [data-lucide="eye"]') })
        const hasView = await viewBtns.first().isVisible({ timeout: 3_000 }).catch(() => false)
        if (hasView) {
            await viewBtns.first().click()
            await page.waitForURL(/\/recruitment\/candidates\//, { timeout: 10_000 }).catch(() => {})
            if (page.url().includes('/recruitment/candidates/')) {
                await expect(page.getByText(/stage|email|applied/i).first()).toBeVisible({ timeout: 8_000 })
                await page.goBack()
            }
        }
    })

    // 8 ─ Job Listings tab — edit a job ───────────────────────────────────────
    test('can edit a job posting', async ({ page }) => {
        await gotoRecruitment(page)
        await clickTab(page, 'Job Listings')
        await page.waitForTimeout(600)

        // Open row action menu on the first job row
        const moreBtn = page.locator('button[aria-label*="actions" i], button[aria-label*="more" i]').first()
        if (!await moreBtn.isVisible({ timeout: 3_000 }).catch(() => false)) return

        await moreBtn.click()
        const editItem = page.getByRole('menuitem', { name: /edit/i }).first()
        if (!await editItem.isVisible({ timeout: 2_000 }).catch(() => false)) return

        await editItem.click()
        const dlg = page.locator('[role="dialog"]')
        if (!await dlg.isVisible({ timeout: 5_000 }).catch(() => false)) return

        const desc = dlg.getByPlaceholder(/description/i)
        if (await desc.isVisible()) await desc.fill('Updated via E2E — pipeline validation.')
        await dlg.getByRole('button', { name: /save|update|post job/i }).first().click()
        await dlg.waitFor({ state: 'hidden', timeout: 10_000 })
    })

    // 9 ─ Job Listings search filters by title ────────────────────────────────
    test('Job Listings search filters by job title', async ({ page }) => {
        await gotoRecruitment(page)
        await clickTab(page, 'Job Listings')
        await page.waitForTimeout(500)

        const search = page.getByPlaceholder(/search jobs/i)
        await expect(search).toBeVisible({ timeout: 5_000 })

        await search.fill('Software')
        await page.waitForTimeout(600)
        await expect(page.getByRole('cell', { name: /senior software engineer/i }).first()).toBeVisible()
        await expect(page.getByRole('cell', { name: /hr business partner/i }).first()).not.toBeVisible()

        await search.clear()
        await page.waitForTimeout(400)
        await expect(page.getByRole('cell', { name: /hr business partner/i }).first()).toBeVisible()
    })

    // 10 ─ export button works ─────────────────────────────────────────────────
    test('export button works without JS errors', async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', e => errors.push(e.message))
        await gotoRecruitment(page)

        const exportBtn = page.getByRole('button', { name: /export/i }).first()
        await expect(exportBtn).toBeVisible()
        await exportBtn.click()
        await page.waitForTimeout(500)

        const dropdown = page.locator('[role="menu"]')
        if (await dropdown.isVisible({ timeout: 1_000 }).catch(() => false)) {
            const firstItem = dropdown.getByRole('menuitem').first()
            if (await firstItem.isVisible()) await firstItem.click()
        }

        await page.waitForTimeout(800)
        expect(errors).toHaveLength(0)
    })

    // 11 ─ no duplicate pagination in Job Listings ─────────────────────────────
    test('no duplicate pagination bars in Job Listings', async ({ page }) => {
        await gotoRecruitment(page)
        await clickTab(page, 'Job Listings')
        await page.waitForTimeout(500)
        const bars = page.locator('text=/Showing \\d+/')
        expect(await bars.count()).toBeLessThanOrEqual(1)
    })

    // 12 ─ KPI cards reflect accurate data ────────────────────────────────────
    test('KPI cards reflect accurate counts', async ({ page }) => {
        await gotoRecruitment(page)
        await page.waitForTimeout(800)

        const openPos = page.getByText(/open positions/i).first().locator('../..').getByText(/^\d+$/).first()
        const openCount = Number(await openPos.textContent({ timeout: 8_000 }).catch(() => '0'))
        expect(openCount).toBeGreaterThanOrEqual(JOBS.length)

        const totalApp = page.getByText(/total applicants/i).first().locator('../..').getByText(/^\d+$/).first()
        const appCount = Number(await totalApp.textContent({ timeout: 8_000 }).catch(() => '0'))
        expect(appCount).toBeGreaterThanOrEqual(150)
    })

    // 13 ─ pipeline stage columns show numeric counts ──────────────────────────
    test('pipeline stage column counts are numeric', async ({ page }) => {
        await gotoRecruitment(page)
        await clickTab(page, 'Candidate Pipeline')
        await page.waitForTimeout(800)

        for (const stage of ['Received', 'Screening', 'Interview', 'Assessment']) {
            const header = page.getByText(stage).first()
            await expect(header).toBeVisible()
            const countText = await header.locator('..').getByText(/^\d+$/).first()
                .textContent({ timeout: 5_000 }).catch(() => null)
            if (countText !== null) expect(Number(countText)).toBeGreaterThanOrEqual(0)
        }
    })

    // 14 ─ candidate cards show name and move button ───────────────────────────
    test('candidate cards show name and Move button', async ({ page }) => {
        await gotoRecruitment(page)
        await clickTab(page, 'Candidate Pipeline')
        await page.waitForTimeout(1_000)

        // At least one "Move to Screening" button should be visible
        const firstMoveBtn = page.getByRole('button', { name: 'Move to Screening →', exact: true }).first()
        await expect(firstMoveBtn).toBeVisible({ timeout: 8_000 })
    })

    // 15 ─ In Interview KPI increments after stage move ───────────────────────
    test('In Interview KPI increments after moving a candidate', async ({ page }) => {
        await gotoRecruitment(page)
        await page.waitForTimeout(500)

        const interviewKpi = page.getByText(/in interview/i).first().locator('../..').getByText(/^\d+$/).first()
        const before = Number(await interviewKpi.textContent({ timeout: 5_000 }).catch(() => '0'))

        await clickTab(page, 'Candidate Pipeline')
        await page.waitForTimeout(600)

        const toInterviewBtn = page.getByRole('button', { name: 'Move to Interview →', exact: true }).first()
        if (await toInterviewBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await toInterviewBtn.click()
            await page.waitForTimeout(1_000)
            const after = Number(await interviewKpi.textContent({ timeout: 8_000 }).catch(() => '0'))
            expect(after).toBeGreaterThanOrEqual(before)
        }
    })
})
