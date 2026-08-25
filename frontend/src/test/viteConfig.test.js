import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { DEV_API_PROXY } from '../../vite/devProxy'
import { replaceExternalFontUrls } from '../../vite/offlineAssets'

const FRONTEND_ROOT = process.cwd()

function loadPreviewProxyFromViteConfig() {
  const inspectConfig = `
    const configModule = await import('./vite.config.js')
    const exportedConfig = configModule.default
    const config = typeof exportedConfig === 'function'
      ? await exportedConfig({
          command: 'serve',
          mode: 'production',
          isSsrBuild: false,
          isPreview: true,
        })
      : exportedConfig
    process.stdout.write(JSON.stringify(config.preview?.proxy ?? null))
  `

  const output = execFileSync(
    process.execPath,
    ['--input-type=module', '--eval', inspectConfig],
    {
      cwd: FRONTEND_ROOT,
      encoding: 'utf8',
    },
  )

  return JSON.parse(output)
}

describe('offline Vite asset sanitization', () => {
  it('replaces Copilot inspector Google Fonts URLs with an inline stylesheet', () => {
    const source = `
      @import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans&display=swap");
      link.href = "https://fonts.googleapis.com/css2?family=Spline+Sans+Mono&display=swap";
    `
    const transformed = replaceExternalFontUrls(source)

    expect(transformed).not.toContain('fonts.googleapis.com')
    expect(transformed.match(/data:text\/css,/g)).toHaveLength(2)
  })
})

describe('Vite development API proxies', () => {
  it('routes Copilot before the general backend API proxy', () => {
    const proxyEntries = Object.entries(DEV_API_PROXY)

    expect(proxyEntries.map(([route]) => route)).toEqual([
      '/api/copilotkit',
      '/api',
    ])
    expect(DEV_API_PROXY['/api/copilotkit'].target).toBe(
      'http://localhost:4100',
    )
    expect(DEV_API_PROXY['/api'].target).toBe('http://localhost:5002')
  })

  it('wires the ordered local API proxies into production preview', () => {
    const previewProxy = loadPreviewProxyFromViteConfig()

    expect(previewProxy).not.toBeNull()
    expect(Object.keys(previewProxy)).toEqual(['/api/copilotkit', '/api'])
    expect(previewProxy['/api/copilotkit'].target).toBe(
      'http://localhost:4100',
    )
    expect(previewProxy['/api'].target).toBe('http://localhost:5002')
  })
})
