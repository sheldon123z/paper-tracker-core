import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  refreshLlmCatalog: vi.fn(),
}))

vi.mock('../config/runtime', async (importOriginal) => {
  const actual = await importOriginal()
  const capabilities = {
    offlineMode: true,
    rssSubscriptions: false,
    cloudDocumentParsing: false,
    remoteLlmProviders: false,
  }
  return {
    ...actual,
    RUNTIME_CAPABILITIES: capabilities,
    filterLlmConfigsForRuntime: (configs) => (
      actual.filterLlmConfigsForRuntime(configs, capabilities)
    ),
  }
})

vi.mock('../api', () => ({
  default: {
    get: (...args) => mocks.get(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../store', () => ({
  default: (selector) => selector({ refreshLlmCatalog: mocks.refreshLlmCatalog }),
}))

vi.mock('../hooks/useIsMobile', () => ({ default: () => false }))

vi.mock('../components/ui', () => ({
  Badge: ({ children }) => <span>{children}</span>,
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
  Card: ({ children, actions }) => <section>{actions}{children}</section>,
  Input: ({ label, ...props }) => <label>{label}<input {...props} /></label>,
  useToast: () => ({ addToast: vi.fn() }),
}))

vi.mock('../components/settings/LLMConfigList', () => ({
  default: ({ configs }) => (
    <div>{configs.map((config) => <span key={config.id}>{config.display_name}</span>)}</div>
  ),
}))
vi.mock('../components/settings/LLMBatchActions', () => ({ default: () => null }))
vi.mock('../components/settings/ModelCompareModal', () => ({ default: () => null }))
vi.mock('../components/settings/UsageAuditPanel', () => ({ default: () => null }))
vi.mock('../components/settings/SkillsSection', () => ({ default: () => null }))
vi.mock('../components/settings/SystemPromptsSection', () => ({ default: () => null }))
vi.mock('../components/settings/TemplatesSection', () => ({ default: () => null }))
vi.mock('../components/settings/MonitorSection', () => ({ default: () => null }))

import LLMSection from '../components/settings/LLMSection'
import SettingsPage from '../pages/SettingsPage'

describe('offline settings capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockImplementation((url) => {
      if (url.endsWith('/providers')) {
        return Promise.resolve({
          data: [
            { key: 'openai', label: 'OpenAI Cloud', is_local: false },
            { key: 'ollama', label: 'Ollama', is_local: true },
          ],
        })
      }
      if (url === '/api/llm-configs') {
        return Promise.resolve({
          data: [
            { id: 1, provider: 'openai', display_name: 'Remote GPT', is_local: false },
            { id: 2, provider: 'ollama', display_name: 'Local Qwen', is_local: true },
          ],
        })
      }
      return Promise.resolve({ data: [] })
    })
  })

  it('shows a restrained local-only status notice', () => {
    render(<SettingsPage />)

    expect(screen.getByTestId('offline-mode-notice')).toHaveTextContent('离线模式')
    expect(screen.getByTestId('offline-mode-notice')).toHaveTextContent('仅显示并使用本地模型')
  })

  it('hides remote configurations and cloud provider choices', async () => {
    render(<LLMSection />)

    expect(await screen.findByText('Local Qwen')).toBeInTheDocument()
    expect(screen.queryByText('Remote GPT')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ 添加' }))
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ollama' })).toBeInTheDocument())
    expect(screen.getByLabelText('Base URL（可选）')).toHaveValue('http://model-proxy:11434')
    expect(screen.queryByRole('option', { name: 'OpenAI Cloud' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '全部测试' })).not.toBeInTheDocument()
  })
})
