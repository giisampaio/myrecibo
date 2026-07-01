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
      // 'prompt': o app avisa "Nova versão disponível" e o usuário atualiza
      // na hora (sem ficar preso em cache antigo nem trocar de versão no meio do uso)
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MyRecibo',
        short_name: 'MyRecibo',
        description: 'Registro de despesas e recibos para tripulantes',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App roda offline: cacheia o shell. O OpenCV (10 MB) fica FORA do
        // pré-cache para o app instalar/atualizar rápido; ele é cacheado sob
        // demanda na 1ª foto (runtimeCaching abaixo).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,traineddata,gz}'],
        globIgnores: ['**/opencv/**'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // OpenCV local: cacheia na 1ª foto -> offline e instantâneo depois
            urlPattern: /\/opencv\/opencv\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'opencv-local',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Assets do Tesseract (OCR) vindos de CDN: cacheia após o 1º uso
            urlPattern:
              /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|tessdata\.projectnaptha\.com|docs\.opencv\.org)\//,
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
