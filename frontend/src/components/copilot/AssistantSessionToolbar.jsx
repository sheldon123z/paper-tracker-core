import { useEffect, useRef, useState } from 'react'

export default function AssistantSessionToolbar({
  currentSessionId,
  loading = false,
  sessions,
  onClose,
  onNewSession,
  onSelectSession,
  showSessionScope = false,
  surfaceId = 'assistant',
  title = '研究助手',
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const switcherRef = useRef(null)
  const triggerRef = useRef(null)
  const selectedIndex = sessions.findIndex((session) => session.session_id === currentSessionId)
  const selectedSession = selectedIndex >= 0 ? sessions[selectedIndex] : null
  const listboxId = `assistant-session-listbox-${surfaceId}`

  useEffect(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }, [selectedIndex])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (!switcherRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const closeAndFocus = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const chooseSession = (sessionId) => {
    onSelectSession(sessionId)
    closeAndFocus()
  }

  const moveActive = (step) => {
    if (sessions.length === 0) return
    setActiveIndex((current) => {
      const start = current >= 0 ? current : selectedIndex >= 0 ? selectedIndex : 0
      return (start + step + sessions.length) % sessions.length
    })
  }

  const handleTriggerKeyDown = (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) setOpen(true)
        else moveActive(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!open) setOpen(true)
        else moveActive(-1)
        break
      case 'Home':
        if (!open || sessions.length === 0) return
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        if (!open || sessions.length === 0) return
        event.preventDefault()
        setActiveIndex(sessions.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (!open) setOpen(true)
        else if (sessions[activeIndex]) chooseSession(sessions[activeIndex].session_id)
        break
      case 'Escape':
        if (!open) return
        event.preventDefault()
        closeAndFocus()
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        break
    }
  }

  return (
    <div className="assistant-session-toolbar">
      <div className="assistant-session-toolbar__topline">
        <div className="assistant-session-toolbar__identity">
          <span className="assistant-session-toolbar__mark" aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="assistant-session-toolbar__title">{title}</span>
        </div>
        <div className="assistant-session-toolbar__actions">
          <button
            type="button"
            className="assistant-session-toolbar__action"
            onClick={onNewSession}
            disabled={loading}
            aria-label="新建聊天"
            title="新建聊天"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {onClose && (
            <button
              type="button"
              className="assistant-session-toolbar__action"
              onClick={onClose}
              aria-label="关闭研究助手"
              title="关闭研究助手"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="assistant-session-toolbar__switcher" ref={switcherRef}>
        <button
          ref={triggerRef}
          type="button"
          className="assistant-session-toolbar__selector"
          role="combobox"
          aria-label="切换聊天记录"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-busy={loading}
          disabled={loading}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={handleTriggerKeyDown}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5M12 7v5l3 2" />
          </svg>
          <span className="assistant-session-toolbar__current">
            {loading
              ? '正在加载会话…'
              : selectedSession?.title || '选择聊天记录'}
          </span>
          <svg className="assistant-session-toolbar__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m7 10 5 5 5-5" />
          </svg>
        </button>

        {open && (
          <div className="assistant-session-toolbar__menu" id={listboxId} role="listbox" aria-label="聊天记录">
            {loading ? (
              <div className="assistant-session-toolbar__empty">正在加载会话…</div>
            ) : sessions.length === 0 ? (
              <div className="assistant-session-toolbar__empty">暂无聊天记录</div>
            ) : sessions.map((session, index) => {
              const selected = session.session_id === currentSessionId
              const active = index === activeIndex
              return (
                <button
                  type="button"
                  key={session.session_id}
                  id={`${listboxId}-option-${index}`}
                  className={[
                    'assistant-session-toolbar__option',
                    selected ? 'is-selected' : '',
                    active ? 'is-active' : '',
                  ].filter(Boolean).join(' ')}
                  role="option"
                  aria-selected={selected}
                  onClick={() => chooseSession(session.session_id)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="assistant-session-toolbar__option-content">
                    <span className="assistant-session-toolbar__option-title">
                      {session.title || '未命名会话'}
                    </span>
                    {showSessionScope && (
                      <span className="assistant-session-toolbar__option-scope">
                        {session.paper_title ? `论文 · ${session.paper_title}` : '全局会话'}
                      </span>
                    )}
                  </span>
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12 4 4L19 6" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
