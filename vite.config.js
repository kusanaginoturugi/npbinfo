import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    // wrangler pages dev --proxy 5173 経由でアクセスするため
    // /api/* は wrangler (port 8788) が Pages Functions として処理する
    port: 5173,
  },
})