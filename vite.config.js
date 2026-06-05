import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from "@cloudflare/vite-plugin"
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

function getGitRevision() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

const buildTime = new Date().toISOString()
const gitRevision = getGitRevision()
const buildId = `${gitRevision}-${buildTime.replace(/[-:TZ.]/g, '').slice(0, 14)}`

// @cloudflare/vite-plugin が
// - dist/ の静的アセットを ASSETS バインディングに自動接続
// - worker/index.js を Workers ランタイム上で動かす
// これらを vite dev / vite build 時に一体で扱う
export default defineConfig({
  define: {
    __NPBINFO_BUILD_ID__: JSON.stringify(buildId),
    __NPBINFO_BUILD_TIME__: JSON.stringify(buildTime),
    __NPBINFO_GIT_REVISION__: JSON.stringify(gitRevision),
  },
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
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && url.pathname !== '/api/debug',
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
