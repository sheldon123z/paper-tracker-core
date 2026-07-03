/**
 * Custom error message component for CopilotChat.
 * Renders as a card with retry/dismiss actions.
 */
export default function ChatErrorMessage({ error, onRegenerate }) {
  return (
    <div className="copilot-error-card">
      <div className="copilot-error-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>{error?.message || '出现错误，请重试'}</span>
      </div>
      <div className="copilot-error-actions">
        {onRegenerate && (
          <button type="button" onClick={onRegenerate} className="copilot-error-btn copilot-error-retry">
            重试
          </button>
        )}
      </div>
    </div>
  )
}
