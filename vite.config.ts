import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MyRecibo',
        short_name: 'MyRecibo',
        description: 'Registro de despesas e recibos para tripulantes',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App roda offline: cacheia o shell e os assets
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,traineddata,gz}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Assets pesados de CDN (OpenCV e Tesseract): cacheia após o 1º uso
        // online para que scanner e OCR funcionem offline depois.
        runtimeCaching: [
          {
            urlPattern:
              /^https:\/\/(docs\.opencv\.org|cdn\.jsdelivr\.net|unpkg\.com|tessdata\.projectnaptha\.com)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cv-ocr-cdn',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
