import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5175,
        // Proxy API calls to the portal backend (separate Fastify service on port 4001).
        // Important: this app does NOT call the main backend (4000) directly.
        proxy: {
            '/api/v1': {
                target: 'http://localhost:4001',
                changeOrigin: true,
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: (id) => {
                    if (!id.includes('node_modules')) return undefined
                    if (id.includes('react-router')) return 'router'
                    if (id.includes('@tanstack/react-query')) return 'query'
                    // Charts: recharts pulls in d3-shape/d3-scale/d3-array/d3-color etc. — bundle them together
                    // so a recharts update doesn't bust the much larger React chunk's cache.
                    if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts'
                    if (id.includes('react-day-picker') || id.includes('date-fns')) return 'date-picker'
                    if (id.includes('zod') || id.includes('react-hook-form') || id.includes('@hookform')) return 'forms'
                    if (id.includes('lucide-react')) return 'icons'
                    if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n'
                    if (id.includes('@radix-ui')) return 'radix'
                    if (id.includes('react-dom') || id.includes('/react/')) return 'react'
                    return 'vendor'
                },
            },
        },
    },
})
