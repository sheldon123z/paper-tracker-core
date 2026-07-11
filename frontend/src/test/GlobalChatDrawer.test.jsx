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

vi.mock('../hooks/useIsMobile', () => ({
  default: () => false,
}))

vi.mock('../components/copilot/useChatConfig', () => ({
  default: () => ({ labels: {} }),
}))

vi.mock('../components/copilot/useAssistantSessionHistory', () => ({
  default: (...args) => mocks.history(...args),
}))

vi.mock('@copilotkit/react-ui', () => ({
  CopilotChat: () => <div data-testid="copilot-chat" />,
  CopilotSidebar: ({ Header, children }) => (
    <div data-testid="copilot-sidebar">
      <Header />
      {children}
    </div>
  ),
  useChatContext: () => ({
    setOpen: vi.fn(),
    icons: { headerCloseIcon: <span aria-hidden="true">close</span> },
  }),
}))

import GlobalChatDrawer from '../components/chat/GlobalChatDrawer'

describe('GlobalChatDrawer session switching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ assistantSessionId: null, globalChatOpen: false })
    mocks.get.mockResolvedValue({
      data: [
        { session_id: 'ast-session-a', title: 'Session A' },
        { session_id: 'ast-session-b', title: 'Session B' },
      ],
    })
  })

  it('selects the latest persisted session and switches its restored history', async () => {
    const user = userEvent.setup()
    render(
      <GlobalChatDrawer>
        <main>论文库</main>
      </GlobalChatDrawer>,
    )

    await screen.findByRole('combobox', { name: '切换聊天记录' })
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '切换聊天记录' })).toHaveTextContent('Session A')
    })
    expect(mocks.get).toHaveBeenCalledWith('/api/agui/assistant/sessions')
    expect(useStore.getState().assistantSessionId).toBe('ast-session-a')

    const picker = screen.getByRole('combobox', { name: '切换聊天记录' })
    await user.click(picker)
    await user.click(screen.getByRole('option', { name: 'Session B' }))

    expect(useStore.getState().assistantSessionId).toBe('ast-session-b')
    expect(mocks.history).toHaveBeenLastCalledWith('ast-session-b', true)
  })

  it('starts a separate conversation from the drawer header', async () => {
    const user = userEvent.setup()
    render(<GlobalChatDrawer><main>论文库</main></GlobalChatDrawer>)

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '切换聊天记录' })).toHaveTextContent('Session A')
    })
    const newChatButton = screen.getByRole('button', { name: '新建聊天' })
    const closeButton = screen.getByRole('button', { name: '关闭研究助手' })
    expect(newChatButton.closest('.assistant-session-toolbar__actions')).toBe(
      closeButton.closest('.assistant-session-toolbar__actions'),
    )
    expect(newChatButton).not.toBe(closeButton)
    await user.click(newChatButton)

    const nextSessionId = useStore.getState().assistantSessionId
    expect(nextSessionId).toMatch(/^ast-/)
    expect(screen.getByRole('combobox', { name: '切换聊天记录' })).toHaveTextContent('新会话')
    expect(mocks.history).toHaveBeenLastCalledWith(nextSessionId, true)
  })
})
