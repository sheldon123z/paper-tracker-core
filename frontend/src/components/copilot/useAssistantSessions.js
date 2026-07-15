import { useCallback, useEffect, useMemo, useState } from 'react'

import api from '../../api'
import useStore from '../../store'

function createAssistantSessionId() {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `ast-${suffix}`
}

function localSession(sessionId, paperId) {
  return {
    session_id: sessionId,
    title: '新会话',
    paper_id: paperId || null,
    paper_title: null,
  }
}

export default function useAssistantSessions({ enabled = true, paperId = null } = {}) {
  const normalizedPaperId = paperId == null ? null : Number(paperId)
  const scopeKey = normalizedPaperId == null ? 'global' : `paper:${normalizedPaperId}`
  const [loadedScope, setLoadedScope] = useState(null)
  const [loadedSessions, setLoadedSessions] = useState([])
  const [loading, setLoading] = useState(Boolean(enabled))

  const assistantSessionId = useStore((state) => state.assistantSessionId)
  const paperAssistantSessionId = useStore((state) => (
    normalizedPaperId == null
      ? null
      : state.paperAssistantSessionIds[String(normalizedPaperId)] || null
  ))
  const setAssistantSessionId = useStore((state) => state.setAssistantSessionId)
  const setPaperAssistantSessionId = useStore((state) => state.setPaperAssistantSessionId)
  const currentSessionId = normalizedPaperId == null
    ? assistantSessionId
    : paperAssistantSessionId

  const setCurrentSessionId = useCallback((sessionId) => {
    const normalized = sessionId || null
    if (normalizedPaperId != null) {
      setPaperAssistantSessionId(normalizedPaperId, normalized)
    }
    setAssistantSessionId(normalized)
  }, [normalizedPaperId, setAssistantSessionId, setPaperAssistantSessionId])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }

    let active = true
    setLoadedScope(scopeKey)
    setLoadedSessions([])
    setLoading(true)

    const request = normalizedPaperId == null
      ? api.get('/api/agui/assistant/sessions')
      : api.get('/api/agui/assistant/sessions', { params: { paper_id: normalizedPaperId } })

    request
      .then((response) => {
        if (!active) return
        const sessions = Array.isArray(response.data) ? response.data : []
        const state = useStore.getState()
        const selectedSessionId = normalizedPaperId == null
          ? state.assistantSessionId
          : state.paperAssistantSessionIds[String(normalizedPaperId)] || null
        const selectedIsValid = selectedSessionId
          && sessions.some((session) => session.session_id === selectedSessionId)

        if (selectedIsValid) {
          setLoadedSessions(sessions)
          setCurrentSessionId(selectedSessionId)
        } else if (sessions.length > 0) {
          setLoadedSessions(sessions)
          setCurrentSessionId(sessions[0].session_id)
        } else {
          const newSessionId = createAssistantSessionId()
          setLoadedSessions([localSession(newSessionId, normalizedPaperId)])
          setCurrentSessionId(newSessionId)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        const newSessionId = createAssistantSessionId()
        setLoadedSessions([localSession(newSessionId, normalizedPaperId)])
        setCurrentSessionId(newSessionId)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [enabled, normalizedPaperId, scopeKey, setCurrentSessionId])

  const sessions = useMemo(
    () => (loadedScope === scopeKey ? loadedSessions : []),
    [loadedScope, loadedSessions, scopeKey],
  )

  const selectSession = useCallback((sessionId) => {
    if (!sessionId || sessionId === currentSessionId) return
    if (!sessions.some((session) => session.session_id === sessionId)) return
    setCurrentSessionId(sessionId)
  }, [currentSessionId, sessions, setCurrentSessionId])

  const newSession = useCallback(() => {
    const newSessionId = createAssistantSessionId()
    setLoadedScope(scopeKey)
    setLoadedSessions((previous) => [
      localSession(newSessionId, normalizedPaperId),
      ...previous.filter((session) => session.session_id !== newSessionId),
    ])
    setCurrentSessionId(newSessionId)
    setLoading(false)
  }, [normalizedPaperId, scopeKey, setCurrentSessionId])

  const ready = enabled
    && !loading
    && loadedScope === scopeKey
    && Boolean(currentSessionId)
    && sessions.some((session) => session.session_id === currentSessionId)

  return {
    currentSessionId: ready ? currentSessionId : null,
    sessions,
    loading: enabled && !ready,
    ready,
    newSession,
    selectSession,
  }
}
