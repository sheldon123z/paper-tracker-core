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

    </CardShell>
  )
}
