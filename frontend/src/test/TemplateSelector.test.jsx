import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import TemplateSelector from '../components/workflow/TemplateSelector'

const recentSession = {
  session_id: 'wf-recent-1',
  title: '文献综述 · 多智能体协作',
  template_id: 'literature_survey',
  research_topic: '多智能体协作',
  workflow_status: 'completed',
  current_stage: 'completed',
}

function renderSelector(overrides = {}) {
  const props = {
    onSelectTemplate: vi.fn(),
    recentSessions: [recentSession],
    historyLoading: false,
    historyError: null,
    onOpenSession: vi.fn(),
    onDeleteSession: vi.fn().mockResolvedValue(undefined),
    deletingSessionId: null,
    ...overrides,
  }
  return {
    ...render(
      <>
        <TemplateSelector {...props} />
        <button type="button">外部操作</button>
      </>,
    ),
    props,
  }
}

function StatefulDeleteSelector({ onDeleteSession }) {
  const [sessions, setSessions] = useState([recentSession])
  const handleDelete = async (sessionId) => {
    await onDeleteSession(sessionId)
    setSessions((current) => current.filter((session) => session.session_id !== sessionId))
  }

  return (
    <TemplateSelector
      onSelectTemplate={vi.fn()}
      recentSessions={sessions}
      historyLoading={false}
      historyError={null}
      onOpenSession={vi.fn()}
      onDeleteSession={handleDelete}
      deletingSessionId={null}
    />
  )
}

describe('TemplateSelector recent workflow actions', () => {
  it('opens the delete action on right click and confirms deletion once', async () => {
    const user = userEvent.setup()
    const { props } = renderSelector()
    const sessionButton = screen.getByTitle('打开工作流；右键可查看更多操作')

    fireEvent.contextMenu(sessionButton, { clientX: 120, clientY: 160 })

    await user.click(await screen.findByRole('menuitem', { name: '删除工作流' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('文献综述 · 多智能体协作')
    expect(dialog).toHaveTextContent('此操作不可撤销')

    await user.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(props.onDeleteSession).toHaveBeenCalledTimes(1)
    })
    expect(props.onDeleteSession).toHaveBeenCalledWith('wf-recent-1')
  })

  it('supports the keyboard context-menu shortcut and Escape', async () => {
    renderSelector()
    const sessionButton = screen.getByTitle('打开工作流；右键可查看更多操作')

    fireEvent.keyDown(sessionButton, { key: 'F10', shiftKey: true })
    expect(await screen.findByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(sessionButton).toHaveFocus()
    })
  })

  it('keeps focus on an outside control when pointer interaction closes the menu', async () => {
    const user = userEvent.setup()
    renderSelector()
    const sessionButton = screen.getByTitle('打开工作流；右键可查看更多操作')
    const outsideButton = screen.getByRole('button', { name: '外部操作' })

    fireEvent.contextMenu(sessionButton, { clientX: 120, clientY: 160 })
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await user.click(outsideButton)

    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
    expect(outsideButton).toHaveFocus()
  })

  it('continues the tab order from the menu opener', async () => {
    renderSelector()
    const sessionButton = screen.getByTitle('打开工作流；右键可查看更多操作')
    const moreButton = screen.getByRole('button', { name: '“文献综述 · 多智能体协作”更多操作' })

    fireEvent.keyDown(sessionButton, { key: 'F10', shiftKey: true })
    const deleteItem = await screen.findByRole('menuitem', { name: '删除工作流' })
    await waitFor(() => expect(deleteItem).toHaveFocus())
    fireEvent.keyDown(deleteItem, { key: 'Tab' })

    await waitFor(() => {
      expect(moreButton).toHaveFocus()
    })
  })

  it('offers a visible more-actions button for touch users and allows cancellation', async () => {
    const user = userEvent.setup()
    const { props } = renderSelector()

    await user.click(screen.getByRole('button', { name: '“文献综述 · 多智能体协作”更多操作' }))
    await user.click(await screen.findByRole('menuitem', { name: '删除工作流' }))
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(props.onDeleteSession).not.toHaveBeenCalled()
  })

  it('moves focus to the template grid when deleting the last recent workflow', async () => {
    const user = userEvent.setup()
    const onDeleteSession = vi.fn().mockResolvedValue(undefined)
    render(<StatefulDeleteSelector onDeleteSession={onDeleteSession} />)
    const sessionButton = screen.getByTitle('打开工作流；右键可查看更多操作')

    fireEvent.contextMenu(sessionButton, { clientX: 120, clientY: 160 })
    await user.click(await screen.findByRole('menuitem', { name: '删除工作流' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    const firstTemplate = screen.getByRole('button', { name: /文献调研/ })
    await waitFor(() => {
      expect(firstTemplate).toHaveFocus()
    })
    expect(onDeleteSession).toHaveBeenCalledWith('wf-recent-1')
    expect(screen.queryByTitle('打开工作流；右键可查看更多操作')).not.toBeInTheDocument()
  })
})
