import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, MetricCard, TagPill, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

/**
 * Rich card renderer for get_tag_analysis.
 * Tag cloud + frequency bars + co-occurrence section.
 */
export default function TagAnalysisRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.tags} lines={4} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.tags} lines={3} />
  }

  const topTags = Array.isArray(data.tags) ? data.tags : (Array.isArray(data.top_tags) ? data.top_tags : [])
  const coOccurrences = Array.isArray(data.co_occurrence) ? data.co_occurrence : (Array.isArray(data.co_occurrences) ? data.co_occurrences : [])
  const maxCount = topTags.reduce((m, t) => Math.max(m, t.count || 0), 1)

  return (
    <CardShell>
      <CardHeader palette={PALETTES.tags} icon={<AppIcon name="tags" size={15} />} title={label}
        badge={`${data.total_tags ?? topTags.length} 个`} />

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '12px 16px 8px' }}>
        <MetricCard icon={<AppIcon name="tags" size={16} />} value={data.total_tags ?? topTags.length} label="标签总数" color={PALETTES.tags.accent} />
        <MetricCard icon={<AppIcon name="papers" size={16} />} value={data.untagged_count ?? data.untagged_papers ?? '—'} label="未标记" color="#f59e0b" />
        <MetricCard icon={<AppIcon name="book" size={16} />} value={data.total_papers ?? '—'} label="总论文" color="var(--text-primary)" />
      </div>

      {/* Tag cloud */}
      {topTags.length > 0 && (
        <div style={{ padding: '8px 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {topTags.slice(0, 15).map((tag, i) => {
            const sizeScale = 0.8 + (tag.count / maxCount) * 0.6
            return (
              <TagPill
                key={tag.name || i}
                name={`${tag.name} (${tag.count})`}
                color={tag.color || null}
                size={sizeScale > 1.1 ? 'md' : 'sm'}
              />
            )
          })}
        </div>
      )}

      {/* Tag frequency bars */}
      {topTags.length > 0 && (
        <div style={{ padding: '8px 16px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            标签频率
          </div>
          {topTags.slice(0, 10).map((tag, i) => {
            const barPct = maxCount > 0 ? (tag.count / maxCount) * 100 : 0
            const dotColor = tag.color || PALETTES.tags.accent
            return (
              <div key={tag.name || i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
                <div style={{
                  width: 80, flexShrink: 0, color: 'var(--text-primary)', fontSize: 11,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {tag.name}
                </div>
                <div style={{ flex: 1, height: 14, backgroundColor: 'var(--bg-primary)', borderRadius: 7, overflow: 'hidden' }}>
                  <div style={{
                    width: `${barPct}%`, height: '100%',
                    background: `linear-gradient(90deg, ${dotColor}, ${dotColor}99)`,
                    borderRadius: 7,
                    transition: 'width 0.4s ease',
                    minWidth: barPct > 0 ? 4 : 0,
                  }} />
                </div>
                <span style={{ width: 28, flexShrink: 0, color: 'var(--text-secondary)', fontSize: 11, textAlign: 'right', fontWeight: 600 }}>
                  {tag.count}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Co-occurrence */}
      {coOccurrences.length > 0 && (
        <details style={{ borderTop: '1px solid var(--border)' }}>
          <summary style={{
            padding: '8px 16px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            color: 'var(--text-secondary)', userSelect: 'none', listStyle: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AppIcon name="duplicates" size={12} /> 标签共现 ({coOccurrences.length} 对)
          </summary>
          <div style={{ padding: '4px 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {coOccurrences.map((co, i) => (
              <div key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 12,
                backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)',
                fontSize: 11,
              }}>
                <span style={{ color: PALETTES.tags.accent, fontWeight: 500 }}>{co.tag1 || co.tag_a}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>+</span>
                <span style={{ color: PALETTES.tags.accent, fontWeight: 500 }}>{co.tag2 || co.tag_b}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, backgroundColor: PALETTES.tags.accentLight,
                  color: PALETTES.tags.accent, padding: '0 4px', borderRadius: 4,
                }}>
                  {co.count}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </CardShell>
  )
}
