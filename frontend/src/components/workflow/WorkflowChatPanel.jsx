import { useState } from 'react'
import { CopilotChat } from '@copilotkit/react-core/v2'
import { getWorkflowTemplate } from './templates'
import { WORKFLOW_LABELS } from '../copilot/chatLabels'
import AppIcon from '../ui/AppIcon'

function statusColor(status) {
  switch ((status || '').toLowerCase()) {
    case 'completed': return { fg: '#16a34a', bg: 'rgba(34,197,94,0.12)' }
    case 'running': return { fg: '#2563eb', bg: 'rgba(59,130,246,0.12)' }
    case 'failed':
    case 'error': return { fg: '#dc2626', bg: 'rgba(239,68,68,0.12)' }
    default: return { fg: 'var(--text-secondary)', bg: 'var(--bg-secondary)' }
  }
}

const STAGE_SUGGESTIONS = {
  search: [
    { title: '缩小到近一年', message: '请将检索范围缩小到近一年的论文' },
    { title: '增加关键词', message: '请增加以下关键词进行检索：' },
    { title: '限定顶会', message: '请优先检索顶会论文（如 NeurIPS, ICML, ACL, EMNLP）' },
  ],
  analysis: [
    { title: '对比方法论', message: '请对比这几篇论文的研究方法' },
    { title: '梳理时间线', message: '请按时间线梳理这些研究的演进过程' },
    { title: '突出创新点', message: '请重点分析每篇论文的核心创新点' },
  ],
  synthesis: [
    { title: '突出研究空白', message: '在报告中重点突出研究空白分析' },
    { title: '添加对比表', message: '请生成一个方法对比表格' },
    { title: '总结趋势', message: '请总结该领域的发展趋势和未来方向' },
  ],
  completed: [
    { title: '导出 Markdown', message: '请将报告导出为 Markdown 格式' },
    { title: '生成摘要', message: '请生成一段 200 字以内的研究综述摘要' },
    { title: '推荐阅读', message: '基于分析结果，推荐最值得深读的 3 篇论文' },
  ],
}

export default function WorkflowChatPanel({
  threadId,
  templateId,
  topic,
  currentStage,
  workflowStatus,
  disabled,
}) {
  const [chatError, setChatError] = useState(null)
  const template = getWorkflowTemplate(templateId)
  const badge = statusColor(workflowStatus)
  const stageLabel = template?.stageLabels?.[currentStage] || currentStage
  const threadPreview = threadId ? `${threadId.slice(0, 12)}...` : ''

  const dynamicPlaceholder = stageLabel
    ? `当前阶段: ${stageLabel} — 可补充约束或提出疑问...`
    : '继续补充约束，例如"优先看近两年顶会论文"...'

  if (!threadId || disabled) {
    return (
      <div className="wf-chat-placeholder">
        <div style={{ maxWidth: 280, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--text-secondary)' }}>
          <div style={{ opacity: 0.8, display: 'flex', justifyContent: 'center' }}>
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-glass bg-primary/32 text-accent">
              <AppIcon name={template?.icon || 'assistant'} size={30} />
            </span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            工作流对话面板
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            先在左侧选择模板并启动工作流。启动后可在此追问、补充约束或要求重跑某个阶段。
          </div>
        </div>
      </div>
    )
  }

  return (
    <aside className="wf-chat-panel">
      <div className="wf-chat-header">
        <div className="wf-chat-header__top">
          <span className="wf-chat-header__icon">
            <AppIcon name={template?.icon || 'assistant'} size={20} />
          </span>
          <div className="wf-chat-header__intro">
            <div className="wf-chat-header__kicker">Workflow Console</div>
            <div className="wf-chat-header__title-row">
              <div className="wf-chat-header__title">{template?.name || '科研工作流'}</div>
              <div className="wf-chat-header__thread">{threadPreview}</div>
            </div>
          </div>
        </div>

        <div className="wf-chat-header__topic">
          <div className="wf-chat-header__topic-label">研究主题</div>
          <div className="wf-chat-header__topic-value">{topic || '未命名主题'}</div>
        </div>

        <div className="wf-chat-header__chips">
          <span className="wf-chat-chip" style={{ color: badge.fg, backgroundColor: badge.bg }}>
            {workflowStatus || 'idle'}
          </span>
          {stageLabel && (
            <span className="wf-chat-chip wf-chat-chip--secondary">
              {stageLabel}
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {chatError && (
          <div className="wf-chat-error" role="alert">
            对话连接已中断：{chatError}。工作流状态仍会从服务端恢复。
          </div>
        )}
        <CopilotChat
          agentId="workflowAgent"
          threadId={threadId}
          onError={({ error }) => setChatError(error?.message || '未知错误')}
          labels={{
            ...WORKFLOW_LABELS,
            chatInputPlaceholder: dynamicPlaceholder,
          }}
          suggestions={STAGE_SUGGESTIONS[currentStage] || []}
          className="absolute inset-0"
        />
      </div>
    </aside>
  )
}
