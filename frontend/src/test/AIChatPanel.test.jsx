import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import useStore from '../store'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  history: vi.fn(),
}))

vi.mock('../api', () => ({
  default: {
    get: (...args) => mocks.get(...args),
  },
}))

vi.mock('../components/copilot/useAssistantSessionHistory', () => ({
  default: (...args) => mocks.history(...args),
}))

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotChat: (props) => (
    <div
      data-testid="paper-copilot-chat"
      data-session-id={props.threadId}
      data-agent-id={props.agentId}
      data-chat-view={props.chatView?.name}
    />
  ),
  CopilotChatView: ({ children }) => children({
    scrollView: <div data-testid="paper-chat-messages" />,
    input: <div data-testid="paper-chat-input" />,
  }),
  CopilotChatSuggestionView: ({ suggestions }) => (
    <div data-testid="paper-bottom-suggestions">
      {suggestions.map((suggestion) => (
        <button key={suggestion.title} type="button">{suggestion.title}</button>
      ))}
    </div>
  ),
}))

import AIChatPanel, { PaperChatView } from '../components/chat/AIChatPanel'

describe('AIChatPanel assistant sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      assistantSessionId: null,
      assistantPaperId: null,
      paperAssistantSessionIds: {},
      pdfSelectedText: null,
      pdfActiveFileId: null,
      llmCatalogLoaded: true,
      llmCatalog: [
        { id: 7, label: 'Paper model A', provider: 'openai', provider_label: 'OpenAI', is_default: true },
        { id: 8, label: 'Paper model B', provider: 'openai', provider_label: 'OpenAI' },
      ],
      llmCatalogById: {
        7: { id: 7, label: 'Paper model A', provider: 'openai', provider_label: 'OpenAI', is_default: true },
        8: { id: 8, label: 'Paper model B', provider: 'openai', provider_label: 'OpenAI' },
      },
      selectedModelId: 7,
      selectedModelMeta: { id: 7, label: 'Paper model A', provider: 'openai', provider_label: 'OpenAI', is_default: true },
    })
    mocks.get.mockImplementation((url) => Promise.resolve({
      data: url === '/api/agui/assistant/sessions'
        ? [
            { session_id: 'ast-paper-a', title: '论文会话 A' },
            { session_id: 'ast-paper-b', title: '论文会话 B' },
          ]
        : [],
    }))
  })

  it('shows and switches assistant history inside a concrete paper panel', async () => {
    const user = userEvent.setup()
    render(<AIChatPanel paper={{ id: 61, title: 'MARL Paper' }} />)

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '切换聊天记录' })).toHaveTextContent('论文会话 A')
    })
    expect(screen.getByTestId('paper-copilot-chat')).toHaveAttribute('data-agent-id', 'assistantAgent')
    expect(screen.getByTestId('paper-copilot-chat')).toHaveAttribute('data-chat-view', 'PaperChatView')
    expect(screen.getByTestId('paper-copilot-chat').closest('.paper-assistant-chat')).toBeInTheDocument()
    expect(useStore.getState().assistantPaperId).toBe(61)

    await user.click(screen.getByRole('combobox', { name: '切换聊天记录' }))
    await user.click(screen.getByRole('option', { name: '论文会话 B' }))

    expect(useStore.getState().assistantSessionId).toBe('ast-paper-b')
    expect(mocks.history).toHaveBeenLastCalledWith('ast-paper-b', true)
    expect(screen.getByTestId('paper-copilot-chat')).toHaveAttribute('data-session-id', 'ast-paper-b')
  })

  it('registers and clears the paper id owned by the mounted assistant panel', async () => {
    const { unmount } = render(<AIChatPanel paper={{ id: 61, title: 'MARL Paper' }} />)

    await waitFor(() => expect(useStore.getState().assistantPaperId).toBe(61))
    unmount()
    expect(useStore.getState().assistantPaperId).toBeNull()
  })

  it('restores an independent selected session for each paper tab', async () => {
    mocks.get.mockImplementation((url, config) => {
      if (url !== '/api/agui/assistant/sessions') return Promise.resolve({ data: [] })
      const paperId = config?.params?.paper_id
      return Promise.resolve({
        data: paperId === 61
          ? [{ session_id: 'ast-paper-a', title: '论文会话 A', paper_id: 61 }]
          : [{ session_id: 'ast-paper-b', title: '论文会话 B', paper_id: 62 }],
      })
    })

    const { rerender } = render(<AIChatPanel paper={{ id: 61, title: 'Paper A' }} />)
    await waitFor(() => {
      expect(screen.getByTestId('paper-copilot-chat')).toHaveAttribute('data-session-id', 'ast-paper-a')
    })

    rerender(<AIChatPanel paper={{ id: 62, title: 'Paper B' }} />)
    await waitFor(() => {
      expect(screen.getByTestId('paper-copilot-chat')).toHaveAttribute('data-session-id', 'ast-paper-b')
    })

    rerender(<AIChatPanel paper={{ id: 61, title: 'Paper A' }} />)
    await waitFor(() => {
      expect(screen.getByTestId('paper-copilot-chat')).toHaveAttribute('data-session-id', 'ast-paper-a')
    })

    expect(mocks.get).toHaveBeenCalledWith(
      '/api/agui/assistant/sessions',
      { params: { paper_id: 61 } },
    )
    expect(mocks.get).toHaveBeenCalledWith(
      '/api/agui/assistant/sessions',
      { params: { paper_id: 62 } },
    )
  })

  it('ignores a stale session-list response after a fast paper switch', async () => {
    let resolvePaperA
    let resolvePaperB
    const paperARequest = new Promise((resolve) => { resolvePaperA = resolve })
    const paperBRequest = new Promise((resolve) => { resolvePaperB = resolve })
    mocks.get.mockImplementation((url, config) => {
      if (url !== '/api/agui/assistant/sessions') return Promise.resolve({ data: [] })
      return config?.params?.paper_id === 61 ? paperARequest : paperBRequest
    })

    const { rerender } = render(<AIChatPanel paper={{ id: 61, title: 'Paper A' }} />)
    rerender(<AIChatPanel paper={{ id: 62, title: 'Paper B' }} />)

    resolvePaperB({
      data: [{ session_id: 'ast-paper-b', title: '论文会话 B', paper_id: 62 }],
    })
    await waitFor(() => {
      expect(screen.getByTestId('paper-copilot-chat')).toHaveAttribute('data-session-id', 'ast-paper-b')
    })

    resolvePaperA({
      data: [{ session_id: 'ast-paper-a', title: '论文会话 A', paper_id: 61 }],
    })
    await waitFor(() => {
      expect(screen.getByTestId('paper-copilot-chat')).toHaveAttribute('data-session-id', 'ast-paper-b')
    })
    expect(screen.queryByText('论文会话 A')).not.toBeInTheDocument()
  })

  it('supports keyboard navigation in the custom session listbox', async () => {
    const user = userEvent.setup()
    render(<AIChatPanel paper={{ id: 61, title: 'MARL Paper' }} />)

    const picker = await screen.findByRole('combobox', { name: '切换聊天记录' })
    await waitFor(() => expect(picker).toHaveTextContent('论文会话 A'))
    picker.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(useStore.getState().assistantSessionId).toBe('ast-paper-b')
    expect(picker).toHaveAttribute('aria-expanded', 'false')
  })

  it('places paper suggestions immediately above the chat input', () => {
    render(
      <PaperChatView suggestions={[{ title: '论文摘要', message: '总结论文' }]} />,
    )

    const suggestions = screen.getByTestId('paper-bottom-suggestions')
    const input = screen.getByTestId('paper-chat-input')
    expect(suggestions.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('paper-chat-composer')).toContainElement(suggestions)
  })

  it('allows selecting the model used by the paper assistant', async () => {
    const user = userEvent.setup()
    render(<AIChatPanel paper={{ id: 61, title: 'MARL Paper' }} />)

    await user.click(screen.getByRole('button', { name: '选择 AI 论文助手模型' }))
    await user.click(screen.getByRole('button', { name: /Paper model B/ }))

    expect(useStore.getState().selectedModelId).toBe(8)
    expect(useStore.getState().selectedModelMeta?.label).toBe('Paper model B')
  })
})
