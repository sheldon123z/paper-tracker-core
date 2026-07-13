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
})
