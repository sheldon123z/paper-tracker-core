import { CopilotChatAssistantMessage } from '@copilotkit/react-core/v2'

function isCopyableAssistantMessage(message) {
  return message?.role === 'assistant'
    && typeof message.content === 'string'
    && message.content.trim().length > 0
}

function isLastCopyableAssistantInTurn(message, messages) {
  if (!isCopyableAssistantMessage(message)) return false

  const messageIndex = messages.findIndex((candidate) => candidate.id === message.id)
  if (messageIndex < 0) return false

  let belongsToUserTurn = false
  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      belongsToUserTurn = true
      break
    }
  }
  if (!belongsToUserTurn) return false

  for (let index = messageIndex + 1; index < messages.length; index += 1) {
    const candidate = messages[index]
    if (candidate?.role === 'user') break
    if (isCopyableAssistantMessage(candidate)) return false
  }

  return true
}

function ConversationCopyToolbar({ className = '', ...props }) {
  const toolbarClassName = ['copilot-conversation-copy-toolbar', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      {...props}
      data-testid="copilot-assistant-toolbar"
      className={toolbarClassName}
    />
  )
}

/**
 * Keep one action per user turn: copy that turn's final assistant answer.
 * Streamdown's per-code-block controls are disabled so code-heavy answers do
 * not repeat copy/download buttons for every fenced block.
 */
export default function CustomAssistantMessage(props) {
  const { message, messages = [] } = props
  const showCopy = isLastCopyableAssistantInTurn(message, messages)

  return (
    <CopilotChatAssistantMessage
      {...props}
      toolbarVisible={showCopy}
      toolbar={ConversationCopyToolbar}
      markdownRenderer={{ controls: false }}
    />
  )
}

export const SINGLE_COPY_MESSAGE_VIEW = Object.freeze({
  assistantMessage: CustomAssistantMessage,
})
