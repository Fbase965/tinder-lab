import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // /api/* are Vercel functions; in dev, use the deployed ones
  server: { proxy: { '/api': { target: 'https://faiscauni.vercel.app', changeOrigin: true } } },
})
