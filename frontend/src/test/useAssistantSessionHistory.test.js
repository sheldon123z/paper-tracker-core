import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  useAgent: vi.fn(),
}))

vi.mock('@copilotkit/react-core/v2', () => ({
  UseAgentUpdate: { OnMessagesChanged: 'OnMessagesChanged' },
  useAgent: (options) => mocks.useAgent(options),
}))

vi.mock('../api', () => ({
  default: {
    get: (...args) => mocks.get(...args),
  },
}))

import useAssistantSessionHistory, {
  mapAssistantHistory,
} from '../components/copilot/useAssistantSessionHistory'

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('assistant session history', () => {
  let agent

  beforeEach(() => {
    vi.clearAllMocks()
    agent = {
      threadId: '',
      setMessages: vi.fn(),
      setState: vi.fn(),
    }
    mocks.useAgent.mockReturnValue({ agent })
  })

  it('maps persisted chat and tool records to CopilotKit messages', () => {
    const records = [
      { id: 1, role: 'user', content: 'find papers' },
      {
        id: 2,
        role: 'tool',
        tool_data: {
          tool_call_id: 'call-1',
          name: 'search_papers',
          args: { query: 'MARL' },
          result: [{ title: 'A paper' }],
        },
      },
      { id: 3, role: 'assistant', content: 'one result' },
    ]

    expect(mapAssistantHistory(records, 'session-a')).toEqual([
      {
        id: 'history-session-a-1',
        role: 'user',
        content: 'find papers',
      },
      {
        id: 'history-session-a-2-call',
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'search_papers',
            arguments: JSON.stringify({ query: 'MARL' }),
          },
        }],
      },
      {
        id: 'history-session-a-2-result',
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify([{ title: 'A paper' }]),
      },
      {
        id: 'history-session-a-3',
        role: 'assistant',
        content: 'one result',
      },
    ])
  })

  it('loads the newly selected session immediately', async () => {
    mocks.get.mockImplementation((url) => Promise.resolve({
      data: [{
        id: url.includes('session-b') ? 2 : 1,
        role: 'user',
        content: url.includes('session-b') ? 'message B' : 'message A',
      }],
    }))

    const { rerender } = renderHook(
      ({ sessionId }) => useAssistantSessionHistory(sessionId),
      { initialProps: { sessionId: 'session-a' } },
    )

    await waitFor(() => {
      expect(agent.setMessages).toHaveBeenLastCalledWith([
        { id: 'history-session-a-1', role: 'user', content: 'message A' },
      ])
    })

    rerender({ sessionId: 'session-b' })

    await waitFor(() => {
      expect(agent.setMessages).toHaveBeenLastCalledWith([
        { id: 'history-session-b-2', role: 'user', content: 'message B' },
      ])
    })
    expect(agent.threadId).toBe('session-b')
    expect(mocks.get).toHaveBeenLastCalledWith('/api/agui/assistant/session-b/messages')
  })

  it('ignores a stale history response after a fast session switch', async () => {
    const sessionA = deferred()
    const sessionB = deferred()
    mocks.get.mockImplementation((url) => (
      url.includes('session-b') ? sessionB.promise : sessionA.promise
    ))

    const { rerender } = renderHook(
      ({ sessionId }) => useAssistantSessionHistory(sessionId),
      { initialProps: { sessionId: 'session-a' } },
    )
    rerender({ sessionId: 'session-b' })

    sessionB.resolve({
      data: [{ id: 2, role: 'user', content: 'current B' }],
    })
    await waitFor(() => {
      expect(agent.setMessages).toHaveBeenLastCalledWith([
        { id: 'history-session-b-2', role: 'user', content: 'current B' },
      ])
    })

    sessionA.resolve({
      data: [{ id: 1, role: 'user', content: 'stale A' }],
    })
    await Promise.resolve()

    expect(agent.setMessages).toHaveBeenLastCalledWith([
      { id: 'history-session-b-2', role: 'user', content: 'current B' },
    ])
  })

  it('does not alter the shared agent when history restoration is disabled', () => {
    renderHook(() => useAssistantSessionHistory('session-a', false))

    expect(agent.setMessages).not.toHaveBeenCalled()
    expect(agent.setState).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
  })
})
