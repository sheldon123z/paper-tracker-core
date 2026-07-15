import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PapersPage from '../pages/PapersPage'
import { PAPER_TAGS_UPDATED_EVENT } from '../paperEvents'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}))
const viewportMock = vi.hoisted(() => ({ isMobile: true }))

vi.mock('../api', () => ({ default: apiMock }))
vi.mock('../hooks/useIsMobile', () => ({ default: () => viewportMock.isMobile }))
vi.mock('../store', () => ({ default: () => ({ openTab: vi.fn() }) }))
vi.mock('../components/paper/FilterPanel', () => ({ default: () => null }))
vi.mock('../components/paper/SearchBar', () => ({ default: () => null }))
vi.mock('../components/paper/ExpandedPaperFiles', () => ({ default: () => null }))

describe('PapersPage batch actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    viewportMock.isMobile = true
    apiMock.get.mockImplementation((url) => Promise.resolve(url === '/api/tags'
      ? { data: [{ id: 1, name: '大语言模型', color: '#ef4444' }, { id: 2, name: '检索增强', color: '#22c55e' }] }
      : {
          data: {
            items: [
              {
                id: 42,
                title: 'A Paper to Delete',
                authors: 'Alice Example',
                relevance: 8,
                published_date: '2026-07-10T00:00:00Z',
                is_read: false,
                is_favorited: false,
                tags: '大语言模型, 检索增强',
              },
            ],
            meta: { total: 1, page: 1, size: 20 },
          },
        }))
    apiMock.post.mockResolvedValue({ data: { affected: 1 } })
  })

  it('shows paper tags from the same tags field in the mobile list', async () => {
    render(<PapersPage />)

    expect(await screen.findByText('大语言模型')).toBeInTheDocument()
    expect(screen.getByText('检索增强')).toBeInTheDocument()
    expect(await screen.findByTestId('tag-color-大语言模型')).toHaveStyle({ backgroundColor: '#ef4444' })
  })

  it('adds a tags column to the desktop paper table', async () => {
    viewportMock.isMobile = false
    render(<PapersPage />)

    expect(await screen.findByRole('columnheader', { name: /标签/ })).toBeInTheDocument()
    expect(screen.getByText('大语言模型')).toBeInTheDocument()
    expect(screen.getByText('检索增强')).toBeInTheDocument()
  })

  it('uses compact default widths so every desktop field remains visible', async () => {
    viewportMock.isMobile = false
    render(<PapersPage />)

    const expectedWidths = {
      标题: '240px',
      作者: '130px',
      分类: '80px',
      库范围: '82px',
      标签: '110px',
      来源: '62px',
      相关度: '62px',
      状态: '62px',
      日期: '88px',
    }
    for (const [name, width] of Object.entries(expectedWidths)) {
      expect(await screen.findByRole('columnheader', { name: new RegExp(name) })).toHaveStyle({ width })
    }
  })

  it('switches the server-side publication date order to ascending', async () => {
    viewportMock.isMobile = false
    render(<PapersPage />)
    await screen.findByText('A Paper to Delete')

    fireEvent.click(screen.getByRole('button', { name: /日期，当前降序，切换为升序/ }))

    await waitFor(() => {
      const paperRequests = apiMock.get.mock.calls.filter(([url]) => url === '/api/papers')
      expect(paperRequests.some(([, config]) => config?.params?.sort_dir === 'asc')).toBe(true)
    })
  })

  it('updates a paper row immediately after its detail tab saves tags', async () => {
    render(<PapersPage />)
    expect(await screen.findByText('大语言模型')).toBeInTheDocument()

    window.dispatchEvent(new CustomEvent(PAPER_TAGS_UPDATED_EVENT, {
      detail: {
        paperId: 42,
        tags: '新标签',
        tagRecords: [{ id: 3, name: '新标签', color: '#8b5cf6' }],
      },
    }))

    expect(await screen.findByText('新标签')).toBeInTheDocument()
    expect(screen.queryByText('大语言模型')).not.toBeInTheDocument()
    expect(screen.getByTestId('tag-color-新标签')).toHaveStyle({ backgroundColor: '#8b5cf6' })
  })

  it('confirms and submits deletion for selected papers', async () => {
    render(<PapersPage />)

    expect(await screen.findByText('A Paper to Delete')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    expect(screen.getByText(/确定删除已选择的 1 篇论文/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith('/api/papers/batch', {
        paper_ids: [42],
        action: 'delete',
      })
    })
  })

  it('replaces manual creation with bilingual directory PDF review and import', async () => {
    apiMock.post.mockImplementation((url, body) => {
      if (url === '/api/papers/import/pdf/analyze') {
        const filename = body.get('file').name
        return Promise.resolve({
          data: {
            filename,
            content_hash: filename.startsWith('中文') ? 'a'.repeat(64) : 'b'.repeat(64),
            language: 'zh',
            metadata: {
              title: filename.replace('.pdf', ''),
              authors: '张三, 李四',
              abstract: '这是原文摘要。',
              ai_summary: null,
              published_date: '2026-07-14T00:00:00Z',
              category: 'LLM',
              doi: null,
              arxiv_id: null,
            },
            confidence: { title: 'high', authors: 'medium', abstract: 'high' },
            warnings: [],
            duplicate: null,
          },
        })
      }
      if (url === '/api/papers/import/pdf/commit') {
        return Promise.resolve({ data: { action: 'created', attachment_created: true, paper: { id: 99 } } })
      }
      return Promise.resolve({ data: { affected: 1 } })
    })

    render(<PapersPage />)
    await screen.findByText('A Paper to Delete')
    fireEvent.click(screen.getByRole('button', { name: '批量导入 PDF' }))

    expect(screen.getByRole('heading', { name: '批量导入 PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择目录' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择 PDF 文件' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存论文' })).not.toBeInTheDocument()

    const pdf = new File(['%PDF-test'], '中文论文.pdf', { type: 'application/pdf' })
    Object.defineProperty(pdf, 'webkitRelativePath', { value: '论文目录/中文论文.pdf' })
    const secondPdf = new File(['%PDF-test-2'], 'English Paper.pdf', { type: 'application/pdf' })
    Object.defineProperty(secondPdf, 'webkitRelativePath', { value: '论文目录/English Paper.pdf' })
    const ignored = new File(['notes'], '说明.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText('选择包含 PDF 论文的目录'), { target: { files: [pdf, secondPdf, ignored] } })

    expect(screen.getAllByText(/已选择 2 个 PDF，忽略 1 个非 PDF 文件/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '开始识别' }))
    await waitFor(() => expect(screen.getAllByText('待复核')).toHaveLength(2))
    expect(screen.getAllByText('中文')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: '确认导入 2 篇' }))
    await waitFor(() => {
      expect(apiMock.post.mock.calls.filter(([url]) => url === '/api/papers/import/pdf/commit')).toHaveLength(2)
    })
    expect(await screen.findAllByText('已新建论文并保存 PDF。')).toHaveLength(2)
  })

  it('supports selecting several individual PDF files without choosing a directory', async () => {
    render(<PapersPage />)
    await screen.findByText('A Paper to Delete')
    fireEvent.click(screen.getByRole('button', { name: '批量导入 PDF' }))

    const firstPdf = new File(['%PDF-first'], 'First Paper.pdf', { type: 'application/pdf' })
    const secondPdf = new File(['%PDF-second'], 'Second Paper.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('选择一个或多个 PDF 论文文件'), {
      target: { files: [firstPdf, secondPdf] },
    })

    expect(screen.getAllByText(/已选择 2 个 PDF/).length).toBeGreaterThan(0)
    expect(screen.getByText('First Paper.pdf')).toBeInTheDocument()
    expect(screen.getByText('Second Paper.pdf')).toBeInTheDocument()
  })

  it('allows recognized papers to be imported after the remaining analysis is aborted', async () => {
    let analyzeCalls = 0
    apiMock.post.mockImplementation((url, body, config) => {
      if (url === '/api/papers/import/pdf/commit') {
        return Promise.resolve({ data: { action: 'created', attachment_created: true, paper: { id: 99 } } })
      }
      if (url !== '/api/papers/import/pdf/analyze') return Promise.resolve({ data: { affected: 1 } })
      analyzeCalls += 1
      if (analyzeCalls === 1) {
        return Promise.resolve({
          data: {
            filename: body.get('file').name,
            content_hash: 'a'.repeat(64),
            language: 'en',
            metadata: { title: 'First Paper', authors: 'Alice', published_date: '2026-07-14T00:00:00Z' },
            confidence: { title: 'high' },
            warnings: [],
            duplicate: null,
          },
        })
      }
      return new Promise((_, reject) => {
        config.signal.addEventListener('abort', () => {
          const error = new Error('canceled')
          error.code = 'ERR_CANCELED'
          reject(error)
        }, { once: true })
      })
    })

    render(<PapersPage />)
    await screen.findByText('A Paper to Delete')
    fireEvent.click(screen.getByRole('button', { name: '批量导入 PDF' }))

    const firstPdf = new File(['%PDF-first'], 'First Paper.pdf', { type: 'application/pdf' })
    const secondPdf = new File(['%PDF-second'], 'Second Paper.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('选择包含 PDF 论文的目录'), {
      target: { files: [firstPdf, secondPdf] },
    })
    fireEvent.click(screen.getByRole('button', { name: '开始识别' }))

    const abortButton = await screen.findByRole('button', { name: '中止识别' })
    await waitFor(() => {
      expect(apiMock.post.mock.calls.filter(([url]) => url === '/api/papers/import/pdf/analyze')).toHaveLength(2)
    })
    fireEvent.click(abortButton)

    const confirmButton = await screen.findByRole('button', { name: '确认导入 1 篇' })
    expect(screen.getByRole('status')).toHaveTextContent('可确认导入 1 篇，已放弃 1 篇')
    expect(screen.getByText('已放弃')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始识别' })).not.toBeInTheDocument()
    await waitFor(() => expect(confirmButton).toBeEnabled())

    fireEvent.click(confirmButton)
    await waitFor(() => {
      expect(apiMock.post.mock.calls.filter(([url]) => url === '/api/papers/import/pdf/commit')).toHaveLength(1)
    })
    const committedFile = apiMock.post.mock.calls.find(([url]) => url === '/api/papers/import/pdf/commit')[1].get('file')
    expect(committedFile.name).toBe('First Paper.pdf')
  })
})
