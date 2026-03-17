import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Load .env from repo root so one .env works for docker + frontend dev
  envDir: '..',
  server: {
    // Proxy API to backends so the frontend uses same origin (no CORS) in dev
    proxy: {
      '/api/chat': { target: 'http://localhost:8000', changeOrigin: true },
      '/api/metrics': { target: 'http://localhost:8000', changeOrigin: true },
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
