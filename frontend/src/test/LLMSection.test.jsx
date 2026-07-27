import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  refreshLlmCatalog: vi.fn(),
}))

vi.mock('../api', () => ({
  default: {
    get: (...args) => mocks.get(...args),
    post: (...args) => mocks.post(...args),
    patch: (...args) => mocks.patch(...args),
    delete: (...args) => mocks.delete(...args),
  },
}))

vi.mock('../store', () => ({
  default: (selector) => selector({ refreshLlmCatalog: mocks.refreshLlmCatalog }),
}))

vi.mock('../components/ui', () => ({
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
  Card: ({ children, actions }) => <div>{actions}{children}</div>,
  useToast: () => ({ addToast: mocks.addToast }),
}))

vi.mock('../components/settings/ConfigEditForm', () => ({
  default: ({ onSubmit }) => (
    <button type="button" onClick={() => onSubmit({ preventDefault() {} })}>提交配置</button>
  ),
}))
vi.mock('../components/settings/LLMConfigList', () => ({ default: () => null }))
vi.mock('../components/settings/LLMBatchActions', () => ({ default: () => null }))
vi.mock('../components/settings/ModelCompareModal', () => ({ default: () => null }))
vi.mock('../components/settings/UsageAuditPanel', () => ({ default: () => null }))

import LLMSection from '../components/settings/LLMSection'

describe('LLMSection selectable model catalog sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation((url) => Promise.resolve({ data: url.endsWith('/providers') ? [] : [] }))
    mocks.post.mockResolvedValue({ data: { id: 9 } })
    mocks.refreshLlmCatalog.mockResolvedValue([])
  })

  it('force-refreshes assistant and workflow model options after adding a config', async () => {
    render(<LLMSection />)

    fireEvent.click(screen.getByRole('button', { name: /添加/ }))
    fireEvent.click(screen.getByRole('button', { name: '提交配置' }))

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith('/api/llm-configs', expect.any(Object))
      expect(mocks.refreshLlmCatalog).toHaveBeenCalledWith({ force: true })
    })
  })
})
