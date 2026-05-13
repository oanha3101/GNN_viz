import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    include: [
      'src/**/*.test.js',
      'src/**/*.test.jsx',
      'src/**/*.spec.js',
      'src/**/*.spec.jsx',
    ],
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      'playwright.config.*',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('plotly.js/lib') || id.includes('react-plotly.js/factory')) {
            return 'plotly'
          }
          if (id.includes('react-force-graph') || id.includes('graphology')) {
            return 'graphViz'
          }
          if (id.includes('xlsx')) {
            return 'dataTools'
          }
          if (id.includes('recharts')) {
            return 'charts'
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router') || id.includes('node_modules/zustand') || id.includes('node_modules/framer-motion') || id.includes('node_modules/lucide-react')) {
            return 'vendor'
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:8000',
      },
    },
  },
})
