import { describe, expect, it } from 'vitest'
import { DEV_API_PROXY } from '../../vite/devProxy'
import { replaceExternalFontUrls } from '../../vite/offlineAssets'

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
})
