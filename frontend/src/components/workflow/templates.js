import workflowTemplatesSource from '../../../../shared/workflow_templates.json'

function resolveTemplateIcon(templateId) {
  switch (templateId) {
    case 'literature_survey':
      return 'book'
    case 'trend_radar':
      return 'radar'
    case 'paper_comparison':
      return 'comparison'
    case 'gap_finder':
      return 'gap'
    case 'submission_prep':
      return 'submission'
    default:
      return 'workflow'
  }
}

function cloneStep(step) {
  return { ...step }
}

function normalizeTemplate(template, commonSteps) {
  const ui = template.ui || {}
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    status: template.status || 'active',
    icon: resolveTemplateIcon(template.id),
    color: ui.color || '#3b82f6',
    resultLabel: ui.resultLabel || '工作流结果',
    stageLabels: { ...(ui.stageLabels || {}) },
    steps: [...(commonSteps || []).map(cloneStep), ...((ui.steps || []).map(cloneStep))],
  }
}

const commonSteps = Array.isArray(workflowTemplatesSource.commonSteps)
  ? workflowTemplatesSource.commonSteps
  : []

export const WORKFLOW_TEMPLATES = Array.isArray(workflowTemplatesSource.templates)
  ? workflowTemplatesSource.templates.map((template) => normalizeTemplate(template, commonSteps))
  : []

export const WORKFLOW_TEMPLATE_MAP = Object.fromEntries(
  WORKFLOW_TEMPLATES.map((template) => [template.id, template]),
)

export function getWorkflowTemplate(templateId) {
  return WORKFLOW_TEMPLATE_MAP[templateId] || null
}
