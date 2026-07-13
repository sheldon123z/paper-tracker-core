import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PapersPage from '../pages/PapersPage'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}))

vi.mock('../api', () => ({ default: apiMock }))
vi.mock('../hooks/useIsMobile', () => ({ default: () => true }))
vi.mock('../store', () => ({ default: () => ({ openTab: vi.fn() }) }))
vi.mock('../components/paper/FilterPanel', () => ({ default: () => null }))
vi.mock('../components/paper/SearchBar', () => ({ default: () => null }))
vi.mock('../components/paper/ExpandedPaperFiles', () => ({ default: () => null }))

describe('PapersPage batch actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get.mockResolvedValue({
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
          },
        ],
        meta: { total: 1, page: 1, size: 20 },
      },
    })
    apiMock.post.mockResolvedValue({ data: { affected: 1 } })
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
