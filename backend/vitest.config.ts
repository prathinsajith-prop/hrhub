import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        reporters: process.env.CI ? ['verbose', 'github-actions'] : ['verbose'],
        coverage: {
            provider: 'v8',
            reporter: process.env.CI ? ['text', 'lcov'] : ['text', 'html'],
            include: ['src/lib/**', 'src/modules/**'],
            exclude: ['src/db/**', 'src/workers/**'],
            thresholds: {
                lines: 40,
                functions: 40,
            },
        },
    },
})
