import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          plotly: ['react-plotly.js', 'plotly.js'],
          graphViz: ['react-force-graph-2d', 'graphology', 'graphology-layout-forceatlas2'],
          dataTools: ['xlsx'],
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand', 'framer-motion', 'lucide-react'],
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
