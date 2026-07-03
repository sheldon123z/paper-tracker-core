import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ThreadsProvider } from '@copilotkit/react-core'
import { useAgent, UseAgentUpdate } from '@copilotkit/react-core/v2'

import api from '../api'
import useStore from '../store'
import WorkflowTabBar from '../components/workflow/WorkflowTabBar'
import WorkflowStatePanel from '../components/workflow/WorkflowStatePanel'
import WorkflowChatPanel from '../components/workflow/WorkflowChatPanel'
import { getWorkflowTemplate } from '../components/workflow/templates'

function createSessionId() {
  return `wf-${crypto.randomUUID()}`
}

function buildInitialWorkflowState(templateId, params) {
  return {
    template_id: templateId,
    workflow_status: 'running',
    current_stage: 'queued',
    active_agent: 'supervisor',
    completed_agents: [],
    completed_stages: [],
    research_topic: params?.topic || '',
    search_results: [],
    selected_papers: [],
    paper_analyses: [],
    trend_data: null,
    comparison_report: null,
    gap_report: null,
    submission_plan: null,
    final_report: null,
    recommendations: [],
  }
}

function buildWorkflowPrompt(template, params) {
  const detailLines = Object.entries(params || {})
    .filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length > 0))
    .map(([key, value]) => {
      const normalizedValue = Array.isArray(value) ? value.join('、') : value
      return `- ${key}: ${normalizedValue}`
    })

  return [
    `请启动 ${template?.name || '科研工作流'}。`,
    params?.topic ? `研究主题：${params.topic}` : null,
    detailLines.length > 0 ? '参数配置：' : null,
    ...detailLines,
    '请按工作流阶段执行，并把结构化结果持续写入状态。右侧对话将继续基于这个 workflow thread 追问。',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildInitialMessages(template, params) {
  return [
    {
      id: `wf-user-${crypto.randomUUID()}`,
      role: 'user',
      content: buildWorkflowPrompt(template, params),
    },
  ]
}

function derivePhase(tab) {
  if (!tab) return 'TEMPLATE_SELECT'
  return tab.agentState?.workflow_status === 'completed' ? 'COMPLETED' : (tab.phase || 'EXECUTING')
}

function mapStoredMessages(messages = []) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message, index) => ({
      id: message.id || `wf-history-${index}-${crypto.randomUUID()}`,
      role: message.role,
      content: message.content || '',
    }))
}

function buildTabFromSession(session, messages = []) {
  const template = getWorkflowTemplate(session.template_id)
  const params = session.template_params || {}
  const agentState = {
    ...buildInitialWorkflowState(session.template_id, params),
    ...(session.state_snapshot || {}),
    template_id: session.template_id,
    template_params: params,
  }

  return {
    id: session.session_id,
    sessionId: session.session_id,
    templateId: session.template_id,
    templateName: template?.name || session.template_id,
    templateIcon: template?.icon || 'workflow',
    topic: session.research_topic || params.topic || session.title || '未命名工作流',
    params,
    phase: agentState.workflow_status === 'completed' ? 'COMPLETED' : 'EXECUTING',
    messages: mapStoredMessages(messages),
    agentState,
    shouldAutoRun: false,
  }
}

export default function WorkflowPage() {
  const [tabs, setTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [draftTemplateId, setDraftTemplateId] = useState(null)
  const [recentSessions, setRecentSessions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)

  const setWorkflowContext = useStore((state) => state.setWorkflowContext)
  const clearWorkflowContext = useStore((state) => state.clearWorkflowContext)

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || null,
    [tabs, activeTabId],
  )
  const draftTemplate = useMemo(
    () => getWorkflowTemplate(draftTemplateId),
    [draftTemplateId],
  )

  useEffect(() => {
    if (activeTab) {
      setWorkflowContext({
        sessionId: activeTab.sessionId,
        templateId: activeTab.templateId,
        templateParams: activeTab.params,
        stateSnapshot: activeTab.agentState,
      })
      return
    }

    if (draftTemplate) {
      setWorkflowContext({
        sessionId: null,
        templateId: draftTemplate.id,
        templateParams: null,
        stateSnapshot: null,
      })
      return
    }

    clearWorkflowContext()
  }, [activeTab, clearWorkflowContext, draftTemplate, setWorkflowContext])

  useEffect(() => () => clearWorkflowContext(), [clearWorkflowContext])

  const patchTab = useCallback((tabId, updater) => {
    setTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.id !== tabId) return tab
        const patch = typeof updater === 'function' ? updater(tab) : updater
        if (!patch) return tab
        return { ...tab, ...patch }
      }),
    )
  }, [])

  const refreshWorkflowSessions = useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const response = await api.get('/api/agui/workflow/sessions')
      setRecentSessions(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : '加载 workflow 历史失败')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshWorkflowSessions().catch(() => {})
  }, [refreshWorkflowSessions])

  useEffect(() => {
    setRecentSessions((prevSessions) => {
      if (!tabs.length) return prevSessions
      const merged = new Map(prevSessions.map((session) => [session.session_id, session]))
      tabs.forEach((tab) => {
        merged.set(tab.sessionId, {
          session_id: tab.sessionId,
          title: `${tab.templateName} · ${tab.topic}`.slice(0, 128),
          template_id: tab.templateId,
          research_topic: tab.topic,
          workflow_status: tab.agentState?.workflow_status || 'running',
          current_stage: tab.agentState?.current_stage || 'queued',
          updated_at: new Date().toISOString(),
        })
      })
      return Array.from(merged.values())
    })
  }, [tabs])

  const handleSelectTemplate = useCallback((template) => {
    setDraftTemplateId(template?.id || null)
    setActiveTabId(null)
  }, [])

  const handleBackToTemplates = useCallback(() => {
    setDraftTemplateId(null)
    setActiveTabId(null)
  }, [])

  const handleNewWorkflow = useCallback(() => {
    setDraftTemplateId(null)
    setActiveTabId(null)
  }, [])

  const handleSelectTab = useCallback((tabId) => {
    setActiveTabId(tabId)
    setDraftTemplateId(null)
  }, [])

  const handleStartWorkflow = useCallback((params) => {
    const template = getWorkflowTemplate(draftTemplateId)
    if (!template) return

    const sessionId = createSessionId()
    const initialState = buildInitialWorkflowState(template.id, params)
    const initialMessages = buildInitialMessages(template, params)
    const nextTab = {
      id: sessionId,
      sessionId,
      templateId: template.id,
      templateName: template.name,
      templateIcon: template.icon,
      topic: params?.topic || '未命名工作流',
      params,
      phase: 'EXECUTING',
      messages: initialMessages,
      agentState: initialState,
      shouldAutoRun: true,
    }

    setTabs((prevTabs) => [...prevTabs, nextTab])
    setActiveTabId(sessionId)
    setDraftTemplateId(null)
    setRecentSessions((prevSessions) => [
      {
        session_id: sessionId,
        title: `${template.name} · ${nextTab.topic}`.slice(0, 128),
        template_id: template.id,
        research_topic: nextTab.topic,
        workflow_status: 'running',
        current_stage: 'queued',
        updated_at: new Date().toISOString(),
      },
      ...prevSessions.filter((session) => session.session_id !== sessionId),
    ])
  }, [draftTemplateId])

  const handleOpenSession = useCallback(async (sessionId) => {
    const existing = tabs.find((tab) => tab.sessionId === sessionId)
    if (existing) {
      setActiveTabId(existing.id)
      setDraftTemplateId(null)
      return
    }

    try {
      const [sessionResponse, messagesResponse] = await Promise.all([
        api.get(`/api/agui/workflow/${sessionId}`),
        api.get(`/api/agui/workflow/${sessionId}/messages`),
      ])
      const nextTab = buildTabFromSession(sessionResponse.data, messagesResponse.data)
      setTabs((prevTabs) => [...prevTabs, nextTab])
      setActiveTabId(nextTab.id)
      setDraftTemplateId(null)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : '恢复 workflow 会话失败')
    }
  }, [tabs])

  const handleCloseTab = useCallback((tabId) => {
    setTabs((prevTabs) => {
      const remaining = prevTabs.filter((tab) => tab.id !== tabId)
      if (tabId === activeTabId) {
        setActiveTabId(remaining[remaining.length - 1]?.id || null)
      }
      return remaining
    })
  }, [activeTabId])

  const currentPhase = activeTab
    ? derivePhase(activeTab)
    : draftTemplate
      ? 'PARAMS_INPUT'
      : 'TEMPLATE_SELECT'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        overflow: 'hidden',
      }}
    >
      <WorkflowTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onNewTab={handleNewWorkflow}
      />

      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          minHeight: 0,
        }}
      >
        {activeTab ? (
          <ThreadsProvider key={`workflow-thread-${activeTab.sessionId}`} threadId={activeTab.sessionId}>
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                minWidth: 0,
              }}
            >
              <WorkflowRuntimePane
                tab={activeTab}
                onPatchTab={patchTab}
                onNewWorkflow={handleNewWorkflow}
              />
            </div>
            <WorkflowChatPanel
              threadId={activeTab.sessionId}
              templateId={activeTab.templateId}
              topic={activeTab.topic}
              currentStage={activeTab.agentState?.current_stage || activeTab.agentState?.active_agent}
              workflowStatus={activeTab.agentState?.workflow_status}
            />
          </ThreadsProvider>
        ) : (
          <>
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                minWidth: 0,
              }}
            >
              <WorkflowStatePanel
                phase={currentPhase}
                template={draftTemplate}
                templateId={draftTemplate?.id}
                params={null}
                agentState={null}
                recentSessions={recentSessions}
                historyLoading={historyLoading}
                historyError={historyError}
                onOpenSession={handleOpenSession}
                onSelectTemplate={handleSelectTemplate}
                onStartWorkflow={handleStartWorkflow}
                onBackToTemplates={handleBackToTemplates}
                onNewWorkflow={handleNewWorkflow}
              />
            </div>
            <WorkflowChatPanel disabled templateId={draftTemplate?.id} />
          </>
        )}
      </div>
    </div>
  )
}

function WorkflowRuntimePane({ tab, onPatchTab, onNewWorkflow }) {
  const { agent } = useAgent({
    agentId: 'workflowAgent',
    updates: [
      UseAgentUpdate.OnMessagesChanged,
      UseAgentUpdate.OnStateChanged,
      UseAgentUpdate.OnRunStatusChanged,
    ],
  })

  const hydratedRef = useRef(false)

  useEffect(() => {
    if (!agent || !tab) return
    hydratedRef.current = false
    agent.setMessages(tab.messages || [])
    agent.setState(tab.agentState || {})
    hydratedRef.current = true
  }, [agent, tab.id])

  useEffect(() => {
    if (!agent || !tab || !hydratedRef.current) return

    const nextMessages = agent.messages || []
    const nextState = agent.state || {}
    const nextPhase = agent.isRunning || nextState.workflow_status !== 'completed' ? 'EXECUTING' : 'COMPLETED'

    onPatchTab(tab.id, (currentTab) => {
      const messagesChanged = currentTab.messages !== nextMessages
      const stateChanged = currentTab.agentState !== nextState
      if (!messagesChanged && !stateChanged && currentTab.phase === nextPhase) {
        return null
      }

      return {
        messages: nextMessages,
        agentState: nextState,
        phase: nextPhase,
      }
    })
  }, [agent, agent?.isRunning, agent?.messages, agent?.state, onPatchTab, tab.id])

  useEffect(() => {
    if (!agent || !tab?.shouldAutoRun || !hydratedRef.current) return

    let cancelled = false
    onPatchTab(tab.id, { shouldAutoRun: false, phase: 'EXECUTING' })

    const runWorkflow = async () => {
      try {
        await agent.runAgent({
          forwardedProps: {
            workflowSessionId: tab.sessionId,
            templateId: tab.templateId,
            templateParams: tab.params,
            workflowStateSnapshot: tab.agentState,
          },
        })
      } catch (error) {
        if (!cancelled) {
          onPatchTab(tab.id, (currentTab) => ({
            phase: 'EXECUTING',
            agentState: {
              ...(currentTab.agentState || {}),
              workflow_status: 'failed',
              error: error instanceof Error ? error.message : '工作流启动失败',
            },
          }))
        }
      }
    }

    runWorkflow()

    return () => {
      cancelled = true
    }
  }, [agent, onPatchTab, tab.id, tab.agentState, tab.params, tab.sessionId, tab.shouldAutoRun, tab.templateId])

  const template = getWorkflowTemplate(tab.templateId)

  return (
    <WorkflowStatePanel
      phase={derivePhase(tab)}
      template={template}
      templateId={tab.templateId}
      params={tab.params}
      agentState={tab.agentState}
      onSelectTemplate={() => {}}
      onStartWorkflow={() => {}}
      onBackToTemplates={() => {}}
      onNewWorkflow={onNewWorkflow}
    />
  )
}
