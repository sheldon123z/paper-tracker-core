import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, MetricCard, PaperMiniCard, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

/**
 * Rich card renderer for get_favorites_overview.
 * Star-themed card with relevance comparison and categorized favorites.
 * Fixes data field mismatch: backend sends total_favorites/categories, not total_favorited/by_category.
 */
export default function FavoritesOverviewRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.favorites} lines={4} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.favorites} lines={3} />
  }

  // Support both old and new data field names
  const totalFav = data.total_favorites ?? data.total_favorited ?? 0
  const byCategory = Array.isArray(data.categories) ? data.categories : (Array.isArray(data.by_category) ? data.by_category : [])
  const avgFav = typeof data.avg_relevance_favorites === 'number' ? data.avg_relevance_favorites : null
  const avgAll = typeof data.avg_relevance_all === 'number' ? data.avg_relevance_all : null
  const favHigher = avgFav !== null && avgAll !== null && avgFav >= avgAll

  return (
    <CardShell>
      <CardHeader palette={PALETTES.favorites} icon={<AppIcon name="star" size={15} />} title={label}
        badge={`${totalFav} 篇`} />

      {/* Relevance comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '12px 16px' }}>
        <MetricCard
          icon={<AppIcon name="star" size={16} />}
          value={avgFav !== null ? avgFav.toFixed(1) : '—'}
          label={`收藏均相关度${favHigher ? ' ↑' : ''}`}
          color={favHigher ? '#22c55e' : 'var(--text-primary)'}
        />
        <MetricCard
          icon={<AppIcon name="book" size={16} />}
          value={avgAll !== null ? avgAll.toFixed(1) : '—'}
          label="全部均相关度"
          color="var(--text-secondary)"
        />
      </div>

      {/* Category sections */}
      {byCategory.length === 0 ? (
        <div style={{ padding: '16px', color: 'var(--text-secondary)', textAlign: 'center', fontSize: 12 }}>
          暂无收藏论文
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {byCategory.map((cat, ci) => {
            const papers = Array.isArray(cat.papers) ? cat.papers : []
            return (
              <details key={cat.category || ci}
                style={{ borderBottom: ci < byCategory.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <summary style={{
                  padding: '8px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  userSelect: 'none', listStyle: 'none',
                  backgroundColor: 'var(--bg-primary)',
                }}>
                  <span style={{ fontSize: 12, color: '#f59e0b' }}><AppIcon name="star" size={12} /></span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                    {cat.category || '未分类'}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '1px 8px', borderRadius: 12,
                    backgroundColor: '#f59e0b20', color: '#f59e0b',
                    fontWeight: 600,
                  }}>
                    {cat.count ?? papers.length}
                  </span>
                </summary>
                <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {papers.map((p, pi) => (
                    <PaperMiniCard key={p.id || pi} paper={p} />
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </CardShell>
  )
}
