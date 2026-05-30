import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from "@cloudflare/vite-plugin"
import { VitePWA } from 'vite-plugin-pwa'

// @cloudflare/vite-plugin が
// - dist/ の静的アセットを ASSETS バインディングに自動接続
// - worker/index.js を Workers ランタイム上で動かす
// これらを vite dev / vite build 時に一体で扱う
export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'npbinfo - プロ野球情報',
        short_name: 'npbinfo',
        description: 'NPB の順位表・選手成績・試合日程・球場情報',
        theme_color: '#0a1628',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'npbinfo-api-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
