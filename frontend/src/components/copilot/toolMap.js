/**
 * Tool name → { label, Renderer } mapping.
 * Used by ToolCallRenderer for both live AG-UI stream tool calls and tool
 * calls replayed via MESSAGES_SNAPSHOT (thread restore).
 *
 * Renderers are loaded via React.lazy() to avoid bundling all 124 KB of tool
 * card components into the initial chunk.  Each renderer is fetched on first
 * use, reducing time-to-interactive (Issue #45).
 */
import React, { Suspense } from 'react'

// Keep DefaultRenderer as a regular import — it is tiny and used as the fallback.
import DefaultRenderer from './tool-renderers/DefaultRenderer'

export { DefaultRenderer, Suspense }

// Re-export ErrorBoundary so consumers import from a single module.
export { default as ErrorBoundary } from './ErrorBoundary'

// Lazy-load every specialised renderer.
const ComparePapersRenderer = React.lazy(() => import('./tool-renderers/ComparePapersRenderer'))
const DuplicateDetectionRenderer = React.lazy(() => import('./tool-renderers/DuplicateDetectionRenderer'))
const FavoritesOverviewRenderer = React.lazy(() => import('./tool-renderers/FavoritesOverviewRenderer'))
const FeedStatusRenderer = React.lazy(() => import('./tool-renderers/FeedStatusRenderer'))
const PaperDetailRenderer = React.lazy(() => import('./tool-renderers/PaperDetailRenderer'))
const PaperHighlightsRenderer = React.lazy(() => import('./tool-renderers/PaperHighlightsRenderer'))
const PaperNotesRenderer = React.lazy(() => import('./tool-renderers/PaperNotesRenderer'))
const ReadingProgressRenderer = React.lazy(() => import('./tool-renderers/ReadingProgressRenderer'))
const RecentActivityRenderer = React.lazy(() => import('./tool-renderers/RecentActivityRenderer'))
const ResearchStatsRenderer = React.lazy(() => import('./tool-renderers/ResearchStatsRenderer'))
const ResearchTrendsRenderer = React.lazy(() => import('./tool-renderers/ResearchTrendsRenderer'))
const SearchPapersRenderer = React.lazy(() => import('./tool-renderers/SearchPapersRenderer'))
const TagAnalysisRenderer = React.lazy(() => import('./tool-renderers/TagAnalysisRenderer'))
const TimelineRenderer = React.lazy(() => import('./tool-renderers/TimelineRenderer'))

const TOOL_MAP = {
  search_papers: { label: '搜索论文', Renderer: SearchPapersRenderer },
  get_paper_detail: { label: '论文详情', Renderer: PaperDetailRenderer },
  get_latest_papers: { label: '最新论文', Renderer: SearchPapersRenderer },
  get_research_stats: { label: '研究统计', Renderer: ResearchStatsRenderer },
  compare_papers: { label: '对比论文', Renderer: ComparePapersRenderer },
  get_category_papers: { label: '分类论文', Renderer: SearchPapersRenderer },
  get_feed_status: { label: 'RSS 源状态', Renderer: FeedStatusRenderer },
  get_paper_timeline: { label: '论文时间线', Renderer: TimelineRenderer },
  get_tag_analysis: { label: '标签分析', Renderer: TagAnalysisRenderer },
  get_reading_progress: { label: '阅读进度', Renderer: ReadingProgressRenderer },
  get_recent_activity: { label: '近期活动', Renderer: RecentActivityRenderer },
  get_paper_notes: { label: '论文笔记', Renderer: PaperNotesRenderer },
  find_duplicates: { label: '重复检测', Renderer: DuplicateDetectionRenderer },
  get_favorites_overview: { label: '收藏概览', Renderer: FavoritesOverviewRenderer },
  analyze_paper_highlights: { label: '论文要点', Renderer: PaperHighlightsRenderer },
  get_research_trends: { label: '研究趋势', Renderer: ResearchTrendsRenderer },
}

export default TOOL_MAP
