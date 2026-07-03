import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

/**
 * Rich card renderer for get_feed_status.
 * Signal-style RSS feed cards with status indicators.
 */
export default function FeedStatusRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.feeds} lines={3} />
  }

  const { data } = parseToolResult(result)
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <CardShell>
        <CardHeader palette={PALETTES.feeds} icon={<AppIcon name="feeds" size={15} />} title={label} badge="0 个" />
        <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
          暂无 RSS 源
        </div>
      </CardShell>
    )
  }

  const activeCount = data.filter(f => f.is_active).length

  return (
    <CardShell>
      <CardHeader palette={PALETTES.feeds} icon={<AppIcon name="feeds" size={15} />} title={label}
        badge={`${activeCount}/${data.length} 活跃`} />

      <div style={{ padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((feed, i) => (
          <div key={feed.id || i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 8,
            backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)',
          }}>
            {/* Status indicator with pulse for active */}
            <div style={{ position: 'relative', width: 12, height: 12, flexShrink: 0 }}>
              <span style={{
                display: 'block', width: 12, height: 12, borderRadius: '50%',
                backgroundColor: feed.is_active ? '#22c55e' : '#ef4444',
              }} />
              {feed.is_active && (
                <span style={{
                  position: 'absolute', inset: -2,
                  borderRadius: '50%', border: `2px solid ${feed.is_active ? '#22c55e' : '#ef4444'}`,
                  opacity: 0.3,
                  animation: 'feedPulse 2s ease-in-out infinite',
                }} />
              )}
            </div>

            {/* Feed info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {feed.name}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 10, color: 'var(--text-secondary)' }}>
                {feed.interval && <span>每 {feed.interval} 分钟</span>}
                {feed.last_fetched && <span>上次: {feed.last_fetched.slice(0, 16).replace('T', ' ')}</span>}
              </div>
            </div>

            {/* Error indicator */}
            {feed.last_error && (
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 4,
                backgroundColor: '#ef444420', color: '#ef4444',
                fontWeight: 500, flexShrink: 0,
              }}>
                错误
              </span>
            )}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes feedPulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </CardShell>
  )
}
