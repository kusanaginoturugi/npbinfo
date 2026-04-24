import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from "@cloudflare/vite-plugin"

// @cloudflare/vite-plugin が
// - dist/ の静的アセットを ASSETS バインディングに自動接続
// - worker/index.js を Workers ランタイム上で動かす
// これらを vite dev / vite build 時に一体で扱う
export default defineConfig({
  plugins: [react(), cloudflare()],
})