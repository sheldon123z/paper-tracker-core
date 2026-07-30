import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  addToast: vi.fn(),
  agent: {
    threadId: null,
    messages: [],
    state: {},
    isRunning: false,
    setMessages: vi.fn(),
    setState: vi.fn(),
  },
  emitAgentState: null,
}))

vi.mock('../api', () => ({
  default: { get: mocks.apiGet, delete: mocks.apiDelete },
}))

vi.mock('../components/ui', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}))

vi.mock('@copilotkit/react-core/v2', async () => {
  const React = await import('react')
  return {
    UseAgentUpdate: {
      OnMessagesChanged: 'messages',
      OnStateChanged: 'state',
      OnRunStatusChanged: 'status',
    },
    useAgent: () => {
      const [, forceUpdate] = React.useReducer((value) => value + 1, 0)
      React.useEffect(() => {
        mocks.emitAgentState = (state) => {
          mocks.agent.state = state
          forceUpdate()
        }
        return () => {
          mocks.emitAgentState = null
        }
      }, [])
      return { agent: mocks.agent }
    },
    useCopilotKit: () => ({ copilotkit: { runAgent: vi.fn() } }),
  }
})

vi.mock('../components/workflow/WorkflowTabBar', () => ({
  default: () => null,
}))

vi.mock('../components/workflow/WorkflowChatPanel', () => ({
  default: () => null,
}))

vi.mock('../components/workflow/WorkflowStatePanel', () => ({
  default: ({ phase, agentState, onOpenSession, onDeleteSession, recentSessions = [] }) => (
    phase === 'TEMPLATE_SELECT'
      ? (
          <div>
            <button type="button" onClick={() => onOpenSession('wf-completed')}>打开已完成工作流</button>
            {recentSessions.map((session) => (
              <button
                key={session.session_id}
                type="button"
                onClick={() => onDeleteSession(session.session_id).catch(() => {})}
              >
                删除 {session.session_id}
              </button>
            ))}
          </div>
        )
      : (
          <div data-testid="workflow-runtime">
            <span data-testid="workflow-phase">{phase}</span>
            <span data-testid="workflow-status">{agentState?.workflow_status || 'missing'}</span>
            <span data-testid="workflow-report">{agentState?.final_report || 'missing'}</span>
          </div>
        )
  ),
}))

vi.mock('../components/workflow/templates', () => ({
  getWorkflowTemplate: (templateId) => (
    templateId
      ? {
          id: 'literature_survey',
          name: '文献综述',
          icon: 'workflow',
        }
      : null
  ),
}))

import WorkflowPage from '../pages/WorkflowPage'

describe('WorkflowPage session restoration', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiDelete.mockReset()
    mocks.addToast.mockReset()
    mocks.agent.threadId = null
    mocks.agent.messages = []
    mocks.agent.state = {}
    mocks.agent.isRunning = false
    mocks.agent.setMessages.mockReset()
    mocks.agent.setState.mockReset()
    mocks.emitAgentState = null

    mocks.apiGet.mockImplementation((url) => {
      if (url === '/api/agui/workflow/sessions') {
        return Promise.resolve({
          data: [{
            session_id: 'wf-completed',
            template_id: 'literature_survey',
            workflow_status: 'completed',
            current_stage: 'completed',
          }],
        })
      }
      if (url === '/api/agui/workflow/wf-completed') {
        return Promise.resolve({
          data: {
            session_id: 'wf-completed',
            template_id: 'literature_survey',
            research_topic: 'RAG',
            template_params: { topic: 'RAG' },
            state_snapshot: {
              workflow_status: 'completed',
              current_stage: 'completed',
              final_report: '# 已完成报告',
            },
          },
        })
      }
      if (url === '/api/agui/workflow/wf-completed/messages') {
        return Promise.resolve({ data: [{ id: 1, role: 'assistant', content: '报告完成' }] })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    mocks.apiDelete.mockResolvedValue({ data: { session_id: 'wf-completed' } })
  })

  it('keeps the persisted completed snapshot while hydrating the Copilot agent', async () => {
    render(<WorkflowPage />)

    fireEvent.click(await screen.findByRole('button', { name: '打开已完成工作流' }))

    await waitFor(() => {
      expect(screen.getByTestId('workflow-phase')).toHaveTextContent('COMPLETED')
    })
    expect(screen.getByTestId('workflow-status')).toHaveTextContent('completed')
    expect(screen.getByTestId('workflow-report')).toHaveTextContent('# 已完成报告')
    expect(mocks.agent.setState).toHaveBeenCalledWith(expect.objectContaining({
      workflow_status: 'completed',
      final_report: '# 已完成报告',
    }))

    act(() => {
      mocks.emitAgentState({
        workflow_status: 'running',
        current_stage: 'queued',
      })
    })

    expect(screen.getByTestId('workflow-phase')).toHaveTextContent('COMPLETED')
    expect(screen.getByTestId('workflow-status')).toHaveTextContent('completed')
    expect(screen.getByTestId('workflow-report')).toHaveTextContent('# 已完成报告')
  })

  it('deletes a recent workflow and removes it from the local history', async () => {
    render(<WorkflowPage />)

    fireEvent.click(await screen.findByRole('button', { name: '删除 wf-completed' }))

    await waitFor(() => {
      expect(mocks.apiDelete).toHaveBeenCalledWith('/api/agui/workflow/wf-completed')
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '删除 wf-completed' })).not.toBeInTheDocument()
    })
    expect(mocks.addToast).toHaveBeenCalledWith({ type: 'success', message: '工作流已删除' })
  })

  it('keeps a recent workflow when the delete request fails', async () => {
    mocks.apiDelete.mockRejectedValueOnce({
      response: { data: { detail: '工作流仍在运行' } },
    })
    render(<WorkflowPage />)

    fireEvent.click(await screen.findByRole('button', { name: '删除 wf-completed' }))

    await waitFor(() => {
      expect(mocks.addToast).toHaveBeenCalledWith({ type: 'error', message: '工作流仍在运行' })
    })
    expect(screen.getByRole('button', { name: '删除 wf-completed' })).toBeInTheDocument()
  })

  it('does not restore a workflow whose pending open request finishes after deletion', async () => {
    let resolveDetail
    let resolveMessages
    const detailPromise = new Promise((resolve) => { resolveDetail = resolve })
    const messagesPromise = new Promise((resolve) => { resolveMessages = resolve })
    mocks.apiGet.mockImplementation((url) => {
      if (url === '/api/agui/workflow/sessions') {
        return Promise.resolve({
          data: [{
            session_id: 'wf-completed',
            template_id: 'literature_survey',
            workflow_status: 'completed',
            current_stage: 'completed',
          }],
        })
      }
      if (url === '/api/agui/workflow/wf-completed') return detailPromise
      if (url === '/api/agui/workflow/wf-completed/messages') return messagesPromise
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    render(<WorkflowPage />)

    fireEvent.click(await screen.findByRole('button', { name: '打开已完成工作流' }))
    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/api/agui/workflow/wf-completed/messages')
    })
    fireEvent.click(screen.getByRole('button', { name: '删除 wf-completed' }))
    await waitFor(() => {
      expect(mocks.apiDelete).toHaveBeenCalledWith('/api/agui/workflow/wf-completed')
    })

    await act(async () => {
      resolveDetail({
        data: {
          session_id: 'wf-completed',
          template_id: 'literature_survey',
          research_topic: 'RAG',
          template_params: { topic: 'RAG' },
          state_snapshot: { workflow_status: 'completed' },
        },
      })
      resolveMessages({ data: [] })
      await Promise.all([detailPromise, messagesPromise])
    })

    expect(screen.queryByTestId('workflow-runtime')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '删除 wf-completed' })).not.toBeInTheDocument()
  })

  it('ignores an older StrictMode history response after the workflow is deleted', async () => {
    let resolveFirst
    let resolveSecond
    const firstRequest = new Promise((resolve) => { resolveFirst = resolve })
    const secondRequest = new Promise((resolve) => { resolveSecond = resolve })
    let sessionRequestCount = 0
    mocks.apiGet.mockImplementation((url) => {
      if (url === '/api/agui/workflow/sessions') {
        sessionRequestCount += 1
        return sessionRequestCount === 1 ? firstRequest : secondRequest
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })

    render(
      <StrictMode>
        <WorkflowPage />
      </StrictMode>,
    )
    await waitFor(() => expect(sessionRequestCount).toBe(2))

    await act(async () => {
      resolveSecond({
        data: [{
          session_id: 'wf-completed',
          template_id: 'literature_survey',
          workflow_status: 'completed',
          current_stage: 'completed',
        }],
      })
      await secondRequest
    })
    fireEvent.click(await screen.findByRole('button', { name: '删除 wf-completed' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '删除 wf-completed' })).not.toBeInTheDocument()
    })

    await act(async () => {
      resolveFirst({
        data: [{
          session_id: 'wf-completed',
          template_id: 'literature_survey',
          workflow_status: 'completed',
          current_stage: 'completed',
        }],
      })
      await firstRequest
    })

    expect(screen.queryByRole('button', { name: '删除 wf-completed' })).not.toBeInTheDocument()
  })
})
