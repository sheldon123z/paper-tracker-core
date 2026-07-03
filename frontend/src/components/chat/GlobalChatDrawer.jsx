import { CopilotChat, CopilotSidebar } from '@copilotkit/react-ui'

import useIsMobile from '../../hooks/useIsMobile'
import useStore from '../../store'
import useChatConfig from '../copilot/useChatConfig'
import { GLOBAL_LABELS } from '../copilot/chatLabels'

/**
 * Global research chat.
 * - 移动端: 浮动按钮 + 全屏 CopilotChat 模态
 * - 桌面端: 保持原有 CopilotSidebar 不变
 *
 * When `hidden` is true, the floating toggle button and modal are hidden
 * (e.g. on pages that already have their own chat panel).
 */
export default function GlobalChatDrawer({ children, hidden = false }) {
  const isMobile = useIsMobile()
  const globalChatOpen = useStore((s) => s.globalChatOpen)
  const toggleGlobalChat = useStore((s) => s.toggleGlobalChat)
  const chatConfig = useChatConfig({ sessionId: 'global-default', sessionType: 'global' })

  const labels = {
    ...chatConfig.labels,
    ...GLOBAL_LABELS,
    initial: '你好！我可以帮你搜索论文数据库。有什么问题？',
  }

  if (isMobile) {
    return (
      <>
        {children}

        {/* 浮动按钮 — hidden 时隐藏，聊天打开时也隐藏 */}
        {!hidden && !globalChatOpen && (
          <button
            onClick={toggleGlobalChat}
            aria-label="打开研究助手"
            style={{
              position: 'fixed',
              bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 16px)',
              right: 16,
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              zIndex: 9998,
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}

        {/* 全屏聊天模态 */}
        {globalChatOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10000,
              backgroundColor: 'var(--bg-primary)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* 顶部标题栏 */}
            <div
              style={{
                paddingTop: 'env(safe-area-inset-top, 0px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                height: 'calc(44px + env(safe-area-inset-top, 0px))',
                borderBottom: '1px solid var(--border)',
                backgroundColor: 'var(--bg-primary)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
                研究助手
              </span>
              <button
                onClick={toggleGlobalChat}
                aria-label="关闭"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* 聊天内容区 */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <CopilotChat
                agentId="globalAgent"
                {...chatConfig}
                labels={labels}
                className="absolute inset-0"
              />
            </div>
          </div>
        )}
      </>
    )
  }

  // 桌面端: 保持原有 CopilotSidebar
  if (hidden) {
    return <>{children}</>
  }

  return (
    <CopilotSidebar
      agentId="globalAgent"
      {...chatConfig}
      labels={labels}
      defaultOpen={false}
      clickOutsideToClose
      hitEscapeToClose
    >
      {children}
    </CopilotSidebar>
  )
}
