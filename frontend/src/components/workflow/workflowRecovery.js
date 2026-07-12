import api from '../../api'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'error'])

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForPersistedWorkflow({
  sessionId,
  onSnapshot,
  maxAttempts = 90,
  intervalMs = 2000,
  request = (url) => api.get(url),
  wait = delay,
}) {
  let lastSnapshot = null
  let lastError = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await request(`/api/agui/workflow/${sessionId}`)
      const snapshot = response?.data?.state_snapshot || {}
      if (Object.keys(snapshot).length > 0) {
        lastSnapshot = snapshot
        onSnapshot?.(snapshot)
      }

      const status = snapshot.workflow_status || response?.data?.workflow_status
      if (TERMINAL_STATUSES.has(status)) {
        return { status, snapshot: lastSnapshot, session: response.data }
      }
    } catch (error) {
      lastError = error
    }

    if (attempt < maxAttempts - 1) await wait(intervalMs)
  }

  if (!lastSnapshot && lastError) throw lastError
  return { status: 'timeout', snapshot: lastSnapshot, session: null }
}
