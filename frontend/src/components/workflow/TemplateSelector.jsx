/**
 * TemplateSelector — 工作流模板选择网格
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { WORKFLOW_TEMPLATES } from './templates'
import { AppIcon, Button, Modal } from '../ui'

export default function TemplateSelector({
  onSelectTemplate,
  recentSessions = [],
  historyLoading,
  historyError,
  onOpenSession,
  onDeleteSession,
  deletingSessionId,
}) {
  return (
    <div className="wf-dot-grid" style={{ padding: '40px 32px', minHeight: '100%' }}>
      {/* 标题区 */}
      <div className="wf-fade-up" style={{ marginBottom: 36, textAlign: 'center' }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-light) 0%, rgba(99,102,241,0.08) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            margin: '0 auto 18px',
            boxShadow: '0 4px 16px rgba(59,130,246,0.1)',
          }}
        >
          <AppIcon name="workflow" size={28} />
        </div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          科研工作流
        </h2>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--text-secondary)',
            margin: 0,
            lineHeight: 1.65,
            maxWidth: 400,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          选择模板启动 AI 驱动的研究流程，从文献检索到报告生成全程自动化
        </p>
      </div>

      <RecentSessions
        sessions={recentSessions}
        loading={historyLoading}
        error={historyError}
        onOpenSession={onOpenSession}
        onDeleteSession={onDeleteSession}
        deletingSessionId={deletingSessionId}
      />

      {/* 模板卡片网格 */}
      <div
        className="wf-stagger"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: 18,
        }}
      >
        {WORKFLOW_TEMPLATES.map((template) => {
          const isActive = template.status === 'active'
          return (
            <TemplateCard
              key={template.id}
              template={template}
              isActive={isActive}
              onClick={() => isActive && onSelectTemplate?.(template)}
            />
          )
        })}
      </div>
    </div>
  )
}

function RecentSessions({
  sessions,
  loading,
  error,
  onOpenSession,
  onDeleteSession,
  deletingSessionId,
}) {
  const [contextMenu, setContextMenu] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const menuRef = useRef(null)
  const menuItemRef = useRef(null)
  const openerRef = useRef(null)
  const deletionFocusFallbackRef = useRef(null)

  const restoreOpenerFocus = useCallback(() => {
    window.requestAnimationFrame?.(() => openerRef.current?.focus())
  }, [])

  const closeContextMenu = useCallback((restoreFocus = true) => {
    setContextMenu(null)
    if (restoreFocus) restoreOpenerFocus()
  }, [restoreOpenerFocus])

  const focusRelativeToOpener = useCallback((direction) => {
    const opener = openerRef.current
    if (!opener) return
    const focusable = Array.from(document.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.closest('[hidden]') && element.getAttribute('aria-hidden') !== 'true')
    const openerIndex = focusable.indexOf(opener)
    const target = focusable[openerIndex + direction]
    window.requestAnimationFrame?.(() => target?.focus())
  }, [])

  useEffect(() => {
    if (!contextMenu) return undefined

    const focusFrame = window.requestAnimationFrame?.(() => menuItemRef.current?.focus())
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) closeContextMenu(false)
    }
    const handleKeyboardClose = (event) => {
      if (event.key === 'Escape') closeContextMenu()
      if (event.key === 'Tab') {
        event.preventDefault()
        closeContextMenu(false)
        focusRelativeToOpener(event.shiftKey ? -1 : 1)
      }
    }
    const handleViewportChange = () => closeContextMenu(false)

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyboardClose)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      if (focusFrame !== undefined) window.cancelAnimationFrame?.(focusFrame)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyboardClose)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [closeContextMenu, contextMenu, focusRelativeToOpener])

  const openMenuAt = useCallback((session, opener, x, y) => {
    const menuWidth = 176
    const menuHeight = 52
    openerRef.current = opener
    setContextMenu({
      session,
      x: Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8)),
    })
  }, [])

  const openPointerMenu = useCallback((event, session) => {
    event.preventDefault()
    openMenuAt(session, event.currentTarget, event.clientX, event.clientY)
  }, [openMenuAt])

  const openButtonMenu = useCallback((event, session) => {
    const rect = event.currentTarget.getBoundingClientRect()
    openMenuAt(session, event.currentTarget, rect.right - 176, rect.bottom + 6)
  }, [openMenuAt])

  const openKeyboardMenu = useCallback((event, session) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    openMenuAt(session, event.currentTarget, rect.left + 16, rect.bottom + 6)
  }, [openMenuAt])

  const requestDelete = useCallback(() => {
    if (!contextMenu) return
    const row = openerRef.current?.closest('.wf-session-row')
    deletionFocusFallbackRef.current = (
      row?.nextElementSibling?.querySelector('.wf-session-btn')
      || row?.previousElementSibling?.querySelector('.wf-session-btn')
      || document.querySelector('.wf-template-card[tabindex="0"]')
    )
    setDeleteTarget(contextMenu.session)
    closeContextMenu(false)
  }, [closeContextMenu, contextMenu])

  const closeDeleteDialog = useCallback(() => {
    if (deleteTarget?.session_id === deletingSessionId) return
    setDeleteTarget(null)
    restoreOpenerFocus()
  }, [deleteTarget?.session_id, deletingSessionId, restoreOpenerFocus])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deleteTarget.session_id === deletingSessionId) return
    try {
      await onDeleteSession?.(deleteTarget.session_id)
      setDeleteTarget(null)
      const fallback = deletionFocusFallbackRef.current
      window.requestAnimationFrame?.(() => fallback?.isConnected && fallback.focus())
    } catch {
      // The page-level handler shows the request error and keeps this dialog open for retry.
    }
  }, [deleteTarget, deletingSessionId, onDeleteSession, restoreOpenerFocus])

  if (loading) {
    return (
      <div className="wf-fade-up" style={{ marginBottom: 28, padding: '18px 20px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          最近工作流
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>正在加载历史会话...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="wf-fade-up" style={{ marginBottom: 28, padding: '18px 20px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          最近工作流
        </div>
        <div style={{ fontSize: 12.5, color: '#b91c1c' }}>{error}</div>
      </div>
    )
  }

  if (!sessions.length) return null

  return (
    <div className="wf-fade-up" style={{ marginBottom: 28, padding: '18px 20px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        最近工作流
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sessions.slice(0, 5).map((session) => {
          const template = WORKFLOW_TEMPLATES.find((item) => item.id === session.template_id)
          const stageLabel = template?.stageLabels?.[session.current_stage] || session.current_stage || '已创建'
          const sessionTitle = session.title || session.research_topic || '未命名工作流'
          return (
            <div key={session.session_id} className="wf-session-row">
              <button
                type="button"
                className="wf-session-btn"
                onClick={() => onOpenSession?.(session.session_id)}
                onContextMenu={(event) => openPointerMenu(event, session)}
                onKeyDown={(event) => openKeyboardMenu(event, session)}
                aria-keyshortcuts="Shift+F10"
                title="打开工作流；右键可查看更多操作"
              >
                <div style={{ minWidth: 0 }}>
                  <div className="wf-session-title">
                    {sessionTitle}
                  </div>
                  <div className="wf-session-topic">
                    {session.research_topic || '未命名主题'}
                  </div>
                </div>
                <div className="wf-session-stage">
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: session.workflow_status === 'completed' ? '#22c55e' : session.workflow_status === 'running' ? 'var(--accent)' : 'var(--text-secondary)',
                  }} />
                  {stageLabel}
                </div>
              </button>
              <button
                type="button"
                className="wf-session-actions"
                onClick={(event) => openButtonMenu(event, session)}
                aria-label={`“${sessionTitle}”更多操作`}
                aria-haspopup="menu"
                aria-expanded={contextMenu?.session.session_id === session.session_id}
                title="更多操作"
              >
                <AppIcon name="more-vertical" size={17} />
              </button>
            </div>
          )
        })}
      </div>

      {contextMenu && createPortal((
        <div
          ref={menuRef}
          role="menu"
          aria-label={`“${contextMenu.session.title || contextMenu.session.research_topic || '未命名工作流'}”操作`}
          className="wf-session-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            ref={menuItemRef}
            type="button"
            role="menuitem"
            className="wf-session-menu__danger"
            onClick={requestDelete}
          >
            <AppIcon name="trash" size={15} />
            删除工作流
          </button>
        </div>
      ), document.body)}

      <Modal
        isOpen={!!deleteTarget}
        onClose={closeDeleteDialog}
        title="删除工作流"
        size="sm"
        actions={(
          <>
            <Button
              variant="secondary"
              disabled={deleteTarget?.session_id === deletingSessionId}
              onClick={closeDeleteDialog}
            >
              取消
            </Button>
            <Button
              variant="danger"
              loading={deleteTarget?.session_id === deletingSessionId}
              onClick={confirmDelete}
            >
              确认删除
            </Button>
          </>
        )}
      >
        <p className="leading-6">
          确定删除“{deleteTarget?.title || deleteTarget?.research_topic || '未命名工作流'}”吗？
        </p>
        <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-5 text-danger">
          该工作流及其对话记录将永久删除，此操作不可撤销。
        </p>
      </Modal>
    </div>
  )
}

function TemplateCard({ template, isActive, onClick }) {
  return (
    <div
      role={isActive ? 'button' : undefined}
      tabIndex={isActive ? 0 : undefined}
      aria-disabled={!isActive}
      onClick={onClick}
      onKeyDown={(e) => {
        if (isActive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={`wf-template-card wf-fade-up ${!isActive ? 'wf-template-card--disabled' : ''}`}
      style={{
        '--card-accent': template.color,
        '--card-accent-alpha': `${template.color}0a`,
      }}
    >
      {!isActive && <span className="wf-template-coming">即将推出</span>}

      <div className="wf-template-icon"><AppIcon name={template.icon} size={30} /></div>

      <h3 className="wf-template-name">{template.name}</h3>

      <p className="wf-template-desc">{template.description}</p>

      {isActive && <div className="wf-template-arrow">&#8594;</div>}
    </div>
  )
}
