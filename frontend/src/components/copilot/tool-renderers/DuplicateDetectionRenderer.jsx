import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, PaperMiniCard, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

function similarityColor(sim) {
  if (sim >= 0.97) return '#ef4444'
  if (sim >= 0.93) return '#f97316'
  return '#eab308'
}

/**
 * Rich card renderer for find_duplicates.
 * Grouped duplicate cards with similarity badges and visual connectors.
 */
export default function DuplicateDetectionRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.duplicates} lines={3} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.duplicates} lines={3} />
  }

  const groups = Array.isArray(data.groups) ? data.groups : []
  const threshold = data.threshold

  return (
    <CardShell>
      <CardHeader palette={PALETTES.duplicates} icon={<AppIcon name="duplicates" size={15} />} title={label}
        badge={`${groups.length} 组`}>
        {threshold != null && (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4,
            backgroundColor: 'rgba(255,255,255,0.2)', marginLeft: 4,
          }}>
            阈值 {typeof threshold === 'number' ? threshold.toFixed(2) : threshold}
          </span>
        )}
      </CardHeader>

      {/* Empty state */}
      {groups.length === 0 && (
        <div style={{
          padding: '24px 16px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <AppIcon name="completed" size={28} className="text-[#22c55e]" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#22c55e' }}>未发现重复论文</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>数据库中的论文标题均具有足够差异性</span>
        </div>
      )}

      {/* Duplicate groups */}
      {groups.length > 0 && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((group, gi) => {
            const sim = typeof group.similarity === 'number' ? group.similarity : null
            const color = sim !== null ? similarityColor(sim) : '#6b7280'
            const papers = Array.isArray(group.papers) ? group.papers : []

            return (
              <div key={gi} style={{
                borderRadius: 16, border: `1px solid ${color}40`,
                overflow: 'hidden', background: 'var(--glass-card-medium)',
              }}>
                {/* Group header with similarity */}
                <div style={{
                  padding: '8px 12px', backgroundColor: color + '10',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderBottom: `1px solid ${color}30`,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>第 {gi + 1} 组</span>
                  {sim !== null && (
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 12,
                      backgroundColor: color + '20', color,
                    }}>
                      {(sim * 100).toFixed(0)}% 相似
                    </span>
                  )}
                </div>

                {/* Papers in this group */}
                <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {papers.map((p, pi) => (
                    <PaperMiniCard key={p.id || pi} paper={p} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CardShell>
  )
}
