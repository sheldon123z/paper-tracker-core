import { useEffect } from 'react'
import { useAgent, UseAgentUpdate } from '@copilotkit/react-core/v2'

import api from '../../api'

function asText(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function asArguments(value) {
  if (typeof value === 'string') return value
  return JSON.stringify(value ?? {})
}

export function mapAssistantHistory(records = [], sessionId = 'default') {
  const messages = []

  records.forEach((record, index) => {
    const baseId = `history-${sessionId}-${record.id ?? index}`

    if (record.role === 'user' || record.role === 'assistant') {
      messages.push({
        id: baseId,
        role: record.role,
        content: asText(record.content),
      })
      return
    }

    if (record.role !== 'tool' || !record.tool_data) return

    const tool = record.tool_data
    const toolCallId = String(tool.tool_call_id || `${baseId}-tool`)
    messages.push({
      id: `${baseId}-call`,
      role: 'assistant',
      content: '',
      toolCalls: [{
        id: toolCallId,
        type: 'function',
        function: {
          name: tool.name || '',
          arguments: asArguments(tool.args),
        },
      }],
    })

    if (Object.prototype.hasOwnProperty.call(tool, 'result')) {
      messages.push({
        id: `${baseId}-result`,
        role: 'tool',
        toolCallId,
        content: asText(tool.result),
      })
    }
  })

  return messages
}

export default function useAssistantSessionHistory(sessionId, enabled = true) {
  const { agent } = useAgent({
    agentId: 'assistantAgent',
    updates: [UseAgentUpdate.OnMessagesChanged],
  })

  useEffect(() => {
    if (!agent || !enabled) return undefined

    let active = true
    const threadId = sessionId || 'assistant-default'

    agent.threadId = threadId
    agent.setState({})
    agent.setMessages([])

    if (!sessionId) return () => { active = false }

    api
      .get(`/api/agui/assistant/${sessionId}/messages`)
      .then((response) => {
        if (!active || agent.threadId !== threadId) return
        agent.setMessages(mapAssistantHistory(response.data, sessionId))
      })
      .catch(() => {
        // The cleared conversation is the safe fallback for a failed history load.
      })

    return () => {
      active = false
    }
  }, [agent, enabled, sessionId])
}
