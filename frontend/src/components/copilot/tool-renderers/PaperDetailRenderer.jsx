import parseToolResult from './parseToolResult'
import { PALETTES, getCategoryColor, getRelevanceColor } from './cardStyles'
import { CardShell, RelevanceBadge, TagPill, MetricCard, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

/**
 * Rich card renderer for get_paper_detail.
 * Hero-style card with gradient header, metric tiles, and collapsible sections.
 */
export default function PaperDetailRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.search} lines={5} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.search} lines={3} />
  }

  const firstAuthor = (data.authors || '').split(/[;,]/)[0].trim()
  const authorDisplay = firstAuthor ? (data.authors?.includes(';') || data.authors?.includes(',') ? `${firstAuthor} et al.` : firstAuthor) : ''
  const catColor = getCategoryColor(data.category)

  return (
    <CardShell>
      {/* Hero header with title + authors */}
      <div style={{ background: PALETTES.search.gradient, padding: '16px 16px 14px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.8, display: 'inline-flex' }}><AppIcon name="papers" size={12} /></span>
          <span style={{ fontSize: 11, opacity: 0.8 }}>{label}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, marginBottom: 6 }}>
          {data.title || '未知标题'}
        </div>
        {authorDisplay && (
          <div style={{ fontSize: 11, opacity: 0.85 }}>{data.authors}</div>
        )}
      </div>

      {/* Metric tiles row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '12px 16px' }}>
        <MetricCard
          icon={<RelevanceBadge score={data.relevance} size={28} />}
          value={data.relevance != null ? data.relevance.toFixed(1) : '—'}
          label="相关度"
          color={getRelevanceColor(data.relevance)}
        />
        <MetricCard
          icon={<span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: catColor }} />}
          value={data.category || '—'}
          label="分类"
          color={catColor}
        />
        <MetricCard
          icon={<AppIcon name="queued" size={16} />}
          value={data.published_date ? data.published_date.slice(0, 10) : data.year || '—'}
          label="日期"
          color="var(--text-primary)"
        />
        <MetricCard
          icon={<AppIcon name="feeds" size={16} />}
          value={data.source || data.item_type || '—'}
          label="来源"
          color="var(--text-primary)"
        />
      </div>

      {/* Status row: read/fav + links */}
      <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {data.is_read != null && (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4,
            backgroundColor: data.is_read ? '#22c55e20' : '#f59e0b20',
            color: data.is_read ? '#22c55e' : '#f59e0b',
            fontWeight: 500,
          }}>
            {data.is_read ? '已读' : '未读'}
          </span>
        )}
        {data.is_favorited && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: '#f59e0b20', color: '#f59e0b', fontWeight: 500 }}>
            已收藏
          </span>
        )}
        {data.arxiv_id && data.arxiv_id !== 'N/A' && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            arXiv: {data.arxiv_id}
          </span>
        )}
        {data.doi && data.doi !== 'N/A' && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            DOI: {data.doi}
          </span>
        )}
        {data.link && data.link !== 'N/A' && (
          <a href={data.link} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: PALETTES.search.accentLight, color: PALETTES.search.accent, textDecoration: 'none', fontWeight: 500 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AppIcon name="search" size={11} />链接</span>
          </a>
        )}
        {data.url && data.url !== 'N/A' && !data.link && (
          <a href={data.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: PALETTES.search.accentLight, color: PALETTES.search.accent, textDecoration: 'none', fontWeight: 500 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AppIcon name="search" size={11} />链接</span>
          </a>
        )}
      </div>

      {/* Tags */}
      {data.tags && (typeof data.tags === 'string' ? data.tags : '').length > 0 && (
        <div style={{ padding: '0 16px 10px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(typeof data.tags === 'string' ? data.tags.split(',') : data.tags).map((tag, i) => (
            <TagPill key={i} name={typeof tag === 'string' ? tag.trim() : tag.name} color={typeof tag === 'object' ? tag.color : null} />
          ))}
        </div>
      )}

      {/* Abstract section */}
      {data.abstract && data.abstract !== 'N/A' && (
        <details style={{ margin: '0 16px 10px', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <summary style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
            cursor: 'pointer', padding: '8px 12px',
            backgroundColor: 'var(--bg-primary)',
            listStyle: 'none', userSelect: 'none',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AppIcon name="submission" size={12} />摘要</span>
          </summary>
          <div style={{
            padding: '10px 12px',
            borderLeft: `3px solid ${PALETTES.search.accent}`,
            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            {data.abstract}
          </div>
        </details>
      )}

      {/* AI Summary section */}
      {data.ai_summary && data.ai_summary !== 'N/A' && (
        <details style={{ margin: '0 16px 10px', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <summary style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
            cursor: 'pointer', padding: '8px 12px',
            backgroundColor: 'var(--bg-primary)',
            listStyle: 'none', userSelect: 'none',
          }}>
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4, marginRight: 6,
              background: PALETTES.search.gradient, color: '#fff', fontWeight: 600,
            }}>AI</span>
            智能分析
          </summary>
          <div style={{
            padding: '10px 12px',
            borderLeft: `3px solid ${PALETTES.highlights.accent}`,
            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
          }}>
            {data.ai_summary}
          </div>
        </details>
      )}

      {/* Notes section */}
      {data.notes && data.notes !== 'N/A' && (
        <details style={{ margin: '0 16px 12px', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <summary style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
            cursor: 'pointer', padding: '8px 12px',
            backgroundColor: 'var(--bg-primary)',
            listStyle: 'none', userSelect: 'none',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AppIcon name="copy" size={12} />笔记</span>
          </summary>
          <div style={{
            padding: '10px 12px',
            fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}>
            {data.notes}
          </div>
        </details>
      )}
    </CardShell>
  )
}
