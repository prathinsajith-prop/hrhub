import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/__tests__/setup.ts'],
        include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
        reporters: process.env.CI ? ['verbose', 'github-actions'] : ['verbose'],
        coverage: {
            provider: 'v8',
            reporter: process.env.CI ? ['text', 'lcov'] : ['text', 'html'],
            include: ['src/lib/**', 'src/hooks/**'],
            thresholds: {
                lines: 50,
                functions: 50,
            },
        },
    },
    resolve: {
        alias: { '@': resolve(__dirname, './src') },
    },
})
