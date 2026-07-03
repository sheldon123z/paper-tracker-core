import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, RelevanceBadge, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

const PAPER_COLORS = ['#667eea', '#f97316']

/**
 * Rich card renderer for compare_papers.
 * Side-by-side dual card layout with metric comparison.
 */
export default function ComparePapersRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.compare} lines={4} />
  }

  const { data } = parseToolResult(result)
  if (!data || !data.paper1 || !data.paper2) {
    return <SkeletonLoader palette={PALETTES.compare} lines={3} />
  }

  const papers = [data.paper1, data.paper2]

  return (
    <CardShell>
      <CardHeader palette={PALETTES.compare} icon={<AppIcon name="comparison" size={15} />} title={label} />

      {/* Side-by-side relevance comparison */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '16px 16px 8px' }}>
        {papers.map((p, i) => (
          <div key={i} style={{ textAlign: 'center' }}>
            <RelevanceBadge score={p.relevance} size={44} />
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>论文 {i + 1}</div>
          </div>
        ))}
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          fontSize: 16, color: 'var(--text-secondary)', opacity: 0.3,
        }}>
          VS
        </div>
      </div>

      {/* Dual paper cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '8px 16px 12px' }}>
        {papers.map((p, i) => {
          const color = PAPER_COLORS[i]
          return (
            <div key={i} style={{
              borderRadius: 16, border: '1px solid var(--glass-stroke)',
              overflow: 'hidden', background: 'var(--glass-card-medium)',
            }}>
              {/* Colored top bar */}
              <div style={{ height: 4, backgroundColor: color }} />
              <div style={{ padding: '10px 12px' }}>
                {/* Title */}
                <div style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  marginBottom: 8,
                }}>
                  {p.title || '未知标题'}
                </div>

                {/* Metadata */}
                {[
                  { label: '作者', value: p.authors },
                  { label: '分类', value: p.category },
                  { label: '日期', value: p.published_date?.slice(0, 10) },
                  { label: '来源', value: p.source },
                ].map(({ label: fieldLabel, value }) => value && value !== 'N/A' && (
                  <div key={fieldLabel} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 32, flexShrink: 0 }}>{fieldLabel}</span>
                    <span style={{
                      fontSize: 10, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Abstracts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 16px 12px' }}>
        {papers.map((p, i) => (
          <details key={i} style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <summary style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
              cursor: 'pointer', padding: '6px 10px',
              backgroundColor: 'var(--bg-primary)', userSelect: 'none', listStyle: 'none',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AppIcon name="submission" size={12} />
                论文 {i + 1} 摘要
              </span>
            </summary>
            <div style={{
              padding: '8px 10px', fontSize: 11, color: 'var(--text-secondary)',
              lineHeight: 1.5, borderLeft: `3px solid ${PAPER_COLORS[i]}`,
            }}>
              {p.abstract || '暂无摘要'}
            </div>
          </details>
        ))}
      </div>
    </CardShell>
  )
}
