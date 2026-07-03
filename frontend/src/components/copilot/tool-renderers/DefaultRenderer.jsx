import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

const STATUS_ICONS = {
  inProgress: 'queued',
  executing: 'normalize',
  complete: 'completed',
}

/**
 * Default fallback renderer for any tool call.
 * Shows a glassmorphism-style card with status, args, and collapsible result.
 */
export default function DefaultRenderer({ label, status, args, result }) {
  const { text } = parseToolResult(result)

  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.search} lines={2} />
  }

  const argsStr = args
    ? Object.entries(args)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ')
    : ''

  return (
    <CardShell>
      <div style={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14, display: 'inline-flex' }}><AppIcon name={STATUS_ICONS[status] || STATUS_ICONS.complete} size={14} /></span>
          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{label}</span>
        </div>
        {argsStr && (
          <div style={{
            marginTop: 6, fontFamily: 'monospace', fontSize: 11,
            color: 'var(--text-secondary)', wordBreak: 'break-all',
            padding: '4px 8px', borderRadius: 4, backgroundColor: 'var(--bg-primary)',
          }}>
            {argsStr}
          </div>
        )}
        {text && (
          <details style={{ marginTop: 6 }}>
            <summary style={{
              fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none',
            }}>
              查看结果
            </summary>
            <pre style={{
              marginTop: 4, padding: 8, borderRadius: 6,
              backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)',
              fontSize: 10, maxHeight: 120, overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              color: 'var(--text-secondary)',
            }}>
              {text}
            </pre>
          </details>
        )}
      </div>
    </CardShell>
  )
}
