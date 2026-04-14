import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          plotly: ['react-plotly.js', 'plotly.js-dist-min'],
          vendor: ['react', 'react-dom', 'zustand', 'react-force-graph-2d', 'd3-force', 'framer-motion', 'recharts']
        }
      }
    }
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
