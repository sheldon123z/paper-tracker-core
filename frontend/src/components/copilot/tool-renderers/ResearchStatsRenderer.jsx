import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, MetricCard, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

// Generate deterministic colors for categories/sources
const SEGMENT_COLORS = ['#667eea', '#06b6d4', '#8B5CF6', '#f97316', '#22c55e', '#f5576c', '#eab308', '#a855f7', '#64748b', '#11998e']

/**
 * Rich dashboard renderer for get_research_stats.
 * Shows hero stat, metric grid, stacked bar chart, and donut chart.
 */
export default function ResearchStatsRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.stats} lines={4} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.stats} lines={3} />
  }

  const categories = data.categories || []
  const sources = data.sources || []
  const maxCatCount = categories.length > 0 ? Math.max(...categories.map(c => c[1])) : 1

  return (
    <CardShell>
      <CardHeader palette={PALETTES.stats} icon={<AppIcon name="analysis" size={15} />} title={label} />

      {/* Hero total */}
      <div style={{ textAlign: 'center', padding: '16px 16px 8px' }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: PALETTES.stats.accent, lineHeight: 1 }}>
          {data.total ?? 0}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>篇论文</div>
      </div>

      {/* 2x2 metric grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '8px 16px 12px' }}>
        <MetricCard icon={<AppIcon name="book" size={16} />} value={data.unread ?? 0} label="未读" color="#f59e0b" />
        <MetricCard icon={<AppIcon name="star" size={16} />} value={data.favorited ?? 0} label="已收藏" color="#ef4444" />
        <MetricCard icon={<AppIcon name="trends" size={16} />} value={data.avg_relevance?.toFixed(1) ?? '—'} label="平均相关度" color="#22c55e" />
      </div>

      {/* Category distribution — horizontal bars */}
      {categories.length > 0 && (
        <div style={{ padding: '8px 16px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            分类分布
          </div>
          {categories.slice(0, 8).map(([cat, count], i) => {
            const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length]
            const pct = (count / maxCatCount) * 100
            return (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10, width: 60, flexShrink: 0,
                  color: 'var(--text-secondary)', textAlign: 'right',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {cat}
                </span>
                <div style={{ flex: 1, height: 16, backgroundColor: 'var(--bg-primary)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color} 0%, ${color}99 100%)`,
                    borderRadius: 8,
                    transition: 'width 0.5s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    paddingRight: 6,
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#fff' }}>{count}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Source distribution — ring chart */}
      {sources.length > 0 && (
        <div style={{ padding: '8px 16px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            来源分布
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <SourceRing sources={sources} total={data.total} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sources.map(([src, count], i) => (
                <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{src}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </CardShell>
  )
}

// --- SVG ring/donut chart for source distribution ---
function SourceRing({ sources, total }) {
  const size = 72
  const r = 28
  const circumference = 2 * Math.PI * r
  let accOffset = 0

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {sources.map(([src, count], i) => {
          const pct = total > 0 ? count / total : 0
          const dashLen = circumference * pct
          const offset = accOffset
          accOffset += dashLen
          return (
            <circle key={src} cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
              strokeWidth={10} strokeDasharray={`${dashLen} ${circumference - dashLen}`}
              strokeDashoffset={-offset}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          )
        })}
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{total}</span>
        <span style={{ fontSize: 8, color: 'var(--text-secondary)' }}>total</span>
      </div>
    </div>
  )
}
