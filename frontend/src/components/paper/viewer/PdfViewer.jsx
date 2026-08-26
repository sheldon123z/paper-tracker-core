import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { Button } from '../../ui'
import useStore from '../../../store'

// Bundle the worker with the app so local/offline viewing does not depend on a CDN.
// The version query invalidates responses cached before the gateway served .mjs
// with the JavaScript MIME type. Restarting containers cannot clear that cache.
const pdfWorkerUrl = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
)
pdfWorkerUrl.searchParams.set('v', 'mjs-mime-v1')
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl.toString()

// Attachment endpoints are protected by httpOnly auth cookies and run on the
// backend port in local development. PDF.js defaults to omitting credentials
// for that cross-origin request unless this is enabled explicitly.
const pdfAssetRoot = `${import.meta.env.BASE_URL}pdfjs`
const PDF_DOCUMENT_OPTIONS = {
  withCredentials: true,
  cMapUrl: `${pdfAssetRoot}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${pdfAssetRoot}/standard_fonts/`,
  wasmUrl: `${pdfAssetRoot}/wasm/`,
}

export default function PdfViewer({ fileUrl, onSelectionChange }) {
  const [numPages, setNumPages] = useState(null)
  const [scale, setScale] = useState(1)
  const [fitWidth, setFitWidth] = useState(560)
  const [pageRenderErrors, setPageRenderErrors] = useState({})
  const pagesRef = useRef(null)

  // Read selection from Zustand (persists across clicks outside PDF)
  const pdfSelectedText = useStore((s) => s.pdfSelectedText)
  const clearPdfSelection = useStore((s) => s.clearPdfSelection)

  const onDocumentLoadSuccess = useCallback(({ numPages: n }) => {
    setNumPages(n)
    setPageRenderErrors({})
  }, [])

  const handlePageRenderError = useCallback((pageNumber) => {
    setPageRenderErrors((current) => ({ ...current, [pageNumber]: true }))
  }, [])

  const handlePageRenderSuccess = useCallback((pageNumber) => {
    setPageRenderErrors((current) => {
      if (!current[pageNumber]) return current
      const next = { ...current }
      delete next[pageNumber]
      return next
    })
  }, [])

  useEffect(() => {
    const pages = pagesRef.current
    if (!pages) return undefined

    const updateFitWidth = () => {
      // Keep a small gutter around the page and never pass an invalid width to PDF.js.
      setFitWidth(Math.max(240, Math.floor(pages.clientWidth - 32)))
    }
    updateFitWidth()
    const observer = new ResizeObserver(updateFitWidth)
    observer.observe(pages)
    return () => observer.disconnect()
  }, [])

  // KEY FIX: Only update selection when user selects NEW text.
  // NEVER clear on empty selection — user might just be scrolling or clicking.
  // Clear only via explicit "清除" button.
  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()

    // Only act when there IS a meaningful new selection
    if (!text || text.length < 3) return

    // Find page number by traversing up from selection anchor node
    let node = selection.anchorNode
    while (node && node !== pagesRef.current) {
      if (node.dataset?.pageNumber) break
      node = node.parentElement
    }
    const page = node?.dataset?.pageNumber ? parseInt(node.dataset.pageNumber) : null

    // Cap at 2000 chars
    const capped = text.slice(0, 2000)
    onSelectionChange?.(capped, page)
  }, [onSelectionChange])

  const handleClearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    onSelectionChange?.(null, null)
    clearPdfSelection()
  }, [onSelectionChange, clearPdfSelection])

  return (
    <div className="pdf-viewer">
      {/* Toolbar */}
      <div className="pdf-toolbar">
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}>
          -
        </Button>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {Math.round(scale * 100)}%
        </span>
        <Button size="sm" variant="ghost" onClick={() => setScale((s) => Math.min(3, s + 0.2))}>
          +
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setScale(1)}>
          适合宽度
        </Button>
        {numPages && (
          <span className="text-xs ml-2" style={{ color: 'var(--text-secondary)' }}>
            {numPages} 页
          </span>
        )}
      </div>

      {/* Pages */}
      <div className="pdf-pages" ref={pagesRef} onMouseUp={handleMouseUp}>
        <Document
          file={fileUrl}
          options={PDF_DOCUMENT_OPTIONS}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center py-12">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                PDF 加载中...
              </span>
            </div>
          }
          error={
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-red-500">PDF 加载失败</span>
            </div>
          }
        >
          {numPages &&
            Array.from({ length: numPages }, (_, i) => (
              <Fragment key={i + 1}>
                <Page
                  pageNumber={i + 1}
                  width={fitWidth}
                  scale={scale}
                  className="pdf-page"
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  onRenderError={() => handlePageRenderError(i + 1)}
                  onRenderSuccess={() => handlePageRenderSuccess(i + 1)}
                />
                {pageRenderErrors[i + 1] && (
                  <div className="text-sm text-red-500 py-3 text-center" role="alert">
                    第 {i + 1} 页渲染失败，请刷新页面后重试
                  </div>
                )}
              </Fragment>
            ))}
        </Document>
      </div>

      {/* Selection indicator — reads from Zustand to persist across clicks */}
      {pdfSelectedText && (
        <div className="pdf-selection-indicator">
          <span className="text-xs" style={{ color: 'var(--accent)' }}>
            已选中 {pdfSelectedText.length} 字
          </span>
          <button
            onClick={handleClearSelection}
            className="text-xs px-2 py-0.5 rounded transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            清除
          </button>
        </div>
      )}
    </div>
  )
}
