import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const storeState = vi.hoisted(() => ({
  setPdfSelection: vi.fn(),
  setPdfActiveFileId: vi.fn(),
}))

vi.mock('../config/runtime', () => ({
  RUNTIME_CAPABILITIES: {
    offlineMode: true,
    rssSubscriptions: false,
    cloudDocumentParsing: false,
    remoteLlmProviders: false,
  },
}))

vi.mock('../api', () => ({
  default: {
    defaults: { baseURL: '' },
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../store', () => ({
  default: (selector) => selector(storeState),
}))

vi.mock('../components/ui', () => ({
  AppIcon: ({ name }) => <span data-icon={name} />,
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
  useToast: () => ({ addToast: vi.fn() }),
}))

vi.mock('../components/paper/viewer/PdfViewer', () => ({
  default: ({ fileUrl }) => <div data-testid="local-pdf-viewer">{fileUrl}</div>,
}))
vi.mock('../components/paper/viewer/MarkdownViewer', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/DocxViewer', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/XlsxViewer', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/ParseButton', () => ({
  default: () => <button>智能解析 MinerU Doc2X</button>,
}))

import InlineFileViewer from '../components/paper/viewer/InlineFileViewer'

describe('offline document capabilities', () => {
  it('keeps local PDF viewing while hiding cloud parsing controls', () => {
    render(
      <InlineFileViewer
        paperId={42}
        files={[{
          id: 7,
          filename: 'local-paper.pdf',
          file_type: 'pdf',
          file_size: 2048,
        }]}
        onFilesChange={vi.fn()}
        onClose={vi.fn()}
        initialFileId={7}
      />,
    )

    expect(screen.getByTestId('local-pdf-viewer')).toHaveTextContent(
      '/api/papers/42/files/7/content',
    )
    expect(screen.queryByText(/智能解析|MinerU|Doc2X/i)).not.toBeInTheDocument()
  })
})
