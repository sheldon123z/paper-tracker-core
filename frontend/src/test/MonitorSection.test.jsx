import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MonitorSection from '../components/settings/MonitorSection'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  user: { role: 'user' },
}))

vi.mock('../api', () => ({
  default: { get: mocks.get },
}))

vi.mock('../store', () => ({
  default: (selector) => selector({ user: mocks.user }),
}))

vi.mock('../config/runtime', async (importOriginal) => ({
  ...await importOriginal(),
  RUNTIME_CAPABILITIES: {
    offlineMode: true,
    remoteLlmProviders: false,
  },
}))

describe('MonitorSection offline usage', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.user = { role: 'user' }
    mocks.get.mockImplementation((url) => {
      if (url === '/api/usage/summary') {
        return Promise.resolve({ data: { total_calls: 1, total_tokens: 100 } })
      }
      if (url === '/api/usage/by-model') {
        return Promise.resolve({ data: [] })
      }
      if (url === '/api/usage/timeline') {
        return Promise.resolve({ data: [] })
      }
      if (url === '/api/llm-configs/brief') {
        return Promise.resolve({ data: [] })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
  })

  it('requests all usage aggregates with the local-only filter', async () => {
    render(<MonitorSection />)

    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(4))
    for (const url of [
      '/api/usage/summary',
      '/api/usage/by-model',
      '/api/usage/timeline',
    ]) {
      expect(mocks.get).toHaveBeenCalledWith(url, {
        params: { days: 30, local_only: true },
      })
    }
    expect(mocks.get).toHaveBeenCalledWith('/api/llm-configs/brief')
    expect(mocks.get).not.toHaveBeenCalledWith('/api/llm-configs')
    expect(mocks.get).not.toHaveBeenCalledWith('/api/usage/cost', expect.anything())
  })

  it('keeps successful usage data visible when model status is forbidden', async () => {
    mocks.get.mockImplementation((url) => {
      if (url === '/api/usage/summary') {
        return Promise.resolve({ data: { total_calls: 7, total_tokens: 321 } })
      }
      if (url === '/api/usage/by-model' || url === '/api/usage/timeline') {
        return Promise.resolve({ data: [] })
      }
      if (url === '/api/llm-configs/brief') {
        return Promise.reject({ response: { status: 403 } })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })

    render(<MonitorSection />)

    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(screen.getByTestId('monitor-partial-warning')).toHaveTextContent('模型状态')
    expect(screen.getByText('暂无可用模型')).toBeInTheDocument()
  })
})
