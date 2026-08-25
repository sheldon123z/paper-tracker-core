/// <reference types="vitest" />
import { createReadStream } from 'node:fs'
import { cp, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { DEV_API_PROXY, LOCAL_PREVIEW_CONFIG } from './vite/devProxy.js'
import { replaceExternalFontUrls } from './vite/offlineAssets.js'

const FRONTEND_ROOT = fileURLToPath(new URL('.', import.meta.url))
const PDFJS_ROOT = resolve(FRONTEND_ROOT, 'node_modules/pdfjs-dist')
const PDFJS_ASSET_DIRECTORIES = ['cmaps', 'standard_fonts', 'wasm']
const PDFJS_DEV_CONTENT_TYPES = {
  '.bcmap': 'application/octet-stream',
  '.js': 'application/javascript',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

function pdfjsOfflineAssets() {
  return {
    name: 'pdfjs-offline-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', async (request, response, next) => {
        let relativePath
        try {
          relativePath = decodeURIComponent(
            new URL(request.url || '/', 'http://127.0.0.1').pathname,
          ).replace(/^\/+/, '')
        } catch {
          response.statusCode = 400
          response.end('Invalid PDF.js asset path')
          return
        }
        if (relativePath.startsWith('pdfjs/')) relativePath = relativePath.slice(6)
        if (!PDFJS_ASSET_DIRECTORIES.includes(relativePath.split('/')[0])) {
          next()
          return
        }

        const assetPath = resolve(PDFJS_ROOT, relativePath)
        const rootPrefix = `${PDFJS_ROOT}${sep}`
        if (!assetPath.startsWith(rootPrefix)) {
          response.statusCode = 403
          response.end('Forbidden PDF.js asset path')
          return
        }
        try {
          const asset = await stat(assetPath)
          if (!asset.isFile()) {
            next()
            return
          }
          response.statusCode = 200
          response.setHeader(
            'Content-Type',
            PDFJS_DEV_CONTENT_TYPES[extname(assetPath).toLowerCase()]
              || 'application/octet-stream',
          )
          createReadStream(assetPath).pipe(response)
        } catch (error) {
          if (error?.code === 'ENOENT') next()
          else next(error)
        }
      })
    },
    async writeBundle(outputOptions) {
      const outputRoot = resolve(FRONTEND_ROOT, outputOptions.dir || 'dist')
      await Promise.all(PDFJS_ASSET_DIRECTORIES.map((directory) => cp(
        resolve(PDFJS_ROOT, directory),
        resolve(outputRoot, 'pdfjs', directory),
        { recursive: true },
      )))
    },
  }
}

export default defineConfig({
  plugins: [
    pdfjsOfflineAssets(),
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
    proxy: DEV_API_PROXY,
    fs: {
      allow: ['..'],
    },
  },
  // Production builds use same-origin /api URLs. Keep the standalone preview
  // command useful by forwarding those routes to the same local services as
  // the development server. The Docker image serves dist/ through nginx, so
  // this preview-only setting does not affect the offline gateway.
  preview: LOCAL_PREVIEW_CONFIG,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    exclude: ['node_modules', 'dist'],
  },
})
