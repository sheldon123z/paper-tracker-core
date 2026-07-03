import { getWorkflowTemplate } from './templates'
import AppIcon from '../ui/AppIcon'

const STAGE_ORDER = ['queued', 'normalize', 'search', 'select', 'analysis', 'trends', 'comparison', 'gap', 'submission', 'synthesis', 'discussion', 'completed']

function normalizeStage(value) {
  if (!value) return 'queued'
  const raw = String(value).trim().toLowerCase()
  const aliasMap = {
    supervisor: 'synthesis',
    search_agent: 'search',
    select_agent: 'select',
    analysis_agent: 'analysis',
    writing_agent: 'synthesis',
    paper_selection: 'select',
    trend_analysis: 'trends',
    gap_analysis: 'gap',
    submission_planning: 'submission',
    finished: 'completed',
  }
  return aliasMap[raw] || raw
}

function stageToIcon(stage) {
  switch (stage) {
    case 'search': return 'search'
    case 'normalize': return 'normalize'
    case 'select': return 'select'
    case 'analysis': return 'analysis'
    case 'trends': return 'trends'
    case 'comparison': return 'comparison'
    case 'gap': return 'gap'
    case 'submission': return 'submission'
    case 'synthesis': return 'synthesis'
    case 'discussion': return 'discussion'
    case 'completed': return 'completed'
    default: return 'queued'
  }
}

export default function ActiveAgentIndicator({
  templateId,
  currentStage,
  completedAgents = [],
  stepTimings = {},
}) {
  const template = getWorkflowTemplate(templateId)
  const stageLabels = template?.stageLabels || {}
  const activeStage = normalizeStage(currentStage)
  const completedSet = new Set(
    (Array.isArray(completedAgents) ? completedAgents : []).map((item) => normalizeStage(item)),
  )

  const visibleStages = STAGE_ORDER.filter((stage) => stageLabels[stage])

  return (
    <div className="wf-timeline">
      {visibleStages.map((stage, idx) => {
        const isActive = activeStage === stage
        const isDone = completedSet.has(stage) || (stage === 'completed' && activeStage === 'completed')
        const activeIdx = visibleStages.indexOf(activeStage)
        const isPast = idx < activeIdx || isDone

        let dotClass = 'wf-timeline-dot'
        if (isActive) dotClass += ' wf-timeline-dot--active'
        else if (isDone) dotClass += ' wf-timeline-dot--done'

        let labelClass = 'wf-timeline-label'
        if (isActive) labelClass += ' wf-timeline-label--active'
        else if (isDone) labelClass += ' wf-timeline-label--done'

        let stepClass = 'wf-timeline-step'
        if (isActive) stepClass += ' wf-timeline-step--active'
        else if (isDone) stepClass += ' wf-timeline-step--done'
        else if (isPast) stepClass += ' wf-timeline-step--past'

        return (
          <div key={stage} className={stepClass}>
            <div className="wf-timeline-node">
              <div className={dotClass}>
                <span>{isDone && !isActive ? <AppIcon name="check" size={14} /> : <AppIcon name={stageToIcon(stage)} size={14} />}</span>
              </div>
              <span className={labelClass}>{stageLabels[stage]}</span>
              {isDone && stepTimings[stage] && (
                <span className="wf-timeline-timing">{stepTimings[stage]}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
