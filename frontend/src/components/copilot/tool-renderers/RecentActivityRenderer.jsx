import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, PaperMiniCard, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

const SECTIONS = [
  { key: 'recently_added', icon: 'download', iconColor: '#22c55e', title: '新增', fallbackKey: 'added' },
  { key: 'recently_read', icon: 'book', iconColor: '#667eea', title: '已读', fallbackKey: 'read' },
  { key: 'recently_favorited', icon: 'star', iconColor: '#f59e0b', title: '收藏', fallbackKey: 'favorited' },
]

/**
 * Rich card renderer for get_recent_activity.
 * Timeline-style vertical layout with colored sections.
 * Fixes data shape: backend sends data.recently_added (flat array), not data.added.papers (nested).
 */
export default function RecentActivityRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.activity} lines={4} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.activity} lines={3} />
  }

  // Support both flat (backend) and nested (legacy) data shapes
  function getPapers(key, fallbackKey) {
    if (Array.isArray(data[key])) return data[key]
    const nested = data[fallbackKey]
    if (nested && Array.isArray(nested.papers)) return nested.papers
    if (Array.isArray(nested)) return nested
    return []
  }

  const feedActivity = Array.isArray(data.feed_activity) ? data.feed_activity
    : (data.feeds && Array.isArray(data.feeds.items)) ? data.feeds.items
    : Array.isArray(data.feeds) ? data.feeds : []

  return (
    <CardShell>
      <CardHeader palette={PALETTES.activity} icon={<AppIcon name="copy" size={15} />} title={label}
        badge={`${data.days ?? 7} 天`} />

      {/* Paper sections */}
      {SECTIONS.map((sec) => {
        const papers = getPapers(sec.key, sec.fallbackKey)
        if (papers.length === 0) return null
        return (
          <div key={sec.key} style={{ borderBottom: '1px solid var(--border)' }}>
            {/* Section header */}
            <div style={{
              padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: 'var(--bg-primary)',
            }}>
              <span style={{ color: sec.iconColor }}><AppIcon name={sec.icon} size={14} /></span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{sec.title}</span>
              <span style={{
                fontSize: 10, padding: '1px 8px', borderRadius: 12,
                backgroundColor: sec.iconColor + '20', color: sec.iconColor,
                fontWeight: 600, marginLeft: 'auto',
              }}>
                {papers.length}
              </span>
            </div>
            {/* Papers */}
            <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {papers.slice(0, 5).map((p, i) => (
                <PaperMiniCard key={p.id || i} paper={p} />
              ))}
              {papers.length > 5 && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', padding: '4px' }}>
                  ...及其他 {papers.length - 5} 篇
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Feed activity */}
      {feedActivity.length > 0 && (
        <div>
          <div style={{
            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6,
            backgroundColor: 'var(--bg-primary)',
          }}>
            <span style={{ color: '#8b5cf6' }}><AppIcon name="feeds" size={14} /></span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>RSS 源</span>
            <span style={{
              fontSize: 10, padding: '1px 8px', borderRadius: 12,
              backgroundColor: '#8b5cf620', color: '#8b5cf6',
              fontWeight: 600, marginLeft: 'auto',
            }}>
              {feedActivity.length}
            </span>
          </div>
          <div style={{ padding: '8px 16px' }}>
            {feedActivity.map((feed, i) => (
              <div key={feed.id || i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                borderBottom: i < feedActivity.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  backgroundColor: feed.is_active !== false ? '#22c55e' : '#ef4444',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1 }}>{feed.name}</span>
                {feed.last_fetched && (
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {feed.last_fetched.slice(0, 10)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </CardShell>
  )
}
