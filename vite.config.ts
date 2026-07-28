import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 3847}`

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: process.env.VITE_HOST || '127.0.0.1',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
