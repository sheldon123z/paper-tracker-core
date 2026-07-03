import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, MetricCard, PaperMiniCard, SkeletonLoader, ExpandableList } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

/**
 * Rich card renderer for get_reading_progress.
 * Gradient progress bar, metric cards, and recommended papers.
 */
export default function ReadingProgressRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.stats} lines={4} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.stats} lines={3} />
  }

  const pct = typeof data.read_percentage === 'number' ? Math.min(100, Math.max(0, data.read_percentage)) : 0
  // Fix data field mismatch: backend sends recommended_unread, not recommendations
  const recommendations = Array.isArray(data.recommended_unread) ? data.recommended_unread : (Array.isArray(data.recommendations) ? data.recommendations : [])

  // Progress bar gradient: red→yellow→green based on percentage
  const progressGradient = pct < 30
    ? 'linear-gradient(90deg, #ef4444, #f59e0b)'
    : pct < 70
      ? 'linear-gradient(90deg, #f59e0b, #eab308, #22c55e)'
      : 'linear-gradient(90deg, #22c55e, #16a34a)'

  return (
    <CardShell>
      <CardHeader palette={PALETTES.stats} icon={<AppIcon name="book" size={15} />} title={label} badge={`${pct.toFixed(1)}%`} />

      {/* Hero progress bar */}
      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{
          position: 'relative', height: 24, backgroundColor: 'var(--bg-primary)',
          borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct}%`,
            background: progressGradient,
            borderRadius: 12,
            transition: 'width 0.6s ease',
            minWidth: pct > 0 ? 8 : 0,
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
            color: pct > 45 ? '#fff' : 'var(--text-primary)',
            textShadow: pct > 45 ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
          }}>
            {data.read ?? 0} / {data.total ?? 0} 篇已读
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '8px 16px 12px' }}>
        <MetricCard icon={<AppIcon name="papers" size={16} />} value={data.total ?? 0} label="总计" color="var(--accent)" />
        <MetricCard icon={<AppIcon name="completed" size={16} />} value={data.read ?? 0} label="已读" color="#22c55e" />
        <MetricCard icon={<AppIcon name="papers" size={16} />} value={data.unread ?? 0} label="未读" color="#f59e0b" />
        <MetricCard icon={<AppIcon name="star" size={16} />} value={data.favorited ?? 0} label="收藏" color="#ef4444" />
      </div>

      {/* Recommended papers */}
      {recommendations.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AppIcon name="spark" size={14} /> 推荐阅读
          </div>
          <ExpandableList
            items={recommendations}
            initialCount={3}
            totalLabel="篇"
            renderItem={(paper, i) => (
              <PaperMiniCard key={paper.id || i} paper={paper} />
            )}
          />
        </div>
      )}
    </CardShell>
  )
}
