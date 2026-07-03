/**
 * Custom user message component for CopilotChat.
 * Right-aligned bubble with accent background.
 */
export default function CustomUserMessage({ message }) {
  const text = message?.content || ''

  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="copilot-user-msg-row">
      <div className="copilot-user-msg-bubble">
        <div className="copilot-user-msg-text">{text}</div>
        <button
          type="button"
          className="copilot-user-msg-copy"
          onClick={handleCopy}
          title="复制"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>
    </div>
  )
}
