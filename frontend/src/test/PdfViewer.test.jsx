import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reactPdfState = vi.hoisted(() => ({
  documentProps: null,
  pageProps: null,
  workerOptions: { workerSrc: '' },
}))

vi.mock('react-pdf', () => ({
  pdfjs: {
    GlobalWorkerOptions: reactPdfState.workerOptions,
  },
  Document: ({ children, ...props }) => {
    reactPdfState.documentProps = props
    return <div data-testid="pdf-document">{children}</div>
  },
  Page: (props) => {
    reactPdfState.pageProps = props
    return <div data-testid="pdf-page" />
  },
}))

import PdfViewer from '../components/paper/viewer/PdfViewer'

describe('PdfViewer', () => {
  beforeEach(() => {
    reactPdfState.documentProps = null
    reactPdfState.pageProps = null
  })

  it('uses the bundled PDF worker instead of an external CDN', () => {
    expect(reactPdfState.workerOptions.workerSrc).toContain('pdf.worker.min.mjs')
    expect(reactPdfState.workerOptions.workerSrc).not.toContain('unpkg.com')
  })

  it('loads protected attachment content with auth cookies', () => {
    const fileUrl = 'http://localhost:5002/api/papers/7/files/11/content'

    render(<PdfViewer fileUrl={fileUrl} />)

    expect(screen.getByTestId('pdf-document')).toBeInTheDocument()
    expect(reactPdfState.documentProps.file).toBe(fileUrl)
    expect(reactPdfState.documentProps.options).toEqual({ withCredentials: true })
  })

  it('fits pages to the viewer width by default and can restore fit after zooming', () => {
    render(<PdfViewer fileUrl="/paper.pdf" />)

    expect(screen.getByText('100%')).toBeInTheDocument()
    act(() => reactPdfState.documentProps.onLoadSuccess({ numPages: 1 }))
    expect(reactPdfState.pageProps.width).toBeGreaterThanOrEqual(240)
    expect(reactPdfState.pageProps.scale).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByText('120%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '适合宽度' }))
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})
