import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    workers: process.env.CI ? 2 : 3,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ],
    use: {
        baseURL: 'http://localhost:5174',
        actionTimeout: 20_000,
        navigationTimeout: 30_000,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
    },
    projects: [
        // ── Setup projects (run once each, save auth state) ──────────────────
        {
            name: 'setup:admin',
            testMatch: /global\.setup\.ts/,
        },
        {
            name: 'setup:hr',
            testMatch: /hr\.setup\.ts/,
        },
        {
            name: 'setup:employee',
            testMatch: /employee\.setup\.ts/,
        },

        // ── Main test projects ────────────────────────────────────────────────
        // super_admin — runs all tests
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'e2e/.auth/admin.json',
            },
            dependencies: ['setup:admin'],
            // Exclude role-specific specs (those run under their own projects)
            testIgnore: /roles\//,
        },

        // hr_manager — runs role-specific HR tests
        {
            name: 'hr-manager',
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'e2e/.auth/hr.json',
            },
            dependencies: ['setup:hr'],
            testMatch: /roles\/hr\..+\.spec\.ts/,
        },

        // employee — runs role-specific employee tests
        {
            name: 'employee',
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'e2e/.auth/employee.json',
            },
            dependencies: ['setup:employee'],
            testMatch: /roles\/employee\..+\.spec\.ts/,
        },
    ],
    webServer: {
        command: 'pnpm dev',
        url: 'http://localhost:5174',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Explicit cwd so the VS Code Playwright extension can start the dev
        // server correctly when the workspace is opened at the monorepo root.
        cwd: __dirname,
    },
})
