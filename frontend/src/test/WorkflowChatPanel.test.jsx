import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@copilotkit/react-core/v2', async () => {
  const React = await import('react')
  return {
    CopilotChat: (props) => React.createElement('div', {
      'data-testid': 'workflow-copilot-chat',
      'data-agent-id': props.agentId,
      'data-thread-id': props.threadId,
      'data-chat-view': props.chatView?.name,
      'data-suggestion-titles': props.suggestions.map((suggestion) => suggestion.title).join('|'),
    }),
    CopilotChatView: ({ children }) => children({
      scrollView: React.createElement('div', { 'data-testid': 'workflow-scroll-view' }),
      input: React.createElement('div', { 'data-testid': 'workflow-chat-input' }),
    }),
    CopilotChatSuggestionView: ({ suggestions }) => React.createElement(
      'div',
      { 'data-testid': 'workflow-bottom-suggestions' },
      suggestions.map((suggestion) => React.createElement(
        'button',
        { key: suggestion.title, type: 'button' },
        suggestion.title,
      )),
    ),
  }
})

import WorkflowChatPanel, {
  WorkflowChatView,
} from '../components/workflow/WorkflowChatPanel'

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
    expect(screen.getByTestId('workflow-copilot-chat')).toHaveAttribute('data-chat-view', 'WorkflowChatView')
    expect(screen.getByTestId('workflow-copilot-chat').closest('.wf-chat-panel')).toBeInTheDocument()
  })

  it('keeps completed-stage export actions in the scoped workflow chat surface', () => {
    render(
      <WorkflowChatPanel
        threadId="wf-completed-thread"
        templateId="literature_survey"
        topic="Graph RAG"
        currentStage="completed"
        workflowStatus="completed"
      />,
    )

    expect(screen.getByTestId('workflow-copilot-chat')).toHaveAttribute(
      'data-suggestion-titles',
      '导出 Markdown|生成摘要|推荐阅读',
    )
  })

  it('places workflow suggestions immediately above the chat input', () => {
    render(
      <WorkflowChatView
        suggestions={[
          { title: '导出 Markdown', message: '导出报告' },
          { title: '生成摘要', message: '生成摘要' },
        ]}
      />,
    )

    const composer = screen.getByTestId('workflow-chat-composer')
    expect(screen.getByTestId('workflow-scroll-view')).not.toBe(composer)
    expect(Array.from(composer.children)).toEqual([
      screen.getByTestId('workflow-bottom-suggestions'),
      screen.getByTestId('workflow-chat-input'),
    ])
    expect(screen.getByRole('button', { name: '导出 Markdown' })).toBeInTheDocument()
  })
})
