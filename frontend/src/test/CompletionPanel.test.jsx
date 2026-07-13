import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CompletionPanel from '../components/workflow/CompletionPanel'

describe('CompletionPanel Markdown rendering', () => {
  it('renders GFM tables as semantic HTML tables', () => {
    render(
      <CompletionPanel
        agentState={{
          final_report: [
            '| 方法 | 分数 |',
            '| --- | ---: |',
            '| Baseline | 91 |',
            '| Proposed | 95 |',
          ].join('\n'),
        }}
        onNewWorkflow={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /渲染/ }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '方法' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '95' })).toBeInTheDocument()
  })
})
