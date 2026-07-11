/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
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
          copilot: ['@copilotkit/react-core', '@copilotkit/react-ui'],
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
