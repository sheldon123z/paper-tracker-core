import { describe, expect, it } from 'vitest'
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
