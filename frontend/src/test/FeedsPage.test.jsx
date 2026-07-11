import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FeedRow, formatRelativeTime, parseApiTimestamp } from '../pages/FeedsPage'

const apiMock = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('../api', () => ({ default: apiMock }))

describe('FeedsPage fetch status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.post.mockResolvedValue({ data: { message: 'Feed triggered' } })
  })

  it('formats elapsed time from the supplied refresh clock', () => {
    const fetchedAt = Date.parse('2026-07-10T00:00:00Z')

    expect(formatRelativeTime(new Date(fetchedAt).toISOString(), fetchedAt + 30_000)).toBe('刚刚')
    expect(formatRelativeTime(new Date(fetchedAt).toISOString(), fetchedAt + 2 * 60_000)).toBe('2 分钟前')
  })

  it('treats legacy timestamps without a timezone as UTC', () => {
    const legacyTimestamp = '2026-07-10T11:00:00.000000'
    const fetchedAt = Date.parse('2026-07-10T11:00:00Z')

    expect(parseApiTimestamp(legacyTimestamp)).toBe(fetchedAt)
    expect(formatRelativeTime(legacyTimestamp, fetchedAt + 30_000)).toBe('刚刚')
  })

  it('reloads feed data after a manual fetch succeeds', async () => {
    const onFetched = vi.fn().mockResolvedValue(undefined)
    render(
      <FeedRow
        feed={{
          id: 7,
          name: 'IEEE TNNLS',
          url: 'https://example.com/feed.xml',
          source: 'rss',
          is_active: true,
          fetch_interval: 120,
          last_fetched: '2026-07-10T00:00:00Z',
        }}
        now={Date.parse('2026-07-10T00:05:00Z')}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onFetched={onFetched}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '立即抓取' }))

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith('/api/scheduler/trigger/7')
      expect(onFetched).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByText('已触发')).toBeInTheDocument()
  })

  it('allows clearing the hour input before saving a new value in seconds', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    render(
      <FeedRow
        feed={{
          id: 7,
          name: 'IEEE TNNLS',
          url: 'https://example.com/feed.xml',
          source: 'rss',
          is_active: true,
          fetch_interval: 3600,
        }}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const intervalInput = screen.getByLabelText('自动抓取间隔 (小时)')
    expect(intervalInput).toHaveValue(1)
    fireEvent.change(intervalInput, { target: { value: '' } })
    expect(intervalInput).toHaveValue(null)
    fireEvent.change(intervalInput, { target: { value: '3' } })
    expect(intervalInput).toHaveValue(3)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(7, expect.objectContaining({ fetch_interval: 10800 }))
    })
  })
})
