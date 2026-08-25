import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  defaults: { baseURL: 'http://localhost:5002' },
  delete: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  post: vi.fn(),
}))
const addToastMock = vi.hoisted(() => vi.fn())

vi.mock('../api', () => ({ default: apiMock }))
vi.mock('../components/ui/useToast', () => ({
  default: () => ({ addToast: addToastMock }),
}))
vi.mock('../components/paper/viewer/PdfViewer', () => ({
  default: () => <div data-testid="pdf-viewer" />,
}))
vi.mock('../components/paper/viewer/MarkdownViewer', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/DocxViewer', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/XlsxViewer', () => ({ default: () => null }))
vi.mock('../components/paper/viewer/ParseButton', () => ({ default: () => null }))

import InlineFileViewer from '../components/paper/viewer/InlineFileViewer'
import useStore from '../store'

const pdfFile = {
  id: 7,
  filename: 'Inter-GPS形式语言解几何题.pdf',
  file_type: 'pdf',
  file_size: 1153434,
}

describe('InlineFileViewer document tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.delete.mockResolvedValue({ data: { detail: '文件已删除' } })
    apiMock.head.mockResolvedValue({ headers: { 'content-type': 'application/pdf' } })
    useStore.setState({ pdfActiveFileId: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows an accessible PDF original export button only for the active PDF', () => {
    const markdownFile = {
      id: 8,
      filename: 'notes.md',
      file_type: 'markdown',
      file_size: 512,
    }
    render(
      <InlineFileViewer
        paperId={42}
        files={[pdfFile, markdownFile]}
        onFilesChange={vi.fn()}
        onClose={vi.fn()}
        initialFileId={7}
      />,
    )

    expect(screen.getByRole('button', { name: '导出 PDF 原件' })).toBeEnabled()
    expect(useStore.getState().pdfActiveFileId).toBe(7)
    fireEvent.click(screen.getByRole('tab', { name: /notes\.md/ }))

    expect(screen.queryByRole('button', { name: '导出 PDF 原件' })).not.toBeInTheDocument()
    expect(useStore.getState().pdfActiveFileId).toBeNull()
  })

  it('exports the active PDF from the keyboard with loading and success feedback', async () => {
    const user = userEvent.setup()
    const initiatedDownloads = []
    let resolveHead
    apiMock.head.mockReturnValue(new Promise((resolve) => { resolveHead = resolve }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      initiatedDownloads.push({
        href: this.getAttribute('href'),
        download: this.hasAttribute('download'),
      })
    })

    render(
      <InlineFileViewer
        paperId={42}
        files={[pdfFile]}
        onFilesChange={vi.fn()}
        onClose={vi.fn()}
        initialFileId={7}
      />,
    )

    const exportButton = screen.getByRole('button', { name: '导出 PDF 原件' })
    exportButton.focus()
    expect(exportButton).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: '正在校验 PDF...' })).toBeDisabled()
    expect(initiatedDownloads).toEqual([])
    expect(apiMock.head).toHaveBeenCalledWith('/api/papers/42/files/7/download')

    resolveHead({ headers: { 'content-type': 'application/pdf' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '导出 PDF 原件' })).toBeEnabled()
    })
    expect(initiatedDownloads).toEqual([{
      href: '/api/papers/42/files/7/download',
      download: true,
    }])
    expect(addToastMock).toHaveBeenCalledWith({
      type: 'success',
      message: 'PDF 原件下载已开始',
    })
  })

  it('restores the export button and shows an error toast when download initiation fails', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <InlineFileViewer
        paperId={42}
        files={[pdfFile]}
        onFilesChange={vi.fn()}
        onClose={vi.fn()}
        initialFileId={7}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '导出 PDF 原件' }))

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith({
        type: 'error',
        message: 'PDF 原件导出失败',
      })
    })
    expect(screen.getByRole('button', { name: '导出 PDF 原件' })).toBeEnabled()
  })

  it('does not start a browser download when the authenticated HEAD check fails', async () => {
    apiMock.head.mockRejectedValue(new Error('HTTP 401'))
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <InlineFileViewer
        paperId={42}
        files={[pdfFile]}
        onFilesChange={vi.fn()}
        onClose={vi.fn()}
        initialFileId={7}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '导出 PDF 原件' }))

    await waitFor(() => expect(screen.getByRole('button', { name: '导出 PDF 原件' })).toBeEnabled())
    expect(clickSpy).not.toHaveBeenCalled()
    expect(addToastMock).toHaveBeenCalledWith({
      type: 'error',
      message: 'PDF 原件导出失败',
    })
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
    const initiatedDownloads = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      initiatedDownloads.push(this.getAttribute('href'))
    })
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
    await waitFor(() => {
      expect(initiatedDownloads).toEqual(['/api/papers/42/files/7/download'])
    })
    expect(apiMock.head).toHaveBeenCalledWith('/api/papers/42/files/7/download')

    fireEvent.contextMenu(screen.getByRole('tab'), { clientX: 120, clientY: 80 })
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))
    await waitFor(() => expect(apiMock.delete).toHaveBeenCalledWith('/api/papers/42/files/7'))
    expect(onFilesChange).toHaveBeenCalledOnce()
    expect(onFilesChange.mock.calls[0][0]([pdfFile])).toEqual([])
  })
})
