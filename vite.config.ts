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
        // App roda offline: cacheia o shell. O OpenCV (10 MB), os modelos do
        // PaddleOCR (~30 MB) e o WASM do ONNX Runtime ficam FORA do pré-cache
        // para o app instalar/atualizar rápido; são cacheados sob demanda na
        // 1ª foto (runtimeCaching abaixo).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/opencv/**', '**/ocr/**', '**/ort/**', '**/*.wasm'],
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
            // Modelos de relatório (xlsx): usa cache mas revalida em segundo
            // plano — o financeiro pode atualizar o modelo no servidor
            urlPattern: /\/templates\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'report-templates',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Modelos do PaddleOCR + runtime WASM do ONNX: cacheia no 1º OCR
            urlPattern: /\/(ocr|ort)\/|\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-local',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 180 },
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
