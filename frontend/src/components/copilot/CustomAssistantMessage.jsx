import { AssistantMessage } from '@copilotkit/react-ui'
import useStore from '../../store'

/**
 * Custom assistant message with model badge and feedback toolbar.
 * Wraps CopilotKit's default AssistantMessage for full rendering
 * (markdown, tool cards, generative UI) but strips its built-in
 * toolbar by passing undefined callbacks to the inner component.
 */
export default function CustomAssistantMessage(props) {
  const {
    message,
    isCurrentMessage,
    isLoading,
    isGenerating,
    onRegenerate,
    onCopy,
    onThumbsUp,
    onThumbsDown,
    feedback,
  } = props

  const selectedModelMeta = useStore((s) => s.selectedModelMeta)
  const providerLabel = selectedModelMeta?.provider_label || selectedModelMeta?.provider || ''
  const isLocal = selectedModelMeta?.is_local

  const text = message?.content || ''
  const hasText = text.trim().length > 0

  return (
    <div className="copilot-assistant-msg">
      {/* Model badge — only shown when there's actual text content */}
      {hasText && (
        <div className="copilot-model-badge-row">
          <span className={`copilot-model-badge ${isGenerating ? 'copilot-model-badge-pulse' : ''}`}>
            {isLocal && <span className="copilot-model-local-icon">{'🏠'}</span>}
            {providerLabel || 'AI'}
          </span>
        </div>
      )}

      {/* Default CopilotKit rendering (markdown + tool cards + generative UI)
          Pass undefined for all callbacks to suppress the built-in toolbar */}
      <AssistantMessage
        {...props}
        onCopy={undefined}
        onThumbsUp={undefined}
        onThumbsDown={undefined}
        onRegenerate={undefined}
      />

      {/* Our custom toolbar — only on messages with text, hidden while loading */}
      {hasText && !isLoading && (
        <div className="copilot-msg-toolbar">
          {onCopy && (
            <button
              type="button"
              className="copilot-toolbar-btn"
              onClick={() => onCopy(text)}
              title="复制"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          )}
          {onThumbsUp && (
            <button
              type="button"
              className={`copilot-toolbar-btn ${feedback === 'thumbsUp' ? 'copilot-toolbar-active' : ''}`}
              onClick={() => onThumbsUp(message)}
              title="有帮助"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={feedback === 'thumbsUp' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            </button>
          )}
          {onThumbsDown && (
            <button
              type="button"
              className={`copilot-toolbar-btn ${feedback === 'thumbsDown' ? 'copilot-toolbar-active' : ''}`}
              onClick={() => onThumbsDown(message)}
              title="没帮助"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={feedback === 'thumbsDown' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
              </svg>
            </button>
          )}
          {onRegenerate && isCurrentMessage && !isGenerating && (
            <button
              type="button"
              className="copilot-toolbar-btn"
              onClick={onRegenerate}
              title="重新生成"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
