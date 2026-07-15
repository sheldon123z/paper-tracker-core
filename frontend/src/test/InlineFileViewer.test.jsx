import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  defaults: { baseURL: 'http://localhost:5002' },
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('../api', () => ({ default: apiMock }))
vi.mock('../components/paper/viewer/PdfViewer', () => ({
  default: () => <div data-testid="pdf-viewer" />,
}))
vi.mock('../components/paper/viewer/MarkdownViewer', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/DocxViewer', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/XlsxViewer', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/ParseButton', () => ({ default: () => null }))

import InlineFileViewer from '../components/paper/viewer/InlineFileViewer'

const pdfFile = {
  id: 7,
  filename: 'Inter-GPS形式语言解几何题.pdf',
  file_type: 'pdf',
  file_size: 1153434,
}

describe('InlineFileViewer document tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get.mockResolvedValue({ data: new Blob(['pdf']) })
    apiMock.delete.mockResolvedValue({ data: { detail: '文件已删除' } })
    URL.createObjectURL = vi.fn(() => 'blob:pdf-download')
    URL.revokeObjectURL = vi.fn()
  })

  it('opens PDF download and delete actions from the tab context menu', () => {
    render(
      <InlineFileViewer
        paperId={42}
        files={[pdfFile]}
        onFilesChange={vi.fn()}
        onClose={vi.fn()}
        initialFileId={7}
      />,
    )

    expect(screen.getByRole('tab')).toHaveTextContent(pdfFile.filename)
    fireEvent.contextMenu(screen.getByRole('tab'), { clientX: 120, clientY: 80 })

    expect(screen.getByRole('menuitem', { name: '下载' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '删除' })).toBeInTheDocument()
  })

  it('downloads and deletes the selected PDF through protected attachment APIs', async () => {
    const onFilesChange = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <InlineFileViewer
        paperId={42}
        files={[pdfFile]}
        onFilesChange={onFilesChange}
        onClose={vi.fn()}
        initialFileId={7}
      />,
    )

    fireEvent.contextMenu(screen.getByRole('tab'), { clientX: 120, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: '下载' }))
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith(
      '/api/papers/42/files/7/download',
      { responseType: 'blob' },
    ))

    fireEvent.contextMenu(screen.getByRole('tab'), { clientX: 120, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/api/papers/42/files/7'))
    expect(onFilesChange).toHaveBeenCalledOnce()
    expect(onFilesChange.mock.calls[0][0]([pdfFile])).toEqual([])
  })
})
