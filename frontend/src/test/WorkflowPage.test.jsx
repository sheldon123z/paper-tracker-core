import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
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
  default: { get: mocks.apiGet },
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
  default: ({ phase, agentState, onOpenSession }) => (
    phase === 'TEMPLATE_SELECT'
      ? <button type="button" onClick={() => onOpenSession('wf-completed')}>打开已完成工作流</button>
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
})
