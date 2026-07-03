import ActiveAgentIndicator from './ActiveAgentIndicator'
import { getWorkflowTemplate } from './templates'
import AppIcon from '../ui/AppIcon'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseStructuredData(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function toText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join('；')
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function normalizeStage(value) {
  if (!value) return 'queued'
  return String(value).trim().toLowerCase().replace(/\s+/g, '_')
}

function getStageMeta(stage, template) {
  const label = template?.stageLabels?.[stage] || stage || '处理中'
  switch (stage) {
    case 'search':
      return {
        label,
        title: '文献信号扫描中',
        description: '系统正在汇总主题关键词、数据源命中情况与候选文献质量。',
        accent: '#3b82f6',
        icon: 'search',
      }
    case 'select':
      return {
        label,
        title: '代表论文已聚焦',
        description: '候选文献正在收束到最有代表性的论文集合，用于后续深入分析。',
        accent: '#0ea5e9',
        icon: 'select',
      }
    case 'analysis':
      return {
        label,
        title: '研究方法与贡献解构中',
        description: '系统正在对每篇论文抽取方法、发现、贡献与潜在局限。',
        accent: '#8b5cf6',
        icon: 'analysis',
      }
    case 'trends':
      return {
        label,
        title: '趋势雷达生成中',
        description: '系统正在梳理时间分布、热点关键词、方法分布与来源结构。',
        accent: '#f59e0b',
        icon: 'trends',
      }
    case 'comparison':
      return {
        label,
        title: '差异对比收敛中',
        description: '系统正在压缩关键论文间的方法差异、重点发现与适用场景。',
        accent: '#6366f1',
        icon: 'comparison',
      }
    case 'gap':
      return {
        label,
        title: '研究空白识别中',
        description: '系统正在识别方法覆盖盲点、评测缺口与潜在突破方向。',
        accent: '#10b981',
        icon: 'gap',
      }
    case 'submission':
      return {
        label,
        title: '投稿策略整理中',
        description: '系统正在整理 venue 建议、差异化定位和 novelty 检查项。',
        accent: '#ec4899',
        icon: 'submission',
      }
    case 'synthesis':
      return {
        label,
        title: '最终报告合成中',
        description: '系统正在将检索、分析与趋势结果编织成可阅读的研究报告。',
        accent: '#f97316',
        icon: 'synthesis',
      }
    case 'completed':
      return {
        label,
        title: '工作流已完成',
        description: '核心结构化结果已经收敛，可以继续在右侧对话中深挖。',
        accent: '#22c55e',
        icon: 'completed',
      }
    default:
      return {
        label,
        title: '工作流准备中',
        description: '等待当前阶段数据就绪后，将自动推进后续研究步骤。',
        accent: 'var(--accent)',
        icon: 'workflow',
      }
  }
}

function WorkflowActivityFeed({ activities = [] }) {
  if (activities.length === 0) return null

  const ACTIVITY_ICONS = {
    search_progress: 'search',
    analysis_progress: 'analysis',
    stage_complete: 'completed',
    progress: 'queued',
  }

  return (
    <div className="wf-activity-feed wf-fade-up">
      {activities.slice(-5).map((activity, idx) => {
        const icon = ACTIVITY_ICONS[activity.activity_type] || 'workflow'
        const detail = activity.content?.detail || activity.content?.stage || ''
        const current = activity.content?.current
        const total = activity.content?.total
        const hasProgress = current != null && total != null && total > 0

        return (
          <div key={`${activity.activity_type}-${idx}`} className="wf-activity-item">
            <span className="wf-activity-icon"><AppIcon name={icon} size={13} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="wf-activity-text">{detail}</div>
              {hasProgress && (
                <div className="wf-progress-bar-wrapper">
                  <div className="wf-progress-bar" style={{ width: `${Math.min(100, (current / total) * 100)}%` }} />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ExecutionPanel({ agentState, params, templateId, activities = [], stepTimings = {} }) {
  const template = getWorkflowTemplate(templateId || agentState?.template_id)
  const topic = agentState?.research_topic || params?.topic || '未命名工作流'
  const currentStage = normalizeStage(agentState?.current_stage || agentState?.active_agent)
  const completedAgents = asArray(agentState?.completed_agents)
  const searchResults = asArray(agentState?.search_results)
  const selectedPapers = asArray(agentState?.selected_papers)
  const paperAnalyses = asArray(agentState?.paper_analyses)
  const trendData = agentState?.trend_data
  const comparisonReport = agentState?.comparison_report
  const gapReport = agentState?.gap_report
  const submissionPlan = agentState?.submission_plan
  const finalReport = agentState?.final_report || agentState?.literature_draft
  const recommendations = asArray(agentState?.recommendations)
  const recentToolActivity = asArray(agentState?.recent_tool_activity)
  const lastStageSummary = agentState?.last_stage_summary || ''
  const errorMessage = agentState?.error
  const isCompleted = agentState?.workflow_status === 'completed'
  const stageMeta = getStageMeta(currentStage, template)

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="wf-topic-card wf-fade-up">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, position: 'relative' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>
            {template?.name || '科研工作流'}
          </div>
          <span style={{
            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            backgroundColor: 'rgba(59,130,246,0.12)', color: 'var(--accent)',
          }}>
            {template?.stageLabels?.[currentStage] || currentStage || '准备中'}
          </span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', position: 'relative' }}>
          {topic}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5, position: 'relative' }}>
          {params?.timeRange ? `检索范围：${params.timeRange}` : '工作流已创建'}
          {Array.isArray(params?.sources) && params.sources.length > 0 ? ` · 来源：${params.sources.join('、')}` : ''}
          {params?.depth ? ` · ${params.depth}` : ''}
        </div>
      </div>

      <div className="wf-fade-up" style={{ borderRadius: 14, border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
        <ActiveAgentIndicator templateId={template?.id} currentStage={currentStage} completedAgents={completedAgents} stepTimings={stepTimings} />
      </div>

      <StageSpotlight
        stageMeta={stageMeta}
        searchResults={searchResults}
        selectedPapers={selectedPapers}
        paperAnalyses={paperAnalyses}
        trendData={trendData}
        summary={lastStageSummary}
        tools={recentToolActivity}
        isCompleted={isCompleted}
      />

      {errorMessage && (
        <div className="wf-fade-up" style={{
          padding: '14px 18px', borderRadius: 12,
          border: '1px solid rgba(239,68,68,0.25)', backgroundColor: 'rgba(239,68,68,0.04)',
          color: '#b91c1c', fontSize: 13, lineHeight: 1.65,
        }}>
          工作流执行遇到问题：{toText(errorMessage)}
        </div>
      )}

      {searchResults.length > 0 && (
        <ResultSection icon="search" title="检索结果" count={searchResults.length} color="#3b82f6">
          <PaperFlow papers={searchResults} color="#3b82f6" variant="search" />
        </ResultSection>
      )}

      {selectedPapers.length > 0 && (
        <ResultSection icon="select" title="已选论文" count={selectedPapers.length} color="#0ea5e9">
          <PaperFlow papers={selectedPapers} color="#0ea5e9" variant="selected" />
        </ResultSection>
      )}

      {paperAnalyses.length > 0 && (
        <ResultSection icon="analysis" title="论文分析" count={paperAnalyses.length} color="#8b5cf6">
          <AnalysisFlow analyses={paperAnalyses} />
        </ResultSection>
      )}

      {trendData && (
        <ResultSection icon="trends" title="趋势数据" color="#f59e0b">
          <TrendInsightsPanel trendData={trendData} />
        </ResultSection>
      )}

      {comparisonReport && (
        <ResultSection icon="comparison" title="对比报告" color="#6366f1">
          <div className="wf-rich-text" style={{ maxHeight: 280 }}>{toText(comparisonReport)}</div>
        </ResultSection>
      )}

      {gapReport && (
        <ResultSection icon="gap" title="研究空白" color="#10b981">
          <div className="wf-rich-text" style={{ maxHeight: 280 }}>{toText(gapReport)}</div>
        </ResultSection>
      )}

      {submissionPlan && (
        <ResultSection icon="submission" title="投稿规划" color="#ec4899">
          <div className="wf-rich-text" style={{ maxHeight: 280 }}>{toText(submissionPlan)}</div>
        </ResultSection>
      )}

      {finalReport && (
        <ResultSection icon="synthesis" title={template?.resultLabel || '最终报告'} color="#f97316">
          <div className="wf-rich-text" style={{ maxHeight: 340 }}>{toText(finalReport)}</div>
        </ResultSection>
      )}

      {recommendations.length > 0 && (
        <ResultSection icon="spark" title="建议" count={recommendations.length} color="#14b8a6">
          <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.75 }}>
              {recommendations.map((item, index) => <li key={`${item}-${index}`}>{toText(item)}</li>)}
            </ul>
          </div>
        </ResultSection>
      )}

      {!isCompleted && activities.length > 0 && (
        <WorkflowActivityFeed activities={activities} />
      )}

      {!isCompleted && (
        <div className="wf-working wf-fade-up">
          <span className="wf-working-dot" />
          <span>工作流正在执行：{template?.stageLabels?.[currentStage] || currentStage || '处理中'}</span>
        </div>
      )}
    </div>
  )
}

function ResultSection({ icon, title, count, color, children }) {
  return (
    <section className="wf-fade-up">
      <div className="wf-section-header">
        <div className="wf-section-icon" style={{ background: `${color}14` }}>
          <AppIcon name={icon} size={14} />
        </div>
        <h3 className="wf-section-title">{title}</h3>
        {count != null && (
          <span className="wf-section-count" style={{ backgroundColor: `${color}18`, color }}>{count}</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </section>
  )
}

function StageSpotlight({
  stageMeta,
  searchResults,
  selectedPapers,
  paperAnalyses,
  trendData,
  summary,
  tools,
  isCompleted,
}) {
  const trend = asObject(trendData)
  const metrics = [
    { label: '候选文献', value: searchResults.length, icon: 'search' },
    { label: '代表论文', value: selectedPapers.length, icon: 'select' },
    { label: '结构分析', value: paperAnalyses.length, icon: 'analysis' },
    { label: '热点关键词', value: asArray(trend.top_keywords).length, icon: 'trends' },
  ]

  return (
    <section className="wf-stage-spotlight wf-fade-up" style={{ '--stage-accent': stageMeta.accent }}>
      <div className="wf-stage-hero">
        <div className="wf-stage-hero__copy">
          <div className="wf-stage-hero__badge">
            <span className="wf-stage-hero__badge-icon">
              <AppIcon name={stageMeta.icon} size={16} />
            </span>
            <span>{stageMeta.label}</span>
          </div>
          <h3 className="wf-stage-hero__title">{stageMeta.title}</h3>
          <p className="wf-stage-hero__desc">{stageMeta.description}</p>
          {summary && (
            <div className="wf-stage-summary">
              <div className="wf-stage-summary__label">阶段摘要</div>
              <div className="wf-stage-summary__text">{summary}</div>
            </div>
          )}
        </div>

        <div className="wf-stage-signal">
          <div className={`wf-stage-signal__core ${isCompleted ? 'is-complete' : ''}`}>
            <AppIcon name={isCompleted ? 'completed' : stageMeta.icon} size={28} />
          </div>
          <div className="wf-stage-signal__ring wf-stage-signal__ring--outer" />
          <div className="wf-stage-signal__ring wf-stage-signal__ring--inner" />
          <div className="wf-stage-signal__caption">
            {isCompleted ? '已完成收敛' : '实时推进中'}
          </div>
        </div>
      </div>

      <div className="wf-metric-grid">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className="wf-metric-tile"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <div className="wf-metric-tile__icon">
              <AppIcon name={metric.icon} size={15} />
            </div>
            <div className="wf-metric-tile__value">{metric.value}</div>
            <div className="wf-metric-tile__label">{metric.label}</div>
          </div>
        ))}
      </div>

      {tools.length > 0 && (
        <div className="wf-tool-chips">
          {tools.slice(0, 6).map((tool, index) => (
            <span key={`${tool.name}-${index}`} className="wf-tool-chip">
              <AppIcon name={tool.name?.includes('detail') ? 'papers' : 'search'} size={12} />
              {tool.name}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function PaperFlow({ papers, color = 'var(--accent)', variant = 'search' }) {
  return (
    <div className="wf-paper-flow">
      {papers.map((paper, idx) => (
        <PaperCard
          key={paper.id ?? paper.paper_id ?? idx}
          paper={paper}
          color={color}
          index={idx}
          variant={variant}
        />
      ))}
    </div>
  )
}

function PaperCard({ paper, color = 'var(--accent)', index = 0, variant = 'search' }) {
  const abstract = paper.abstract ?? paper.summary ?? paper.notes ?? ''
  const shortAbstract = abstract.length > 180 ? `${abstract.slice(0, 180)}...` : abstract
  const authors = Array.isArray(paper.authors)
    ? `${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ' et al.' : ''}`
    : (paper.authors ?? '')
  const matchScore = typeof paper.match_score === 'number' ? paper.match_score : null
  const relevance = typeof paper.relevance === 'number' ? paper.relevance : null

  return (
    <article
      className={`wf-result-card wf-paper-card wf-paper-card--${variant}`}
      style={{ '--card-accent': color, animationDelay: `${index * 80}ms` }}
    >
      <div className="wf-paper-card__rail" />
      <div className="wf-paper-card__topline">
        <span className="wf-paper-card__index">#{String(index + 1).padStart(2, '0')}</span>
        <span className="wf-paper-card__kind">{variant === 'selected' ? '代表样本' : '候选文献'}</span>
        {matchScore != null && (
          <span className="wf-paper-card__metric">匹配 {matchScore.toFixed(2)}</span>
        )}
        {relevance != null && (
          <span className="wf-paper-card__metric">相关 {relevance.toFixed(1)}</span>
        )}
      </div>

      <h4 className="wf-paper-card__title">{paper.title ?? '无标题'}</h4>

      {(authors || paper.year || paper.published_date || paper.source) && (
        <div className="wf-paper-card__meta">
          {authors && <span>{authors}</span>}
          {(paper.year || paper.published_date) && <span>{paper.year ?? paper.published_date}</span>}
          {paper.source && <span>{paper.source}</span>}
        </div>
      )}

      {shortAbstract && <p className="wf-paper-card__abstract">{shortAbstract}</p>}

      <div className="wf-paper-card__footer">
        {paper.category && <span className="wf-paper-card__pill">{paper.category}</span>}
        {paper.link && (
          <a
            className="wf-paper-card__link"
            href={paper.link}
            target="_blank"
            rel="noreferrer"
          >
            <AppIcon name="search" size={12} />
            原文
          </a>
        )}
      </div>
    </article>
  )
}

function AnalysisFlow({ analyses }) {
  return (
    <div className="wf-analysis-grid">
      {analyses.map((analysis, idx) => (
        <AnalysisCard
          key={analysis.paper_id ?? analysis.title ?? idx}
          analysis={analysis}
          index={idx}
        />
      ))}
    </div>
  )
}

function AnalysisCard({ analysis, index = 0 }) {
  const preferredFields = [
    ['关键发现', analysis.key_findings],
    ['研究方法', analysis.methodology],
    ['主要贡献', analysis.contributions],
    ['局限性', analysis.limitations],
  ].filter(([, value]) => value != null && value !== '')

  const fallbackEntries = preferredFields.length > 0
    ? preferredFields
    : Object.entries(analysis || {})
        .filter(([key, value]) => !['paper_id', 'title', 'paper_title'].includes(key) && value != null && value !== '')
        .slice(0, 6)

  return (
    <div className="wf-result-card wf-analysis-card" style={{ '--card-accent': '#8b5cf6', animationDelay: `${index * 90}ms` }}>
      <div className="wf-analysis-card__scan" />
      <div className="wf-analysis-card__header">
        <div>
          <div className="wf-analysis-card__eyebrow">Paper Decode</div>
          <h4 className="wf-analysis-card__title">{analysis.title ?? analysis.paper_title ?? '论文分析'}</h4>
        </div>
        <span className="wf-analysis-card__badge">
          <AppIcon name="analysis" size={12} />
          已结构化
        </span>
      </div>
      <div className="wf-analysis-card__body">
        {fallbackEntries.map(([label, value]) => (
          <div key={label} className="wf-analysis-card__section">
            <span className="wf-analysis-card__label">{label}</span>
            <span className="wf-analysis-card__text">{toText(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendInsightsPanel({ trendData }) {
  const trend = parseStructuredData(trendData)
  const yearDistribution = asArray(trend.year_distribution)
    .map((item) => ({
      year: String(item.year ?? ''),
      count: Number(item.count ?? 0),
    }))
    .sort((a, b) => a.year.localeCompare(b.year, 'zh-Hans-CN', { numeric: true }))
  const sourceDistribution = asArray(trend.source_distribution)
    .map((item) => ({
      source: String(item.source ?? '未知'),
      count: Number(item.count ?? 0),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
  const categoryDistribution = asArray(trend.category_distribution)
    .map((item) => ({
      label: String(item.category ?? '未分类'),
      count: Number(item.count ?? 0),
    }))
    .sort((a, b) => b.count - a.count)
  const methodDistribution = asArray(trend.method_distribution)
    .map((item) => ({
      label: String(item.method ?? '未标注'),
      count: Number(item.count ?? 0),
    }))
    .sort((a, b) => b.count - a.count)
  const topKeywords = asArray(trend.top_keywords)
    .map((item) => ({
      keyword: String(item.keyword ?? ''),
      count: Number(item.count ?? 0),
    }))
    .filter((item) => item.keyword)
    .sort((a, b) => b.count - a.count)
    .slice(0, 18)

  const hasStructuredData =
    yearDistribution.length > 0 ||
    sourceDistribution.length > 0 ||
    categoryDistribution.length > 0 ||
    methodDistribution.length > 0 ||
    topKeywords.length > 0

  if (!hasStructuredData) {
    return <div className="wf-rich-text">{toText(trendData)}</div>
  }

  return (
    <div className="wf-trend-panel">
      <div className="wf-trend-metrics">
        <TrendMetric label="时间节点" value={yearDistribution.length} icon="queued" />
        <TrendMetric label="来源渠道" value={sourceDistribution.length} icon="feeds" />
        <TrendMetric label="方法簇" value={methodDistribution.length} icon="analysis" />
        <TrendMetric label="热点词" value={topKeywords.length} icon="trends" />
      </div>

      <div className="wf-trend-grid">
        <ChartShell title="时间分布" subtitle="论文年份走势">
          {yearDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={yearDistribution}>
                <defs>
                  <linearGradient id="wfYearGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(249,115,22,0.95)" />
                    <stop offset="100%" stopColor="rgba(249,115,22,0.08)" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<TrendTooltip labelKey="year" valueSuffix="篇" />} />
                <Area type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2.5} fill="url(#wfYearGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyTrendHint text="暂无时间分布数据" />
          )}
        </ChartShell>

        <ChartShell title="来源分布" subtitle="当前数据源构成">
          {sourceDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sourceDistribution} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 6" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="source" width={72} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<TrendTooltip labelKey="source" valueSuffix="篇" />} />
                <Bar dataKey="count" fill="#63d1ff" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyTrendHint text="暂无来源分布数据" />
          )}
        </ChartShell>

        <DistributionPanel
          title="分类热区"
          subtitle="领域聚焦程度"
          items={categoryDistribution}
          accent="#3b82f6"
        />

        <DistributionPanel
          title="方法谱系"
          subtitle="方法论出现频率"
          items={methodDistribution}
          accent="#8b5cf6"
        />
      </div>

      {topKeywords.length > 0 && (
        <div className="wf-keyword-panel">
          <div className="wf-keyword-panel__header">
            <div>
              <div className="wf-chart-shell__title">热点关键词</div>
              <div className="wf-chart-shell__subtitle">基于候选与代表论文的高频主题</div>
            </div>
          </div>
          <div className="wf-keyword-cloud">
            {topKeywords.map((item, index) => {
              const scale = Math.max(0.9, Math.min(1.35, 0.9 + item.count * 0.08))
              return (
                <span
                  key={`${item.keyword}-${index}`}
                  className="wf-keyword-chip"
                  style={{ transform: `scale(${scale})`, animationDelay: `${index * 60}ms` }}
                >
                  <span>{item.keyword}</span>
                  <span className="wf-keyword-chip__count">{item.count}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function TrendMetric({ label, value, icon }) {
  return (
    <div className="wf-trend-metric">
      <span className="wf-trend-metric__icon">
        <AppIcon name={icon} size={14} />
      </span>
      <span className="wf-trend-metric__value">{value}</span>
      <span className="wf-trend-metric__label">{label}</span>
    </div>
  )
}

function ChartShell({ title, subtitle, children }) {
  return (
    <div className="wf-chart-shell">
      <div className="wf-chart-shell__header">
        <div className="wf-chart-shell__title">{title}</div>
        <div className="wf-chart-shell__subtitle">{subtitle}</div>
      </div>
      <div className="wf-chart-shell__body">{children}</div>
    </div>
  )
}

function DistributionPanel({ title, subtitle, items, accent }) {
  const safeItems = items.slice(0, 6)
  const maxCount = Math.max(...safeItems.map((item) => item.count), 1)

  return (
    <div className="wf-chart-shell">
      <div className="wf-chart-shell__header">
        <div className="wf-chart-shell__title">{title}</div>
        <div className="wf-chart-shell__subtitle">{subtitle}</div>
      </div>
      <div className="wf-rank-list">
        {safeItems.length > 0 ? safeItems.map((item, index) => (
          <div key={`${item.label}-${index}`} className="wf-rank-item">
            <div className="wf-rank-item__row">
              <span className="wf-rank-item__index">{String(index + 1).padStart(2, '0')}</span>
              <span className="wf-rank-item__label">{item.label}</span>
              <span className="wf-rank-item__value">{item.count}</span>
            </div>
            <div className="wf-rank-item__bar">
              <div
                className="wf-rank-item__fill"
                style={{
                  width: `${(item.count / maxCount) * 100}%`,
                  background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 60%, white))`,
                }}
              />
            </div>
          </div>
        )) : <EmptyTrendHint text="暂无分布数据" compact />}
      </div>
    </div>
  )
}

function EmptyTrendHint({ text, compact = false }) {
  return (
    <div className={compact ? 'wf-empty-hint wf-empty-hint--compact' : 'wf-empty-hint'}>
      <AppIcon name="queued" size={14} />
      <span>{text}</span>
    </div>
  )
}

function TrendTooltip({ active, payload, label, labelKey, valueSuffix = '' }) {
  if (!active || !payload?.length) return null

  return (
    <div className="wf-chart-tooltip">
      <div className="wf-chart-tooltip__label">{label ?? payload[0]?.payload?.[labelKey]}</div>
      <div className="wf-chart-tooltip__value">{payload[0].value}{valueSuffix}</div>
    </div>
  )
}
