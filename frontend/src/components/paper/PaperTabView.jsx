import { useCallback, useEffect, useRef, useState } from 'react'

import api from '../../api'
import useIsMobile from '../../hooks/useIsMobile'
import useStore from '../../store'
import AIChatPanel from '../chat/AIChatPanel'
import { Badge, Button, Skeleton } from '../ui'
import InlineFileViewer from './viewer/InlineFileViewer'

function ResizeHandle({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1.5 flex-shrink-0 cursor-col-resize hover:bg-[var(--accent)] transition-colors"
      style={{ backgroundColor: 'var(--border)' }}
      title="拖拽调整宽度"
    />
  )
}

export default function PaperTabView({ paperId }) {
  const [paper, setPaper] = useState(null)
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [tagsSaved, setTagsSaved] = useState(false)
  const [chatWidth, setChatWidth] = useState(420)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [files, setFiles] = useState([])
  const [abstractTranslating, setAbstractTranslating] = useState(false)
  const [infoPanelWidth, setInfoPanelWidth] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  const isMobile = useIsMobile()
  const [mobileViewerOpen, setMobileViewerOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)

  const containerRef = useRef(null)
  const containerWidthRef = useRef(0)
  const isDragging = useRef(false)

  const tabs = useStore((s) => s.tabs)
  const selectedModelId = useStore((s) => s.selectedModelId)
  const currentTab = tabs.find((t) => t.id === paperId)
  const initialFileId = currentTab?._initialFileId || null

  // Auto-open viewer if tab has initialFileId
  useEffect(() => {
    if (initialFileId && files.length > 0) {
      setViewerOpen(true)
    }
  }, [initialFileId, files])

  // Clear _initialFileId from tab after consuming it
  useEffect(() => {
    if (initialFileId && viewerOpen) {
      const { tabs: currentTabs } = useStore.getState()
      const newTabs = currentTabs.map((t) =>
        t.id === paperId ? { ...t, _initialFileId: null } : t
      )
      useStore.setState({ tabs: newTabs })
    }
  }, [viewerOpen, initialFileId, paperId])

  // Measure container width with ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      containerWidthRef.current = entry.contentRect.width
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Chat resize handle (handle2 in three-panel, only handle in two-panel)
  const handleChatResize = useCallback((e) => {
    e.preventDefault()
    isDragging.current = true
    setIsAnimating(false)
    const startX = e.clientX
    const startWidth = chatWidth

    const onMouseMove = (ev) => {
      if (!isDragging.current) return
      const newWidth = Math.max(280, Math.min(800, startWidth - (ev.clientX - startX)))
      setChatWidth(newWidth)
    }
    const onMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [chatWidth])

  // Info panel resize handle (handle1 — only in three-panel mode)
  const handleInfoResize = useCallback((e) => {
    e.preventDefault()
    isDragging.current = true
    setIsAnimating(false)
    const startX = e.clientX
    const startWidth = infoPanelWidth

    const onMouseMove = (ev) => {
      if (!isDragging.current) return
      const cw = containerRef.current?.clientWidth || containerWidthRef.current || 1200
      const maxInfo = cw - chatWidth - 300 - 12
      const newWidth = Math.max(280, Math.min(maxInfo, startWidth + (ev.clientX - startX)))
      setInfoPanelWidth(newWidth)
    }
    const onMouseUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [infoPanelWidth, chatWidth])

  // Debounce ref: auto-save notes 1s after user stops typing
  const notesDebounceRef = useRef(null)
  const latestNotesRef = useRef(notes)

  useEffect(() => {
    latestNotesRef.current = notes
  }, [notes])

  useEffect(() => {
    api
      .get(`/api/papers/${paperId}`)
      .then((res) => {
        setPaper(res.data)
        setNotes(res.data.notes || '')
        latestNotesRef.current = res.data.notes || ''
        const rawTags = res.data.tags
        if (Array.isArray(rawTags)) {
          setTags(rawTags.join(', '))
        } else {
          setTags(rawTags || '')
        }
      })
      .catch(() => {})
    api
      .get(`/api/papers/${paperId}/files`)
      .then((res) => setFiles(res.data))
      .catch(() => {})
  }, [paperId])

  const saveNotes = async (value) => {
    const notesToSave = value !== undefined ? value : latestNotesRef.current
    try {
      const res = await api.patch(`/api/papers/${paperId}`, { notes: notesToSave })
      setPaper(res.data)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    } catch (err) {
      console.error('Save notes failed', err)
    }
  }

  const handleNotesChange = (e) => {
    const value = e.target.value
    setNotes(value)
    latestNotesRef.current = value
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
    notesDebounceRef.current = setTimeout(() => {
      saveNotes(value)
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
    }
  }, [])

  const saveTags = async () => {
    try {
      const normalized = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      await api.post(`/api/papers/${paperId}/tags`, { tags: normalized })
      const res = await api.get(`/api/papers/${paperId}`)
      setPaper(res.data)
      setTagsSaved(true)
      setTimeout(() => setTagsSaved(false), 2000)
    } catch (err) {
      console.error('Save tags failed', err)
    }
  }

  const translateAbstract = async () => {
    if (!paper?.abstract || abstractTranslating) return
    setAbstractTranslating(true)
    try {
      await api.post(`/api/papers/${paperId}/translate-abstract`, null, {
        params: selectedModelId ? { config_id: selectedModelId } : {},
      })
      // Poll until abstract_zh is set
      const poll = setInterval(async () => {
        try {
          const res = await api.get(`/api/papers/${paperId}`)
          if (res.data.abstract_zh) {
            setPaper(res.data)
            setAbstractTranslating(false)
            clearInterval(poll)
          }
        } catch { /* ignore */ }
      }, 3000)
      // Stop polling after 2 minutes
      setTimeout(() => { clearInterval(poll); setAbstractTranslating(false) }, 120000)
    } catch (err) {
      console.error('Translate abstract failed', err)
      setAbstractTranslating(false)
    }
  }

  const openViewer = () => {
    const cw = containerRef.current?.clientWidth || containerWidthRef.current || 1200
    setInfoPanelWidth(Math.max(280, Math.round(cw * 0.28)))
    setIsAnimating(true)
    setViewerOpen(true)
    setTimeout(() => setIsAnimating(false), 350)
  }

  const closeViewer = () => {
    setIsAnimating(true)
    setViewerOpen(false)
    setTimeout(() => setIsAnimating(false), 350)
  }

  // Narrow screen check: disable three-panel if too narrow
  const isNarrow = (containerRef.current?.clientWidth || containerWidthRef.current || 1200) < 768

  if (!paper) {
    return (
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
          <div
            className="rounded-md border p-4"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
          >
            <Skeleton className="h-4 w-16 mb-3" />
            <Skeleton lines={5} />
          </div>
        </div>
      </div>
    )
  }

  const transitionClass = isAnimating ? 'panel-transition' : ''

  // Paper info content (shared between both modes)
  const paperInfoContent = (
    <>
      {/* Title + Meta */}
      <div>
        <h2
          className="text-xl font-semibold mb-1 leading-snug"
          style={{ color: 'var(--text-primary)' }}
        >
          {paper.title}
        </h2>
        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
          {paper.authors}
        </p>
        <div className="flex flex-wrap gap-2 text-xs mb-3">
          {paper.category && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              {paper.category}
            </span>
          )}
          {paper.source && (
            <Badge variant="neutral">{paper.source}</Badge>
          )}
          {paper.relevance != null && (
            <Badge variant="neutral">相关度: {paper.relevance}</Badge>
          )}
          {paper.published_date && (
            <Badge variant="neutral">
              {new Date(paper.published_date).toLocaleDateString('zh-CN')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {paper.link && (
            <a
              href={paper.link}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline inline-flex items-center gap-1"
              style={{ color: 'var(--accent)' }}
            >
              查看原文
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
          <button
            onClick={viewerOpen ? closeViewer : openViewer}
            className="text-sm inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors"
            style={{
              color: viewerOpen ? 'var(--text-primary)' : 'var(--accent)',
              backgroundColor: viewerOpen ? 'var(--bg-tertiary, var(--bg-secondary))' : 'var(--accent-light)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {viewerOpen ? '关闭文档' : `查看文档${files.length > 0 ? ` (${files.length})` : ''}`}
          </button>
        </div>
      </div>

      {/* Abstract */}
      <div
        className="rounded-md border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            摘要
          </h3>
          {paper.abstract && !paper.abstract_zh && (
            <button
              onClick={translateAbstract}
              disabled={abstractTranslating}
              className="text-xs px-2 py-1 rounded-md transition-colors inline-flex items-center gap-1"
              style={{
                color: abstractTranslating ? 'var(--text-secondary)' : 'var(--accent)',
                backgroundColor: abstractTranslating ? 'var(--bg-secondary)' : 'var(--accent-light)',
              }}
            >
              {abstractTranslating && (
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="15" />
                </svg>
              )}
              {abstractTranslating ? '翻译中...' : '翻译摘要'}
            </button>
          )}
        </div>
        <p
          className="text-sm whitespace-pre-wrap leading-relaxed"
          style={{ color: 'var(--text-primary)' }}
        >
          {paper.abstract || '暂无摘要'}
        </p>
        {paper.abstract_zh && (
          <div
            className="mt-3 pt-3"
            style={{ borderTop: '1px dashed var(--border)' }}
          >
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded mb-1.5 inline-block"
              style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              中文翻译
            </span>
            <p
              className="text-sm whitespace-pre-wrap leading-relaxed mt-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {paper.abstract_zh}
            </p>
          </div>
        )}
      </div>

      {/* Notes */}
      <div
        className="rounded-md border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          笔记
        </h3>
        <textarea
          value={notes}
          onChange={handleNotesChange}
          placeholder="记录你的阅读笔记..."
          className="w-full min-h-28 rounded-md border px-3 py-2 text-sm outline-none resize-y"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={() => saveNotes()}>
            保存笔记
          </Button>
          {notesSaved && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              已保存
            </span>
          )}
        </div>
      </div>

      {/* Tags */}
      <div
        className="rounded-md border p-4"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
      >
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          标签
        </h3>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="逗号分隔的标签，如：LLM, 多模态, 检索增强"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={saveTags}>
            保存标签
          </Button>
          {tagsSaved && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              已保存
            </span>
          )}
        </div>
      </div>
    </>
  )

  const showInline = viewerOpen && !isNarrow

  // ── Mobile layout ──
  if (isMobile) {
    return (
      <div
        className="overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
        }}
      >
        {/* 论文信息 */}
        <div className="p-4 space-y-4">
          {paperInfoContent}
        </div>

        {/* 可折叠：文档查看器 */}
        {files.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setMobileViewerOpen(!mobileViewerOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
              style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}
            >
              <span className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                查看文档 ({files.length})
              </span>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                style={{ transform: mobileViewerOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {mobileViewerOpen && (
              <div style={{ maxHeight: '50vh', overflow: 'auto', borderTop: '1px solid var(--border)' }}>
                <InlineFileViewer
                  paperId={paperId}
                  files={files}
                  onFilesChange={setFiles}
                  onClose={() => setMobileViewerOpen(false)}
                  initialFileId={initialFileId}
                />
              </div>
            )}
          </div>
        )}

        {/* 可折叠：AI 分析 */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setMobileChatOpen(!mobileChatOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
            style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              AI 分析
            </span>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: mobileChatOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {mobileChatOpen && (
            <div style={{ height: '60vh', borderTop: '1px solid var(--border)' }}>
              <AIChatPanel paper={paper} />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Desktop layout ──
  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      {/* Left: Paper Info */}
      <div
        className={`overflow-y-auto p-6 flex-shrink-0 ${transitionClass}`}
        style={{
          width: showInline ? infoPanelWidth : undefined,
          flex: showInline ? 'none' : '1',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div className={showInline ? 'space-y-4' : 'mx-auto max-w-3xl space-y-4'}>
          {paperInfoContent}
        </div>
      </div>

      {/* Handle1: info ↔ viewer (only in three-panel mode) */}
      {showInline && <ResizeHandle onMouseDown={handleInfoResize} />}

      {/* Center: Inline File Viewer (only in three-panel mode) */}
      {showInline && (
        <div
          className={`min-w-0 overflow-hidden ${transitionClass}`}
          style={{ flex: 1 }}
        >
          <InlineFileViewer
            paperId={paperId}
            files={files}
            onFilesChange={setFiles}
            onClose={closeViewer}
            initialFileId={initialFileId}
          />
        </div>
      )}

      {/* Handle2: (info or viewer) ↔ chat */}
      <ResizeHandle onMouseDown={handleChatResize} />

      {/* Right: AI Chat */}
      <div
        className={`flex-shrink-0 flex flex-col ${transitionClass}`}
        style={{ width: chatWidth, backgroundColor: 'var(--bg-primary)' }}
      >
        <AIChatPanel paper={paper} />
      </div>
    </div>
  )
}
