import { useCallback } from 'react'
import useStore from '../../store'
import api from '../../api'
import { CHAT_ICONS } from './chatIcons'
import { BASE_LABELS } from './chatLabels'
import { MARKDOWN_TAG_RENDERERS } from './PaperRefRenderer'
import ChatErrorMessage from './ChatErrorMessage'

/**
 * Shared CopilotChat configuration hook.
 * All 4 chat instances use this to get consistent callbacks, components, and styling.
 *
 * NOTE: We intentionally do NOT replace AssistantMessage / UserMessage components.
 * CopilotKit's default components handle tool cards, generative UI, and toolbar
 * rendering correctly. Our callbacks (onCopy, onThumbsUp, etc.) are passed to
 * CopilotChat which wires them into the default toolbar automatically.
 *
 * @param {{ sessionId: string, sessionType: string }} opts
 */
export default function useChatConfig({ sessionId, sessionType }) {
  const selectedModelMeta = useStore((s) => s.selectedModelMeta)

  const onCopy = useCallback((text) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }, [])

  const onThumbsUp = useCallback(
    (msg) => {
      if (!msg?.id || !sessionId) return
      api
        .post('/api/feedback', {
          message_id: msg.id,
          session_id: sessionId,
          session_type: sessionType,
          feedback_type: 'thumbsUp',
        })
        .catch(() => {})
    },
    [sessionId, sessionType],
  )

  const onThumbsDown = useCallback(
    (msg) => {
      if (!msg?.id || !sessionId) return
      api
        .post('/api/feedback', {
          message_id: msg.id,
          session_id: sessionId,
          session_type: sessionType,
          feedback_type: 'thumbsDown',
        })
        .catch(() => {})
    },
    [sessionId, sessionType],
  )

  return {
    onCopy,
    onThumbsUp,
    onThumbsDown,
    ErrorMessage: ChatErrorMessage,
    icons: CHAT_ICONS,
    markdownTagRenderers: MARKDOWN_TAG_RENDERERS,
    imageUploadsEnabled: Boolean(selectedModelMeta?.supports_vision),
    labels: BASE_LABELS,
  }
}
