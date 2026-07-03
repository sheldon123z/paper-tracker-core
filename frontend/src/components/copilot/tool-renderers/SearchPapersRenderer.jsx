import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, PaperMiniCard, SkeletonLoader, ExpandableList } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

/**
 * Rich card renderer for search_papers / get_latest_papers / get_category_papers.
 * Displays results as a stack of PaperMiniCards with gradient header.
 */
export default function SearchPapersRenderer({ label, status, args, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.search} lines={4} />
  }

  const { data } = parseToolResult(result)

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <CardShell>
        <CardHeader palette={PALETTES.search} icon={<AppIcon name="search" size={15} />} title={label} badge="0 篇" />
        <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
          未找到相关论文
        </div>
      </CardShell>
    )
  }

  // Show search query if available
  const query = args?.query || args?.category || ''
  const featuredPaper = data[0] || null
  const remainingPapers = data.slice(1)
  const shouldFeatureFirst = data.length > 1

  return (
    <CardShell className="copilot-tool-card--search">
      <CardHeader palette={PALETTES.search} icon={<AppIcon name="search" size={15} />} title={label} badge={`${data.length} 篇`} />

      {/* Search query display */}
      {query && (
        <div className="copilot-search-query-row">
          <span className="copilot-search-query-chip">
            {args?.query ? `关键词: ${args.query}` : `分类: ${args.category}`}
          </span>
        </div>
      )}

      <div className="copilot-search-results">
        {shouldFeatureFirst && featuredPaper && (
          <div className="copilot-search-results__featured">
            <PaperMiniCard paper={featuredPaper} variant="featured" showAbstract />
          </div>
        )}

        <div className="copilot-search-results__list">
          <ExpandableList
            items={shouldFeatureFirst ? remainingPapers : data}
            initialCount={5}
            totalLabel="篇"
            renderItem={(paper, i) => (
              <PaperMiniCard
                key={paper.id || i}
                paper={paper}
                variant="compact"
                showAbstract={!shouldFeatureFirst && data.length <= 3}
              />
            )}
          />
        </div>
      </div>
    </CardShell>
  )
}
