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
    proxy: {
      '/api/v1': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Split heavy vendor libraries into their own long-cacheable chunks so the
    // app shell stays small on first paint and subsequent app-only deploys
    // don't bust the vendor cache.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-router')) return 'router'
          if (id.includes('@tanstack/react-query')) return 'query'
          if (id.includes('@tanstack/react-table')) return 'table'
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('@fullcalendar')) return 'fullcalendar'
          if (id.includes('country-atlas') || id.includes('libphonenumber')) return 'country-data'
          if (id.includes('react-day-picker') || id.includes('date-fns')) return 'date-picker'
          if (id.includes('zod') || id.includes('react-hook-form') || id.includes('@hookform')) return 'forms'
          if (id.includes('@dnd-kit')) return 'dnd'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n'
          if (id.includes('@radix-ui')) return 'radix'
          if (id.includes('react-dom') || id.includes('/react/')) return 'react'
          return 'vendor'
        },
      },
    },
    // country-atlas + libphonenumber are intentionally isolated in the
    // 'country-data' manual chunk (only loaded when Add Employee dialog opens).
    // Raise the threshold to avoid false-alarm noise on this known-large chunk.
    chunkSizeWarningLimit: 2000,
  },
})
