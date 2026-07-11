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
    />
  ),
}))

import AIChatPanel from '../components/chat/AIChatPanel'

describe('AIChatPanel assistant sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      assistantSessionId: null,
      pdfSelectedText: null,
      pdfActiveFileId: null,
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

    await user.click(screen.getByRole('combobox', { name: '切换聊天记录' }))
    await user.click(screen.getByRole('option', { name: '论文会话 B' }))

    expect(useStore.getState().assistantSessionId).toBe('ast-paper-b')
    expect(mocks.history).toHaveBeenLastCalledWith('ast-paper-b', true)
    expect(screen.getByTestId('paper-copilot-chat')).toHaveAttribute('data-session-id', 'ast-paper-b')
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
})
