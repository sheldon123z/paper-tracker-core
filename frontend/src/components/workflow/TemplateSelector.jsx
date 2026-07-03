/**
 * TemplateSelector — 工作流模板选择网格
 */

import { WORKFLOW_TEMPLATES } from './templates'
import AppIcon from '../ui/AppIcon'

export default function TemplateSelector({ onSelectTemplate, recentSessions = [], historyLoading, historyError, onOpenSession }) {
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

function RecentSessions({ sessions, loading, error, onOpenSession }) {
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
          return (
            <button
              key={session.session_id}
              className="wf-session-btn"
              onClick={() => onOpenSession?.(session.session_id)}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {session.title || session.research_topic || '未命名工作流'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {session.research_topic || '未命名主题'}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: session.workflow_status === 'completed' ? '#22c55e' : session.workflow_status === 'running' ? 'var(--accent)' : 'var(--text-secondary)',
                }} />
                {stageLabel}
              </div>
            </button>
          )
        })}
      </div>
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
