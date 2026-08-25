import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAgent, UseAgentUpdate, useCopilotKit } from '@copilotkit/react-core/v2'

import api from '../api'
import useStore from '../store'
import WorkflowTabBar from '../components/workflow/WorkflowTabBar'
import WorkflowStatePanel from '../components/workflow/WorkflowStatePanel'
import WorkflowChatPanel from '../components/workflow/WorkflowChatPanel'
import { getWorkflowTemplate } from '../components/workflow/templates'
import { waitForPersistedWorkflow } from '../components/workflow/workflowRecovery'
import { useToast } from '../components/ui'

function createSessionId() {
  return `wf-${crypto.randomUUID()}`
}

function buildInitialWorkflowState(templateId, params, llmConfigId = null) {
  return {
    template_id: templateId,
    llm_config_id: llmConfigId,
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
    llmConfigId:
      agentState.llm_config_id !== null &&
      agentState.llm_config_id !== undefined &&
      Number.isFinite(Number(agentState.llm_config_id))
        ? Number(agentState.llm_config_id)
        : null,
    phase: agentState.workflow_status === 'completed' ? 'COMPLETED' : 'EXECUTING',
    messages: mapStoredMessages(messages),
    agentState,
    agentStateSource: 'persisted',
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
  const [deletingSessionId, setDeletingSessionId] = useState(null)
  const deletingSessionRef = useRef(null)
  const blockedSessionIdsRef = useRef(new Set())
  const openSessionRequestsRef = useRef(new Map())
  const sessionsRequestIdRef = useRef(0)

  const setWorkflowContext = useStore((state) => state.setWorkflowContext)
  const clearWorkflowContext = useStore((state) => state.clearWorkflowContext)
  const { addToast } = useToast()

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
        configId: activeTab.llmConfigId,
      })
      return
    }

    if (draftTemplate) {
      setWorkflowContext({
        sessionId: null,
        templateId: draftTemplate.id,
        templateParams: null,
        stateSnapshot: null,
        configId: null,
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
    const requestId = sessionsRequestIdRef.current + 1
    sessionsRequestIdRef.current = requestId
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const response = await api.get('/api/agui/workflow/sessions')
      if (sessionsRequestIdRef.current !== requestId) return
      const sessions = Array.isArray(response.data) ? response.data : []
      setRecentSessions(
        sessions.filter((session) => !blockedSessionIdsRef.current.has(session.session_id)),
      )
    } catch (error) {
      if (sessionsRequestIdRef.current !== requestId) return
      setHistoryError(error instanceof Error ? error.message : '加载 workflow 历史失败')
    } finally {
      if (sessionsRequestIdRef.current === requestId) setHistoryLoading(false)
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

  const handleStartWorkflow = useCallback((params, llmConfigId) => {
    const template = getWorkflowTemplate(draftTemplateId)
    if (!template || !Number.isFinite(Number(llmConfigId))) return

    const sessionId = createSessionId()
    const initialState = buildInitialWorkflowState(template.id, params, Number(llmConfigId))
    const initialMessages = buildInitialMessages(template, params)
    const nextTab = {
      id: sessionId,
      sessionId,
      templateId: template.id,
      templateName: template.name,
      templateIcon: template.icon,
      topic: params?.topic || '未命名工作流',
      params,
      llmConfigId: Number(llmConfigId),
      phase: 'EXECUTING',
      messages: initialMessages,
      agentState: initialState,
      agentStateSource: 'live',
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
    if (blockedSessionIdsRef.current.has(sessionId)) return
    const requestToken = Symbol(sessionId)
    openSessionRequestsRef.current.set(sessionId, requestToken)

    try {
      const [sessionResponse, messagesResponse] = await Promise.all([
        api.get(`/api/agui/workflow/${sessionId}`),
        api.get(`/api/agui/workflow/${sessionId}/messages`),
      ])
      if (
        blockedSessionIdsRef.current.has(sessionId)
        || openSessionRequestsRef.current.get(sessionId) !== requestToken
      ) {
        return
      }
      const nextTab = buildTabFromSession(sessionResponse.data, messagesResponse.data)
      setTabs((prevTabs) => {
        const alreadyOpen = prevTabs.some((tab) => tab.sessionId === sessionId)
        return alreadyOpen
          ? prevTabs.map((tab) => (tab.sessionId === sessionId ? nextTab : tab))
          : [...prevTabs, nextTab]
      })
      setActiveTabId(nextTab.id)
      setDraftTemplateId(null)
    } catch (error) {
      if (
        blockedSessionIdsRef.current.has(sessionId)
        || openSessionRequestsRef.current.get(sessionId) !== requestToken
      ) {
        return
      }
      setHistoryError(error instanceof Error ? error.message : '恢复 workflow 会话失败')
    } finally {
      if (openSessionRequestsRef.current.get(sessionId) === requestToken) {
        openSessionRequestsRef.current.delete(sessionId)
      }
    }
  }, [])

  const handleCloseTab = useCallback((tabId) => {
    setTabs((prevTabs) => {
      const remaining = prevTabs.filter((tab) => tab.id !== tabId)
      if (tabId === activeTabId) {
        setActiveTabId(remaining[remaining.length - 1]?.id || null)
      }
      return remaining
    })
  }, [activeTabId])

  const handleDeleteSession = useCallback(async (sessionId) => {
    if (!sessionId || deletingSessionRef.current) return

    deletingSessionRef.current = sessionId
    blockedSessionIdsRef.current.add(sessionId)
    openSessionRequestsRef.current.delete(sessionId)
    setDeletingSessionId(sessionId)
    try {
      await api.delete(`/api/agui/workflow/${encodeURIComponent(sessionId)}`)
      setRecentSessions((prevSessions) =>
        prevSessions.filter((session) => session.session_id !== sessionId),
      )
      setTabs((prevTabs) => {
        const remaining = prevTabs.filter((tab) => tab.sessionId !== sessionId)
        setActiveTabId((currentId) => (
          currentId === sessionId ? remaining[remaining.length - 1]?.id || null : currentId
        ))
        return remaining
      })
      addToast({ type: 'success', message: '工作流已删除' })
    } catch (error) {
      blockedSessionIdsRef.current.delete(sessionId)
      const message = error?.response?.data?.detail
        || (error instanceof Error ? error.message : '删除工作流失败')
      addToast({ type: 'error', message })
      throw error
    } finally {
      if (deletingSessionRef.current === sessionId) {
        deletingSessionRef.current = null
        setDeletingSessionId(null)
      }
    }
  }, [addToast])

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
          <>
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                minWidth: 0,
              }}
            >
              <WorkflowRuntimePane
                key={`workflow-runtime-${activeTab.sessionId}`}
                tab={activeTab}
                onPatchTab={patchTab}
                onNewWorkflow={handleNewWorkflow}
              />
            </div>
            <WorkflowChatPanel
              key={`workflow-console-${activeTab.sessionId}`}
              threadId={activeTab.sessionId}
              templateId={activeTab.templateId}
              topic={activeTab.topic}
              currentStage={activeTab.agentState?.current_stage || activeTab.agentState?.active_agent}
              workflowStatus={activeTab.agentState?.workflow_status}
            />
          </>
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
                onDeleteSession={handleDeleteSession}
                deletingSessionId={deletingSessionId}
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
  const { copilotkit } = useCopilotKit()
  const { agent } = useAgent({
    agentId: 'workflowAgent',
    updates: [
      UseAgentUpdate.OnMessagesChanged,
      UseAgentUpdate.OnStateChanged,
      UseAgentUpdate.OnRunStatusChanged,
    ],
  })

  const hydratedRef = useRef(false)
  const skipInitialAgentSyncRef = useRef(false)

  useEffect(() => {
    if (!agent || !tab) return
    hydratedRef.current = false
    // The useAgent hook still exposes the previous thread's state during this
    // effect pass. Do not let the sync effect below overwrite a restored tab
    // with that stale state before setState/setMessages trigger their update.
    skipInitialAgentSyncRef.current = true
    agent.threadId = tab.sessionId
    agent.setMessages(tab.messages || [])
    agent.setState(tab.agentState || {})
    hydratedRef.current = true
  }, [agent, tab.id])

  useEffect(() => {
    if (!agent || !tab || !hydratedRef.current) return
    if (skipInitialAgentSyncRef.current) {
      skipInitialAgentSyncRef.current = false
      return
    }
    // Restored sessions already have an authoritative database snapshot.
    // CopilotChat shares the same registry agent and may reset it while
    // switching threads; those transient values must never replace history.
    if (tab.agentStateSource !== 'live') return

    const nextMessages = agent.messages || []
    const nextState = agent.state || {}
    const nextPhase = agent.isRunning || nextState.workflow_status !== 'completed' ? 'EXECUTING' : 'COMPLETED'
    const nextStateSource = ['completed', 'failed', 'error'].includes(nextState.workflow_status)
      ? 'persisted'
      : 'live'

    onPatchTab(tab.id, (currentTab) => {
      const messagesChanged = currentTab.messages !== nextMessages
      const stateChanged = currentTab.agentState !== nextState
      const sourceChanged = currentTab.agentStateSource !== nextStateSource
      if (!messagesChanged && !stateChanged && !sourceChanged && currentTab.phase === nextPhase) {
        return null
      }

      return {
        messages: nextMessages,
        agentState: nextState,
        phase: nextPhase,
        agentStateSource: nextStateSource,
      }
    })
  }, [agent, agent?.isRunning, agent?.messages, agent?.state, onPatchTab, tab.agentStateSource, tab.id])

  useEffect(() => {
    if (!agent || !tab?.shouldAutoRun || !hydratedRef.current) return

    const initialState = tab.agentState
    onPatchTab(tab.id, { shouldAutoRun: false, phase: 'EXECUTING' })

    const runWorkflow = async () => {
      try {
        agent.threadId = tab.sessionId
        await copilotkit.runAgent({
          agent,
          forwardedProps: {
            configId: tab.llmConfigId,
            workflowSessionId: tab.sessionId,
            templateId: tab.templateId,
            templateParams: tab.params,
            workflowStateSnapshot: initialState,
          },
        })
      } catch (error) {
        const connectionError = error instanceof Error ? error.message : '工作流连接中断'
        onPatchTab(tab.id, (currentTab) => ({
          phase: 'EXECUTING',
          agentState: {
            ...(currentTab.agentState || {}),
            workflow_status: 'recovering',
            error: `${connectionError}，正在从服务端恢复进度…`,
          },
        }))

        try {
          const recovered = await waitForPersistedWorkflow({
            sessionId: tab.sessionId,
            onSnapshot: (snapshot) => {
              agent.setState(snapshot)
              onPatchTab(tab.id, {
                phase: snapshot.workflow_status === 'completed' ? 'COMPLETED' : 'EXECUTING',
                agentState: snapshot,
                agentStateSource: snapshot.workflow_status === 'completed' ? 'persisted' : 'live',
              })
            },
          })

          if (recovered.status === 'completed') {
            const messagesResponse = await api.get(`/api/agui/workflow/${tab.sessionId}/messages`)
            const restoredMessages = mapStoredMessages(messagesResponse.data)
            agent.setMessages(restoredMessages)
            agent.setState(recovered.snapshot || {})
            onPatchTab(tab.id, {
              phase: 'COMPLETED',
              messages: restoredMessages,
              agentState: recovered.snapshot || {},
              agentStateSource: 'persisted',
            })
            return
          }

          const terminalError = recovered.snapshot?.error || connectionError
          onPatchTab(tab.id, (currentTab) => ({
            phase: 'EXECUTING',
            agentStateSource: 'persisted',
            agentState: {
              ...(currentTab.agentState || {}),
              workflow_status: recovered.status === 'timeout' ? 'failed' : recovered.status,
              error: terminalError,
            },
          }))
        } catch (recoveryError) {
          onPatchTab(tab.id, (currentTab) => ({
            phase: 'EXECUTING',
            agentStateSource: 'persisted',
            agentState: {
              ...(currentTab.agentState || {}),
              workflow_status: 'failed',
              error: recoveryError instanceof Error ? recoveryError.message : connectionError,
            },
          }))
        }
      }
    }

    void runWorkflow()
  }, [agent, copilotkit, onPatchTab, tab.id, tab.llmConfigId, tab.params, tab.sessionId, tab.shouldAutoRun, tab.templateId])

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
