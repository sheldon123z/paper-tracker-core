/**
 * WorkflowTabBar — 工作流实例 Tab 栏
 */

import AppIcon from '../ui/AppIcon'

const MAX_TOPIC_LEN = 20

function truncate(str, max) {
  if (!str) return '未命名'
  return str.length > max ? str.slice(0, max) + '…' : str
}

function phaseColor(phase) {
  switch (phase) {
    case 'COMPLETED': return '#16a34a'
    case 'EXECUTING': return '#2563eb'
    default: return 'var(--text-secondary)'
  }
}

export default function WorkflowTabBar({ tabs = [], activeTabId, onSelectTab, onCloseTab, onNewTab }) {
  return (
    <div className="wf-tabbar">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            className={`wf-tab ${isActive ? 'wf-tab--active' : ''}`}
            onClick={() => onSelectTab?.(tab.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelectTab?.(tab.id) }}
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-glass bg-primary/28 text-accent">
              <AppIcon name={tab.templateIcon || 'workflow'} size={13} />
            </span>
            <span className="wf-tab-status" style={{ backgroundColor: phaseColor(tab.phase) }} />
            <span>{truncate(tab.topic, MAX_TOPIC_LEN)}</span>
            <button
              className="wf-tab-close"
              aria-label={`关闭 ${tab.topic}`}
              onClick={(e) => { e.stopPropagation(); onCloseTab?.(tab.id) }}
            >
              <AppIcon name="close" size={12} />
            </button>
          </div>
        )
      })}

      <button className="wf-tab-new" onClick={onNewTab} title="新建工作流" aria-label="新建工作流">
        <AppIcon name="plus" size={13} />
      </button>
    </div>
  )
}
