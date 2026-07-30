import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginAmbientScene from '../components/auth/LoginAmbientScene'
import RecentActivityRenderer from '../components/copilot/tool-renderers/RecentActivityRenderer'
import Dashboard from '../pages/Dashboard'

const { apiGet } = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('../api', () => ({
  default: {
    get: apiGet,
  },
}))

vi.mock('@copilotkit/react-core/v2', () => ({
  defineToolCallRenderer: (renderer) => renderer,
}))

describe('offline interface', () => {
  beforeEach(() => {
    apiGet.mockReset()
  })

  it('uses local-library messaging on the login page', () => {
    render(<LoginAmbientScene />)

    expect(screen.getByText('本地文献')).toBeInTheDocument()
    expect(screen.getByText('离线管理')).toBeInTheDocument()
    expect(screen.queryByText(/RSS|订阅源|订阅信号/i)).not.toBeInTheDocument()
  })

  it('omits RSS activity returned by the recent-activity tool', () => {
    render(
      <RecentActivityRenderer
        label="近期活动"
        status="complete"
        result={{
          type: 'get_recent_activity',
          data: {
            days: 7,
            feed_activity: [
              {
                id: 1,
                name: 'Hidden RSS source',
                is_active: true,
                last_fetched: '2026-07-29T12:00:00',
              },
            ],
          },
        }}
      />,
    )

    expect(screen.queryByText(/RSS 源|Hidden RSS source/i)).not.toBeInTheDocument()
  })

  it('suppresses the RSS status tool call renderer', async () => {
    const { TOOL_CALL_RENDERERS } = await import('../components/copilot/ToolCallRenderer')

    expect(
      TOOL_CALL_RENDERERS[0].render({
        name: 'get_feed_status',
        args: {},
        status: 'complete',
        result: '{"type":"get_feed_status","data":[{"name":"Hidden RSS source"}]}',
      }),
    ).toBeNull()
  })

  it('does not request or display the RSS scheduler status on the dashboard', async () => {
    apiGet.mockImplementation((url) => {
      if (url === '/api/papers') return Promise.resolve({ data: { items: [] } })
      return Promise.resolve({ data: null })
    })

    render(<Dashboard />)

    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2))
    expect(apiGet.mock.calls.map(([url]) => url)).toEqual(['/api/stats', '/api/papers'])
    expect(screen.queryByText(/调度器/)).not.toBeInTheDocument()
  })
})
