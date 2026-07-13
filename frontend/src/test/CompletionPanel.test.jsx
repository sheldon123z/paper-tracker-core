import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CompletionPanel from '../components/workflow/CompletionPanel'
import api from '../api'

vi.mock('../api', () => ({
  default: { post: vi.fn() },
}))

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

  it('requests a real DOCX export from the backend converter', async () => {
    api.post.mockResolvedValue({ data: new Blob(['docx']) })
    URL.createObjectURL = vi.fn(() => 'blob:workflow-report')
    URL.revokeObjectURL = vi.fn()

    render(
      <CompletionPanel
        agentState={{ final_report: '# Report', research_topic: 'Export' }}
        onNewWorkflow={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /导出/ }))
    fireEvent.click(screen.getByRole('button', { name: /Word \(\.docx\)/ }))

    expect(api.post).toHaveBeenCalledWith(
      '/api/agui/workflow/export/docx',
      { markdown: '# Report' },
      { responseType: 'blob', timeout: 240_000 },
    )
  })
})
