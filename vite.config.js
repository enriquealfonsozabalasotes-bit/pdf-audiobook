import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/pdf-audiobook/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,mjs}'], maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 },
      manifest: {
        name: 'Audiobooks',
        short_name: 'Audiobooks',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        theme_color: '#1f1a17',
        background_color: '#1f1a17',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: 'src/test/setup.js',
  },
})
