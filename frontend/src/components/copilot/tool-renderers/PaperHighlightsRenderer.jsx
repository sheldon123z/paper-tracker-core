import parseToolResult from './parseToolResult'
import { PALETTES, getCategoryColor } from './cardStyles'
import { CardShell, RelevanceBadge, TagPill, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

/**
 * Rich card renderer for analyze_paper_highlights.
 * Displays structured paper highlights with key sections.
 */
export default function PaperHighlightsRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.highlights} lines={5} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.highlights} lines={3} />
  }

  const keySections = Array.isArray(data.key_sections) ? data.key_sections : []
  const catColor = getCategoryColor(data.category)

  return (
    <CardShell>
      {/* Hero header */}
      <div style={{ background: PALETTES.highlights.gradient, padding: '14px 16px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{
            width: 24, height: 24, borderRadius: 6,
            backgroundColor: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12,
          }}><AppIcon name="spark" size={12} /></span>
          <span style={{ fontSize: 11, opacity: 0.85 }}>{label}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>
          {data.title || '论文要点分析'}
        </div>
        {data.authors && (
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{data.authors}</div>
        )}
      </div>

      {/* Quick stats row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {data.relevance != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <RelevanceBadge score={data.relevance} size={28} />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>相关度</span>
          </div>
        )}
        {data.category && (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4,
            backgroundColor: catColor + '20', color: catColor, fontWeight: 500,
          }}>
            {data.category}
          </span>
        )}
        {data.tags && Array.isArray(data.tags) && data.tags.slice(0, 3).map((tag, i) => (
          <TagPill key={i} name={typeof tag === 'string' ? tag : tag.name} color={typeof tag === 'object' ? tag.color : null} />
        ))}
      </div>

      {/* Key sections */}
      <div style={{ padding: '12px 16px' }}>
        {keySections.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {keySections.map((section, i) => (
              <div key={i} style={{
                borderRadius: 8, border: '1px solid var(--border)',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 12 }}>
                    {section.label === '摘要'
                      ? <AppIcon name="submission" size={12} />
                      : section.label === 'AI 分析'
                        ? <AppIcon name="assistant" size={12} />
                        : <AppIcon name="spark" size={12} />}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {section.label}
                  </span>
                </div>
                <div style={{
                  padding: '10px 12px',
                  fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                  borderLeft: `3px solid ${i === 0 ? PALETTES.highlights.accent : PALETTES.search.accent}`,
                }}>
                  {section.content}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Fallback: show abstract and ai_summary directly */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.abstract && data.abstract !== 'N/A' && (
              <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, display: 'inline-flex' }}><AppIcon name="submission" size={12} /></span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>摘要</span>
                </div>
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, borderLeft: `3px solid ${PALETTES.highlights.accent}` }}>
                  {data.abstract}
                </div>
              </div>
            )}
            {data.ai_summary && data.ai_summary !== 'N/A' && (
              <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border)' }}>
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 4,
                    background: PALETTES.search.gradient, color: '#fff', fontWeight: 600,
                  }}>AI</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>智能分析</span>
                </div>
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, borderLeft: `3px solid ${PALETTES.search.accent}` }}>
                  {data.ai_summary}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </CardShell>
  )
}
