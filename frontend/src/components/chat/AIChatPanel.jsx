import { useEffect, useState } from 'react'
import {
  CopilotChat,
  CopilotChatSuggestionView,
  CopilotChatView,
} from '@copilotkit/react-core/v2'

import api from '../../api'
import useStore from '../../store'
import AssistantSessionToolbar from '../copilot/AssistantSessionToolbar'
import { SINGLE_COPY_MESSAGE_VIEW } from '../copilot/CustomAssistantMessage'
import useAssistantSessionHistory from '../copilot/useAssistantSessionHistory'
import useAssistantSessions from '../copilot/useAssistantSessions'
import { PAPER_LABELS } from '../copilot/chatLabels'

function fillTemplate(text, paper) {
  if (!paper || !text) return text
  return text
    .replace(/\{title\}/g, paper.title || '')
    .replace(/\{abstract\}/g, paper.abstract || '')
    .replace(/\{authors\}/g, paper.authors || '')
    .replace(/\{notes\}/g, paper.notes || '')
}

const CONTEXT_LENGTH_OPTIONS = [
  { value: 4000, label: '4K' },
  { value: 8000, label: '8K' },
  { value: 16000, label: '16K' },
  { value: 32000, label: '32K' },
  { value: 0, label: '全量' },
]

/**
 * Keep paper actions attached to the composer instead of appending them to
 * the message transcript, where they can appear to float in an empty panel.
 */
export function PaperChatView({
  suggestions = [],
  suggestionLoadingIndexes,
  onSelectSuggestion,
  className = '',
  ...chatViewProps
}) {
  return (
    <div
      data-copilotkit
      data-testid="paper-chat-layout"
      className={`paper-chat-layout ${className}`.trim()}
    >
      <CopilotChatView {...chatViewProps} suggestions={[]}>
        {({ scrollView, input }) => (
          <>
            <div className="paper-chat-layout__messages">{scrollView}</div>
            <div className="paper-chat-layout__composer" data-testid="paper-chat-composer">
              {suggestions.length > 0 && (
                <CopilotChatSuggestionView
                  suggestions={suggestions}
                  loadingIndexes={suggestionLoadingIndexes}
                  onSelectSuggestion={onSelectSuggestion}
                  className="paper-chat-layout__suggestions"
                />
              )}
              {input}
            </div>
          </>
        )}
      </CopilotChatView>
    </div>
  )
}

/**
 * Context control bar — user controls what PDF context is injected into LLM.
 * Selection text is ALWAYS injected (lightweight).
 * Full document context is opt-in via toggle.
 */
function ContextControlBar() {
  const pdfSelectedText = useStore((s) => s.pdfSelectedText)
  const pdfSelectedPage = useStore((s) => s.pdfSelectedPage)
  const clearPdfSelection = useStore((s) => s.clearPdfSelection)
  const pdfContextEnabled = useStore((s) => s.pdfContextEnabled)
  const setPdfContextEnabled = useStore((s) => s.setPdfContextEnabled)
  const pdfContextLength = useStore((s) => s.pdfContextLength)
  const setPdfContextLength = useStore((s) => s.setPdfContextLength)
  const pdfActiveFileId = useStore((s) => s.pdfActiveFileId)

  const hasActiveFile = !!pdfActiveFileId
  const showBar = pdfSelectedText || hasActiveFile

  if (!showBar) return null

  return (
    <div
      className="border-b flex-shrink-0"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* Selection preview */}
      {pdfSelectedText && (
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
              已选中文本{pdfSelectedPage ? ` (第 ${pdfSelectedPage} 页)` : ''}
            </span>
            <button
              onClick={clearPdfSelection}
              className="text-xs px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              清除
            </button>
          </div>
          <p className="text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
            {pdfSelectedText.slice(0, 200)}{pdfSelectedText.length > 200 ? '...' : ''}
          </p>
        </div>
      )}

      {/* Full document context controls */}
      {hasActiveFile && (
        <div className="px-3 py-1.5 flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pdfContextEnabled}
              onChange={(e) => setPdfContextEnabled(e.target.checked)}
              className="rounded"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              注入全文
            </span>
          </label>

          {pdfContextEnabled && (
            <select
              value={pdfContextLength}
              onChange={(e) => setPdfContextLength(Number(e.target.value))}
              className="text-xs rounded px-1.5 py-0.5 border outline-none"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {CONTEXT_LENGTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {pdfContextEnabled && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary, var(--text-secondary))' }}>
              上下文长度
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function AIChatPanel({ paper, onClose }) {
  const [suggestions, setSuggestions] = useState([])
  const sessionsEnabled = Boolean(paper?.id)
  const {
    currentSessionId,
    sessions,
    loading: sessionsLoading,
    ready: sessionReady,
    newSession,
    selectSession,
  } = useAssistantSessions({ enabled: sessionsEnabled, paperId: paper?.id })
  useAssistantSessionHistory(currentSessionId, sessionsEnabled && sessionReady)

  useEffect(() => {
    api
      .get('/api/prompt-templates')
      .then((res) => {
        setSuggestions(
          res.data.map((t) => ({
            title: t.name,
            message: t.prompt_text,
          })),
        )
      })
      .catch(() => {})
  }, [])

  const filledSuggestions = suggestions.map((s) => ({
    ...s,
    message: fillTemplate(s.message, paper),
  }))

  return (
    <div
      className="paper-assistant-chat flex flex-col h-full"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="paper-assistant-session-header">
        <AssistantSessionToolbar
          currentSessionId={currentSessionId}
          sessions={sessions}
          loading={sessionsLoading}
          surfaceId={`paper-${paper?.id || 'loading'}`}
          title="AI 论文助手"
          onClose={onClose}
          onNewSession={newSession}
          onSelectSession={selectSession}
        />
      </div>
      <ContextControlBar />

      <div className="relative flex-1 min-h-0">
        {sessionReady ? (
          <CopilotChat
            key={`paper-chat-${paper?.id || 'loading'}-${currentSessionId}`}
            agentId="assistantAgent"
            threadId={currentSessionId}
            chatView={PaperChatView}
            messageView={SINGLE_COPY_MESSAGE_VIEW}
            labels={{
              ...PAPER_LABELS,
              welcomeMessageText: paper
                ? `正在分析：${paper.title}。可以点击快捷按钮或直接输入问题。`
                : '点击快捷操作或输入问题开始分析这篇论文。',
            }}
            suggestions={filledSuggestions}
            className="absolute inset-0"
          />
        ) : (
          <div className="assistant-session-loading" role="status">正在加载该论文的会话…</div>
        )}
      </div>
    </div>
  )
}
