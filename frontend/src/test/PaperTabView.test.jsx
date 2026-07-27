import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}))

const storeState = vi.hoisted(() => ({
  tabs: [{ id: 42 }],
  selectedModelId: null,
}))

vi.mock('../api', () => ({ default: apiMock }))
vi.mock('../hooks/useIsMobile', () => ({ default: () => false }))
vi.mock('../store', () => ({ default: (selector) => selector(storeState) }))
vi.mock('../components/chat/AIChatPanel', () => ({
  default: ({ onClose }) => (
    <div data-testid="paper-assistant">
      <button type="button" onClick={onClose}>收起助手</button>
    </div>
  ),
}))
vi.mock('../components/paper/PaperTagSelector', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/InlineFileViewer', () => ({
  default: ({ onClose }) => (
    <div data-testid="inline-file-viewer">
      <button type="button" onClick={onClose}>收起原文</button>
    </div>
  ),
}))

import PaperTabView from '../components/paper/PaperTabView'

describe('PaperTabView desktop panels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get.mockImplementation((url) => {
      if (url === '/api/papers/42') {
        return Promise.resolve({
          data: {
            id: 42,
            title: 'Panel Test Paper',
            authors: 'Alice',
            abstract: 'Abstract',
            tags: [],
          },
        })
      }
      if (url === '/api/papers/42/files') {
        return Promise.resolve({
          data: [{ id: 7, filename: 'paper.pdf', file_type: 'pdf', file_size: 100 }],
        })
      }
      return Promise.resolve({ data: [] })
    })
  })

  it('independently collapses and restores the info, PDF, and assistant panels', async () => {
    render(<PaperTabView paperId={42} />)

    expect(await screen.findByText('Panel Test Paper')).toBeInTheDocument()
    expect(screen.getByTestId('paper-assistant')).toBeInTheDocument()

    const infoToggle = screen.getByRole('button', { name: /基础信息/ })
    const pdfToggle = screen.getByRole('button', { name: /PDF 原文/ })
    const assistantToggle = screen.getByRole('button', { name: /论文助手/ })

    expect(infoToggle).toHaveAttribute('aria-pressed', 'true')
    expect(pdfToggle).toHaveAttribute('aria-pressed', 'false')
    expect(assistantToggle).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(pdfToggle)
    expect(screen.getByTestId('inline-file-viewer')).toBeInTheDocument()
    expect(pdfToggle).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(infoToggle)
    expect(screen.queryByText('Panel Test Paper')).not.toBeInTheDocument()
    fireEvent.click(assistantToggle)
    expect(screen.queryByTestId('paper-assistant')).not.toBeInTheDocument()

    fireEvent.click(infoToggle)
    fireEvent.click(assistantToggle)
    expect(screen.getByText('Panel Test Paper')).toBeInTheDocument()
    expect(screen.getByTestId('paper-assistant')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '收起原文' }))
    expect(screen.queryByTestId('inline-file-viewer')).not.toBeInTheDocument()
    expect(pdfToggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('lets the assistant header collapse the assistant panel', async () => {
    render(<PaperTabView paperId={42} />)
    await screen.findByText('Panel Test Paper')

    fireEvent.click(screen.getByRole('button', { name: '收起助手' }))
    expect(screen.queryByTestId('paper-assistant')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /论文助手/ })).toHaveAttribute('aria-pressed', 'false')
  })
})
