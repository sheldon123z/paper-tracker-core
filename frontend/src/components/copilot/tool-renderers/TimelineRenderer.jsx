import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, SkeletonLoader } from './CardPrimitives'

const BAR_COLORS = ['#667eea', '#764ba2', '#8B5CF6', '#6366F1', '#818CF8', '#A78BFA', '#C4B5FD', '#DDD6FE', '#667eea', '#764ba2', '#8B5CF6', '#6366F1']

/**
 * Rich card renderer for get_paper_timeline.
 * Gradient bar chart with rounded bars and period labels.
 */
export default function TimelineRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.timeline} lines={4} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.timeline} lines={3} />
  }

  const periods = Array.isArray(data.periods) ? data.periods.slice(0, 12) : []
  const maxCount = periods.reduce((m, p) => Math.max(m, p.count || 0), 1)
  const totalPapers = data.total ?? periods.reduce((s, p) => s + (p.count || 0), 0)

  return (
    <CardShell>
      <CardHeader palette={PALETTES.timeline} icon="📅" title={label}
        badge={data.granularity === 'month' ? '按月' : '按周'}>
        {data.category_filter && (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4,
            backgroundColor: 'rgba(255,255,255,0.2)', marginLeft: 4,
          }}>
            {data.category_filter}
          </span>
        )}
      </CardHeader>

      {/* Total summary */}
      <div style={{ padding: '10px 16px 4px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: PALETTES.timeline.accent }}>{totalPapers}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>篇论文</span>
      </div>

      {/* Bar chart */}
      <div style={{ padding: '8px 16px 16px' }}>
        {periods.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '16px 0', fontSize: 12 }}>暂无数据</div>
        ) : (
          periods.map((p, i) => {
            const barPct = maxCount > 0 ? ((p.count || 0) / maxCount) * 100 : 0
            const color = BAR_COLORS[i % BAR_COLORS.length]
            return (
              <div key={p.period || i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{
                  width: 72, flexShrink: 0, color: 'var(--text-secondary)', fontSize: 10,
                  textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.label || p.period}
                </div>
                <div style={{ flex: 1, height: 18, backgroundColor: 'var(--bg-primary)', borderRadius: 9, overflow: 'hidden' }}>
                  <div style={{
                    width: `${barPct}%`, height: '100%',
                    background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                    borderRadius: 9,
                    transition: 'width 0.5s ease',
                    minWidth: barPct > 0 ? 6 : 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
                  }}>
                    {barPct > 15 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{p.count}</span>
                    )}
                  </div>
                </div>
                {barPct <= 15 && (
                  <span style={{ width: 28, flexShrink: 0, fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>
                    {p.count ?? 0}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </CardShell>
  )
}
