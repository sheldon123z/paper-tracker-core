import { useEffect, useState } from 'react'
import { CopilotChat } from '@copilotkit/react-core/v2'

import api from '../../api'
import useStore from '../../store'
import AssistantSessionToolbar from '../copilot/AssistantSessionToolbar'
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

export default function AIChatPanel({ paper }) {
  const [suggestions, setSuggestions] = useState([])
  const sessionsEnabled = Boolean(paper?.id)
  const {
    currentSessionId,
    sessions,
    newSession,
    selectSession,
  } = useAssistantSessions(sessionsEnabled)
  useAssistantSessionHistory(currentSessionId, sessionsEnabled)

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
      className="flex flex-col h-full"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="paper-assistant-session-header">
        <AssistantSessionToolbar
          currentSessionId={currentSessionId}
          sessions={sessions}
          surfaceId={`paper-${paper?.id || 'loading'}`}
          title="AI 论文助手"
          onNewSession={newSession}
          onSelectSession={selectSession}
        />
      </div>
      <ContextControlBar />

      <div className="relative flex-1 min-h-0">
        <CopilotChat
          key={`paper-chat-${paper?.id || 'loading'}-${currentSessionId || 'default'}`}
          agentId="assistantAgent"
          threadId={currentSessionId || 'assistant-default'}
          labels={{
            ...PAPER_LABELS,
            welcomeMessageText: paper
              ? `正在分析：${paper.title}。可以点击快捷按钮或直接输入问题。`
              : '点击快捷操作或输入问题开始分析这篇论文。',
          }}
          suggestions={filledSuggestions}
          className="absolute inset-0"
        />
      </div>
    </div>
  )
}
