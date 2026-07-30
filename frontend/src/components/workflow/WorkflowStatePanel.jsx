/**
 * WorkflowStatePanel — 工作流 Phase 路由器（核心组件）
 *
 * 根据 phase prop 渲染对应的子面板:
 *   TEMPLATE_SELECT  → TemplateSelector
 *   PARAMS_INPUT     → ParamsForm
 *   EXECUTING        → ExecutionPanel
 *   PAPER_SELECTION  → ExecutionPanel
 *   COMPLETED        → CompletionPanel
 *
 * 用法示例:
 *   <WorkflowStatePanel
 *     phase="TEMPLATE_SELECT"
 *     template={selectedTemplate}
 *     params={workflowParams}
 *     agentState={agent?.state}
 *     onSelectTemplate={handleSelectTemplate}
 *     onStartWorkflow={handleStart}
 *     onBackToTemplates={() => setPhase('TEMPLATE_SELECT')}
 *     onNewWorkflow={handleNewWorkflow}
 *   />
 */

import TemplateSelector from './TemplateSelector'
import ParamsForm from './ParamsForm'
import ExecutionPanel from './ExecutionPanel'
import CompletionPanel from './CompletionPanel'

export default function WorkflowStatePanel({
  phase,
  template,
  templateId,
  params,
  agentState,
  recentSessions,
  historyLoading,
  historyError,
  onOpenSession,
  onDeleteSession,
  deletingSessionId,
  onSelectTemplate,
  onStartWorkflow,
  onBackToTemplates,
  onNewWorkflow,
}) {
  switch (phase) {
    case 'PARAMS_INPUT':
      return (
        <ParamsForm
          template={template}
          onStart={onStartWorkflow}
          onBack={onBackToTemplates}
        />
      )

    case 'EXECUTING':
    case 'PAPER_SELECTION':
      return (
        <ExecutionPanel
          agentState={agentState}
          params={params}
          templateId={templateId}
        />
      )

    case 'COMPLETED':
      return (
        <CompletionPanel
          agentState={agentState}
          templateId={templateId}
          onNewWorkflow={onNewWorkflow}
        />
      )

    case 'TEMPLATE_SELECT':
    default:
      return (
        <TemplateSelector
          onSelectTemplate={onSelectTemplate}
          recentSessions={recentSessions}
          historyLoading={historyLoading}
          historyError={historyError}
          onOpenSession={onOpenSession}
          onDeleteSession={onDeleteSession}
          deletingSessionId={deletingSessionId}
        />
      )
  }
}
