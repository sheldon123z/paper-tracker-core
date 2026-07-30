import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MonitorSection from '../components/settings/MonitorSection'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('../api', () => ({
  default: { get: mocks.get },
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
      if (url === '/api/llm-configs') {
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
  })
})
