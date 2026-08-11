import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Vercel serves API routes and rewrites client routes to index.html.
  base: '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
