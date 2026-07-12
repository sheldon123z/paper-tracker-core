import { useCallback, useEffect, useState } from 'react'

import api from '../../api'
import useStore from '../../store'

function createAssistantSessionId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `ast-${suffix}`
}

export default function useAssistantSessions(enabled = true) {
  const [sessions, setSessions] = useState([])
  const currentSessionId = useStore((state) => state.assistantSessionId)
  const setAssistantSessionId = useStore((state) => state.setAssistantSessionId)

  useEffect(() => {
    if (!enabled) return undefined

    let active = true
    api
      .get('/api/agui/assistant/sessions')
      .then((response) => {
        if (!active) return
        const loadedSessions = Array.isArray(response.data) ? response.data : []
        const selectedSessionId = useStore.getState().assistantSessionId

        if (selectedSessionId) {
          const includesSelected = loadedSessions.some((session) => session.session_id === selectedSessionId)
          setSessions(includesSelected
            ? loadedSessions
            : [{ session_id: selectedSessionId, title: '新会话' }, ...loadedSessions])
          return
        }

        if (loadedSessions.length > 0) {
          setSessions(loadedSessions)
          setAssistantSessionId(loadedSessions[0].session_id)
          return
        }

        const newSessionId = createAssistantSessionId()
        setSessions([{ session_id: newSessionId, title: '新会话' }])
        setAssistantSessionId(newSessionId)
      })
      .catch(() => {
        if (!active || useStore.getState().assistantSessionId) return
        const newSessionId = createAssistantSessionId()
        setSessions([{ session_id: newSessionId, title: '新会话' }])
        setAssistantSessionId(newSessionId)
      })

    return () => {
      active = false
    }
  }, [enabled, setAssistantSessionId])

  const selectSession = useCallback((sessionId) => {
    if (!sessionId || sessionId === useStore.getState().assistantSessionId) return
    setAssistantSessionId(sessionId)
  }, [setAssistantSessionId])

  const newSession = useCallback(() => {
    const newSessionId = createAssistantSessionId()
    setSessions((previous) => [
      { session_id: newSessionId, title: '新会话' },
      ...previous.filter((session) => session.session_id !== newSessionId),
    ])
    setAssistantSessionId(newSessionId)
  }, [setAssistantSessionId])

  return {
    currentSessionId,
    sessions,
    newSession,
    selectSession,
  }
}
