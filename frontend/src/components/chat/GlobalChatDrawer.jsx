import { useEffect } from 'react'
import { CopilotChat } from '@copilotkit/react-core/v2'

import useIsMobile from '../../hooks/useIsMobile'
import useStore from '../../store'
import AssistantSessionToolbar from '../copilot/AssistantSessionToolbar'
import { SINGLE_COPY_MESSAGE_VIEW } from '../copilot/CustomAssistantMessage'
import useAssistantSessionHistory from '../copilot/useAssistantSessionHistory'
import useAssistantSessions from '../copilot/useAssistantSessions'
import { GLOBAL_LABELS } from '../copilot/chatLabels'

/**
 * Global research assistant using the CopilotKit v2 chat surface.
 * Every view binds the assistant agent and the selected assistant thread
 * explicitly, so workflow threads can never leak into this drawer.
 */
export default function GlobalChatDrawer({ children, hidden = false }) {
  const isMobile = useIsMobile()
  const globalChatOpen = useStore((state) => state.globalChatOpen)
  const toggleGlobalChat = useStore((state) => state.toggleGlobalChat)
  const {
    currentSessionId,
    sessions,
    newSession,
    selectSession,
  } = useAssistantSessions(!hidden)

  useAssistantSessionHistory(currentSessionId, !hidden)

  useEffect(() => {
    if (!globalChatOpen || hidden) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') toggleGlobalChat()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [globalChatOpen, hidden, toggleGlobalChat])

  return (
    <>
      {children}

      {!hidden && !globalChatOpen && (
        <button
          type="button"
          onClick={toggleGlobalChat}
          aria-label="打开研究助手"
          className="research-assistant-toggle"
          style={{
            position: 'fixed',
            right: 16,
            bottom: isMobile
              ? 'calc(56px + env(safe-area-inset-bottom, 0px) + 16px)'
              : 24,
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--accent)',
            color: 'white',
            zIndex: 1199,
            boxShadow: '0 8px 24px rgba(0,0,0,0.24)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {!hidden && globalChatOpen && (
        <aside
          className="research-assistant-drawer"
          aria-label="研究助手"
          style={{
            position: 'fixed',
            inset: isMobile ? 0 : '0 0 0 auto',
            width: isMobile ? '100%' : 'min(480px, 100vw)',
            zIndex: 1200,
            backgroundColor: 'var(--bg-primary)',
            borderLeft: isMobile ? 'none' : '1px solid var(--border)',
            boxShadow: '-12px 0 32px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
            paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : 0,
          }}
        >
          <div className="research-assistant-header">
            <AssistantSessionToolbar
              currentSessionId={currentSessionId}
              sessions={sessions}
              surfaceId={isMobile ? 'mobile-global' : 'global'}
              title="研究助手"
              onClose={toggleGlobalChat}
              onNewSession={newSession}
              onSelectSession={selectSession}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <CopilotChat
              key={`global-chat-${currentSessionId || 'default'}`}
              agentId="assistantAgent"
              threadId={currentSessionId || 'assistant-default'}
              messageView={SINGLE_COPY_MESSAGE_VIEW}
              labels={GLOBAL_LABELS}
              className="absolute inset-0"
            />
          </div>
        </aside>
      )}
    </>
  )
}
