import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // wrangler pages dev --proxy 5173 経由でアクセスするため
    // /api/* は wrangler (port 8788) が Pages Functions として処理する
    port: 5173,
  },
})
