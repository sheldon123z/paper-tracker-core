import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@copilotkit/react-core/v2', async () => {
  const React = await import('react')
  return {
    CopilotChat: (props) => React.createElement('div', {
      'data-testid': 'workflow-copilot-chat',
      'data-agent-id': props.agentId,
      'data-thread-id': props.threadId,
    }),
  }
})

import WorkflowChatPanel from '../components/workflow/WorkflowChatPanel'

describe('WorkflowChatPanel v2 thread isolation', () => {
  it('binds the workflow agent to the current workflow session', () => {
    render(
      <WorkflowChatPanel
        threadId="wf-isolated-thread"
        templateId="trend_radar"
        topic="MARL"
        currentStage="analysis"
        workflowStatus="running"
      />,
    )

    expect(screen.getByTestId('workflow-copilot-chat')).toHaveAttribute('data-agent-id', 'workflowAgent')
    expect(screen.getByTestId('workflow-copilot-chat')).toHaveAttribute('data-thread-id', 'wf-isolated-thread')
  })
})
