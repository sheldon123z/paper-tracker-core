import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotChatAssistantMessage: ({ message, toolbarVisible, markdownRenderer, toolbar: Toolbar }) => (
    <div
      data-testid={`assistant-${message.id}`}
      data-toolbar-visible={String(toolbarVisible)}
      data-code-controls={String(markdownRenderer?.controls)}
    >
      {toolbarVisible && <Toolbar><button type="button">copy</button></Toolbar>}
    </div>
  ),
}))

import CustomAssistantMessage, {
  SINGLE_COPY_MESSAGE_VIEW,
} from '../components/copilot/CustomAssistantMessage'

describe('CustomAssistantMessage', () => {
  const messages = [
    { id: 'user-1', role: 'user', content: 'first question' },
    { id: 'assistant-1-draft', role: 'assistant', content: 'first partial answer' },
    { id: 'tool-0', role: 'tool', content: 'first tool result' },
    { id: 'assistant-1-final', role: 'assistant', content: 'first final answer' },
    { id: 'user-2', role: 'user', content: 'follow-up' },
    { id: 'assistant-tool', role: 'assistant', content: '' },
    { id: 'tool-1', role: 'tool', content: 'tool result' },
    { id: 'assistant-2', role: 'assistant', content: 'final answer with ```code```' },
  ]

  it('shows one toolbar on the final assistant answer of every user turn', () => {
    render(
      <>
        <CustomAssistantMessage message={messages[1]} messages={messages} />
        <CustomAssistantMessage message={messages[3]} messages={messages} />
        <CustomAssistantMessage message={messages[5]} messages={messages} />
        <CustomAssistantMessage message={messages[7]} messages={messages} />
      </>,
    )

    expect(screen.getByTestId('assistant-assistant-1-draft')).toHaveAttribute('data-toolbar-visible', 'false')
    expect(screen.getByTestId('assistant-assistant-1-final')).toHaveAttribute('data-toolbar-visible', 'true')
    expect(screen.getByTestId('assistant-assistant-tool')).toHaveAttribute('data-toolbar-visible', 'false')
    expect(screen.getByTestId('assistant-assistant-2')).toHaveAttribute('data-toolbar-visible', 'true')
    expect(screen.getAllByRole('button', { name: 'copy' })).toHaveLength(2)
  })

  it('disables repeated copy and download controls inside code blocks', () => {
    render(<CustomAssistantMessage message={messages[7]} messages={messages} />)

    expect(screen.getByTestId('assistant-assistant-2')).toHaveAttribute('data-code-controls', 'false')
  })

  it('insets the copy toolbar from the message boundary', () => {
    render(<CustomAssistantMessage message={messages[7]} messages={messages} />)

    expect(screen.getByTestId('copilot-assistant-toolbar')).toHaveClass('copilot-conversation-copy-toolbar')
  })

  it('exports a stable message-view slot for every chat surface', () => {
    expect(SINGLE_COPY_MESSAGE_VIEW.assistantMessage).toBe(CustomAssistantMessage)
    expect(Object.isFrozen(SINGLE_COPY_MESSAGE_VIEW)).toBe(true)
  })
})
