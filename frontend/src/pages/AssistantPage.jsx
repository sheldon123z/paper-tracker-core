/**
 * AssistantPage — full-page AI assistant powered by CopilotKit.
 *
 * Session persistence:
 *   - Session ID persisted in URL search params (?session=xxx)
 *   - Switching sessions updates the top-level CopilotKit thread and restores
 *     persisted messages before the next user turn.
 *   - The legacy double-render path (custom `ChatHistory` for restored history
 *     + `<CopilotChat />` for live messages) has been removed; CopilotChat is
 *     now the single render path for both restored and live messages.
 */

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CopilotChat } from '@copilotkit/react-core/v2'

import api from '../api'
import useStore from '../store'
import useIsMobile from '../hooks/useIsMobile'
import ModelSelector from '../components/copilot/ModelSelector'
import useAssistantSessionHistory from '../components/copilot/useAssistantSessionHistory'
import { ASSISTANT_LABELS } from '../components/copilot/chatLabels'
import { AppIcon, Badge } from '../components/ui'

function healthBadgeVariant(status) {
  switch ((status || '').toLowerCase()) {
    case 'ok':
      return 'success'
    case 'unknown':
    case 'testing':
      return 'neutral'
    case 'billing_error':
    case 'region_blocked':
      return 'warning'
    default:
      return 'danger'
  }
}

export default function AssistantPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [sessions, setSessions] = useState([])
  const selectedModelMeta = useStore((state) => state.selectedModelMeta)
  const isMobile = useIsMobile()

  // Sync assistantSessionId to global store (forwarded to backend via CopilotKit properties)
  const setAssistantSessionId = useStore((s) => s.setAssistantSessionId)

  // Persist currentSessionId in URL
  const currentSessionId = searchParams.get('session') || null
  const setCurrentSessionId = useCallback((id) => {
    if (id) {
      setSearchParams({ session: id }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
    setAssistantSessionId(id)
  }, [setSearchParams, setAssistantSessionId])

  useAssistantSessionHistory(currentSessionId)

  // Load sessions list
  useEffect(() => {
    api
      .get('/api/agui/assistant/sessions')
      .then((res) => setSessions(res.data))
      .catch(() => {})
  }, [])

  // Keep store's assistantSessionId in sync with the URL on mount/back-nav.
  useEffect(() => {
    setAssistantSessionId(currentSessionId)
  }, [currentSessionId, setAssistantSessionId])

  const newSession = useCallback(() => {
    const id = 'ast-' + crypto.randomUUID()
    setSessions((prev) => [{ session_id: id, title: '新会话' }, ...prev])
    setCurrentSessionId(id)
  }, [setCurrentSessionId])

  const loadSession = useCallback((sessionId) => {
    if (sessionId === currentSessionId) return
    setCurrentSessionId(sessionId)
  }, [currentSessionId, setCurrentSessionId])

  const deleteSession = useCallback(
    async (sessionId, e) => {
      e?.stopPropagation()
      try {
        await api.delete(`/api/agui/assistant/${sessionId}`)
      } catch {
        // silently ignore
      }
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId))
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null)
      }
    },
    [currentSessionId, setCurrentSessionId],
  )

  return (
    <div
      className={[
        'assistant-shell flex overflow-hidden',
        isMobile
          ? 'flex-col h-full'
          : 'glass-panel glass-premium panel-outline rounded-shell border border-glass h-full',
      ].join(' ')}
    >
      {/* Sessions Sidebar — 移动端隐藏 */}
      <aside className={`assistant-sidebar${isMobile ? ' hidden' : ''}`}>
        <div className="assistant-sidebar__section assistant-sidebar__section--intro">
          <div className="panel-header-kicker">Research Copilot</div>
          <div className="assistant-sidebar__title-row">
            <div className="assistant-sidebar__title-icon">
              <AppIcon name="assistant" size={18} />
            </div>
            <div className="min-w-0">
              <div className="assistant-sidebar__title">智能助手</div>
              <p className="assistant-sidebar__subtitle">管理会话上下文、模型能力与历史研究线索。</p>
            </div>
          </div>
        </div>

        <div className="assistant-sidebar__section assistant-sidebar__section--action">
          <button
            type="button"
            onClick={newSession}
            className="assistant-new-session-btn"
          >
            <AppIcon name="plus" size={14} />
            新会话
          </button>
        </div>

        <div className="assistant-sidebar__section assistant-sidebar__section--model">
          <div className="assistant-sidebar__section-label">模型配置</div>
          <ModelSelector />
          {selectedModelMeta && (
            <div className="assistant-model-panel">
              <div className="assistant-model-panel__header">
                <div className="min-w-0">
                  <div className="assistant-model-panel__kicker">Active Model</div>
                  <div className="assistant-model-panel__name">{selectedModelMeta.label}</div>
                </div>
                <Badge variant={healthBadgeVariant(selectedModelMeta.health_status)}>
                  {selectedModelMeta.health_status || 'unknown'}
                </Badge>
              </div>
              <div className="assistant-model-panel__badges">
                <Badge variant={selectedModelMeta.is_local ? 'warning' : 'neutral'}>
                  {selectedModelMeta.provider_label || selectedModelMeta.provider}
                </Badge>
                {selectedModelMeta.is_default && <Badge variant="neutral">默认</Badge>}
                {selectedModelMeta.is_local && <Badge variant="warning">本地</Badge>}
                {selectedModelMeta.supports_tool_calling && <Badge variant="neutral">Tools</Badge>}
                {selectedModelMeta.supports_reasoning && <Badge variant="neutral">Reasoning</Badge>}
              </div>
              <p className="assistant-model-panel__meta">
                <span className="assistant-model-panel__meta-key">Provider</span>
                <span className="truncate">
                  {selectedModelMeta.provider}
                  {selectedModelMeta.supports_streaming === false ? ' · 非流式' : ' · 流式'}
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="assistant-sidebar__section assistant-sidebar__section--sessions">
          <div className="assistant-sidebar__section-label">会话历史</div>
          <div className="assistant-sessions">
            {sessions.length === 0 && (
              <p className="assistant-sessions__empty">
                暂无会话
              </p>
            )}
            {sessions.map((s, index) => {
              const isActive = currentSessionId === s.session_id
              return (
                <div
                  key={s.session_id}
                  className={['assistant-session-item', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => loadSession(s.session_id)}
                    className="assistant-session-item__main"
                  >
                    <span className="assistant-session-item__index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="assistant-session-item__content">
                      <span className="assistant-session-item__title">{s.title || '未命名会话'}</span>
                      <span className="assistant-session-item__meta">{isActive ? '当前会话' : '点击继续对话'}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => deleteSession(s.session_id, e)}
                    className="assistant-session-item__delete"
                    aria-label={`删除会话: ${s.title}`}
                    title="删除会话"
                  >
                    <AppIcon name="close" size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      {/* Chat Area — 移动端占满宽度和高度 */}
      <div className={`assistant-chat-area${isMobile ? ' flex-1 w-full flex flex-col' : ''}`} style={isMobile ? { minHeight: 0 } : undefined}>
        <div
          className="assistant-live-chat is-fullscreen"
          style={isMobile ? { flex: 1, position: 'relative', minHeight: 0 } : undefined}
        >
          <CopilotChat
            key={`assistant-chat-${currentSessionId || 'default'}`}
            agentId="assistantAgent"
            threadId={currentSessionId || 'assistant-default'}
            labels={{
              ...ASSISTANT_LABELS,
              welcomeMessageText: '你好！我是你的论文研究助手，可以搜索论文、分析研究趋势和管理文献。',
            }}
            className="h-full"
          />
        </div>
      </div>
    </div>
  )
}
