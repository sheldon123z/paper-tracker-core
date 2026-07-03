import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

/**
 * Rich card renderer for get_research_trends.
 * Shows trending categories and hot keywords with visual indicators.
 */
export default function ResearchTrendsRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.trends} lines={4} />
  }

  const { data } = parseToolResult(result)
  if (!data || typeof data !== 'object') {
    return <SkeletonLoader palette={PALETTES.trends} lines={3} />
  }

  const trendingUp = Array.isArray(data.trending_up) ? data.trending_up : []
  const trendingDown = Array.isArray(data.trending_down) ? data.trending_down : []
  const hotKeywords = Array.isArray(data.hot_keywords) ? data.hot_keywords : []
  const maxKeywordCount = hotKeywords.length > 0 ? Math.max(...hotKeywords.map(k => k.count)) : 1
  const strongestTrend = trendingUp[0]
  const strongestKeyword = hotKeywords[0]
  const maxGrowth = trendingUp.length > 0 ? Math.max(...trendingUp.map(item => Math.max(0, item.growth || 0)), 1) : 1

  return (
    <CardShell className="copilot-tool-card--trend">
      <CardHeader palette={PALETTES.trends} icon={<AppIcon name="trends" size={15} />} title={label}
        badge={data.period_days ? `${data.period_days} 天` : null} />

      {(strongestTrend || strongestKeyword || data.period_days) && (
        <div className="copilot-trend-summary">
          {strongestTrend && (
            <div className="copilot-trend-summary__chip">
              <span className="copilot-trend-summary__label">主上升类目</span>
              <span className="copilot-trend-summary__value">{strongestTrend.category}</span>
            </div>
          )}
          {strongestKeyword && (
            <div className="copilot-trend-summary__chip">
              <span className="copilot-trend-summary__label">最热关键词</span>
              <span className="copilot-trend-summary__value">{strongestKeyword.keyword}</span>
            </div>
          )}
          {data.period_days && (
            <div className="copilot-trend-summary__chip">
              <span className="copilot-trend-summary__label">观察窗口</span>
              <span className="copilot-trend-summary__value">{data.period_days} 天</span>
            </div>
          )}
        </div>
      )}

      {/* Trending Up */}
      {trendingUp.length > 0 && (
        <div className="copilot-trend-section">
          <div className="copilot-trend-section__title">
            <span style={{ color: '#22c55e' }}>▲</span> 上升趋势
          </div>
          <div className="copilot-trend-list">
            {trendingUp.map((item, i) => (
              <div key={i} className="copilot-trend-row">
                <div className="copilot-trend-row__top">
                  <span className="copilot-trend-row__label">
                    {item.category}
                  </span>
                  <div className="copilot-trend-row__metrics">
                    <span className="copilot-trend-row__range">
                      {item.previous} → {item.recent}
                    </span>
                    <span className="copilot-trend-row__badge is-positive">
                      +{item.growth?.toFixed(0) ?? 0}%
                    </span>
                  </div>
                </div>
                <div className="copilot-trend-row__bar">
                  <div
                    className="copilot-trend-row__fill is-positive"
                    style={{ width: `${Math.min(100, ((item.growth || 0) / maxGrowth) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hot Keywords — heat-map style pills */}
      {hotKeywords.length > 0 && (
        <div className="copilot-trend-section">
          <div className="copilot-trend-section__title">
            <AppIcon name="tags" size={14} /> 热门关键词
          </div>
          <div className="copilot-trend-keywords">
            {hotKeywords.map((kw, i) => {
              const intensity = kw.count / maxKeywordCount
              const scale = Math.max(0.92, Math.min(1.18, 0.94 + intensity * 0.24))
              return (
                <span
                  key={i}
                  className="copilot-trend-keyword"
                  style={{
                    transform: `scale(${scale})`,
                    background: `linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%), hsla(${18 - intensity * 18}, 95%, 58%, ${0.08 + intensity * 0.14})`,
                  }}
                >
                  {kw.keyword}
                  <span className="copilot-trend-keyword__count">{kw.count}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Trending Down */}
      {trendingDown.length > 0 && (
        <div className="copilot-trend-section">
          <details className="copilot-trend-collapse">
            <summary>
              <span style={{ color: '#94a3b8' }}>▼</span> 下降趋势 ({trendingDown.length})
            </summary>
            <div className="copilot-trend-list is-collapsed">
              {trendingDown.map((item, i) => (
                <div key={i} className="copilot-trend-row is-muted">
                  <div className="copilot-trend-row__top">
                    <span className="copilot-trend-row__label">
                      {item.category}
                    </span>
                    <div className="copilot-trend-row__metrics">
                      <span className="copilot-trend-row__range">
                        {item.previous} → {item.recent}
                      </span>
                      <span className="copilot-trend-row__badge is-negative">
                        {item.growth?.toFixed(0) ?? 0}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Empty state */}
      {trendingUp.length === 0 && hotKeywords.length === 0 && trendingDown.length === 0 && (
        <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted-strong)', fontSize: 12 }}>
          暂无足够数据分析趋势
        </div>
      )}
    </CardShell>
  )
}
