import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TagsPage from '../pages/TagsPage'

const apiMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}))

vi.mock('../api', () => ({ default: apiMock }))

describe('TagsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.get
      .mockResolvedValueOnce({
        data: [{ id: 7, name: '旧标签', color: '#e8f4f8', paper_count: 2 }],
      })
      .mockResolvedValueOnce({
        data: [{ id: 7, name: '新标签', color: '#fee2e2', paper_count: 2 }],
      })
    apiMock.patch.mockResolvedValue({
      data: { id: 7, name: '新标签', color: '#fee2e2', paper_count: 2 },
    })
  })

  it('updates an existing tag with the PATCH endpoint', async () => {
    render(<TagsPage />)

    await screen.findByText('旧标签')
    fireEvent.click(screen.getByRole('button', { name: '重命名' }))

    const nameInput = screen.getByDisplayValue('旧标签')
    const editRow = nameInput.closest('div')
    fireEvent.change(nameInput, { target: { value: '  新标签  ' } })
    fireEvent.click(within(editRow).getByRole('button', { name: '选择颜色 #fee2e2' }))
    fireEvent.click(within(editRow).getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(apiMock.patch).toHaveBeenCalledWith('/api/tags/7', {
        name: '新标签',
        color: '#fee2e2',
      })
    })
    expect(await screen.findByText('新标签')).toBeInTheDocument()
    expect(apiMock.get).toHaveBeenCalledTimes(2)
  })
})
