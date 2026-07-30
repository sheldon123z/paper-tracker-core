const GOOGLE_FONTS_URL = /https:\/\/fonts\.googleapis\.com\/css2\?[^"'`)\s]+/g

export function replaceExternalFontUrls(code) {
  return code.replace(GOOGLE_FONTS_URL, 'data:text/css,')
}
