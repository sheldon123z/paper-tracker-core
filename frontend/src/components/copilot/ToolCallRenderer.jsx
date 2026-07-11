import { defineToolCallRenderer } from '@copilotkit/react-core/v2'
import TOOL_MAP, { DefaultRenderer, Suspense, ErrorBoundary } from './toolMap'

/**
 * Catch-all backend tool call renderer using useRenderToolCall({ name: "*" }).
 *
 * useRenderToolCall is the AG-UI native hook for rendering backend tool results,
 * distinct from useCopilotAction which defines frontend-executable actions.
 * The "*" wildcard matches any tool call from the AG-UI event stream.
 *
 * Renders both live AG-UI stream tool calls and tool calls replayed via
 * MESSAGES_SNAPSHOT (thread restore) — both arrive through the same hook.
 *
 * Place inside <CopilotKit> provider to apply to all agents.
 */

/** Minimal loading skeleton for lazy-loaded tool cards. */
function ToolCardFallback() {
  return (
    <div className="tool-card-fallback" style={{
      padding: '12px 16px',
      borderRadius: 8,
      background: 'var(--bg-secondary, #f5f5f5)',
      color: 'var(--text-secondary, #888)',
      fontSize: 13,
    }}>
      Loading...
    </div>
  )
}

export const TOOL_CALL_RENDERERS = [
  defineToolCallRenderer({
    name: '*',
    render: ({ name, args, status, result }) => {
      const entry = TOOL_MAP[name]
      const label = entry?.label || name
      const Renderer = entry?.Renderer || DefaultRenderer
      return (
        <ErrorBoundary>
          <Suspense fallback={<ToolCardFallback />}>
            <Renderer label={label} status={status} args={args} result={result} />
          </Suspense>
        </ErrorBoundary>
      )
    },
  }),
]
