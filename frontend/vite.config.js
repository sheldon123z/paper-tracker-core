/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { replaceExternalFontUrls } from './vite/offlineAssets.js'

export default defineConfig({
  plugins: [
    {
      name: 'copilotkit-offline-fonts',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('@copilotkit/web-inspector')) return null
        const transformed = replaceExternalFontUrls(code)
        return transformed === code ? null : { code: transformed, map: null }
      },
    },
    {
      name: 'copilotkit-v2-precompiled-css',
      enforce: 'pre',
      load(id) {
        // CopilotKit v2 ships Tailwind v4 output and also imports it as a side
        // effect. App.jsx loads the same file with ?raw so this Tailwind v3
        // project can inject the already-compiled CSS without reprocessing it.
        if (
          id.includes('@copilotkit/react-core/dist/v2/index.css') &&
          !id.includes('?raw')
        ) {
          return ''
        }
        return null
      },
    },
    react(),
    nodePolyfills({
      include: ['stream', 'http', 'https', 'url', 'zlib', 'buffer', 'util'],
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          copilot: ['@copilotkit/react-core'],
          charts: ['recharts'],
          pdf: ['react-pdf'],
        },
      },
    },
  },
  server: {
    port: 3457,
    host: '0.0.0.0',
    proxy: {
      '/api/copilotkit': {
        target: 'http://localhost:4100',
        changeOrigin: true,
      },
    },
    fs: {
      allow: ['..'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    exclude: ['node_modules', 'dist'],
  },
})
