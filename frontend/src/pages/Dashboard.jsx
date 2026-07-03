import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import useStore from '../store'
import StatsChart from '../components/dashboard/StatsChart'
import { Card, Skeleton } from '../components/ui'

function AnimatedValue({ value, decimals = 0 }) {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    if (typeof value !== 'number') {
      setDisplayValue(value)
      return
    }

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      setDisplayValue(value)
      return
    }

    const duration = 560
    const start = performance.now()
    let frame = 0

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Number((value * eased).toFixed(decimals)))
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [decimals, value])

  if (typeof displayValue !== 'number') return displayValue
  return displayValue.toFixed(decimals)
}

function StatCard({ label, value, index = 0 }) {
  const isNumber = typeof value === 'number'
  const decimals = Number.isInteger(value) ? 0 : 1

  return (
    <Card
      surface="premium"
      className="min-h-[146px] border-glass/80"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="panel-header-kicker mb-4">Metric Node</div>
      <p className="mb-2 text-xs uppercase tracking-[0.16em]" style={{ color: 'var(--text-muted-strong)' }}>{label}</p>
      <p className="font-display metric-display-safe pt-1 text-[2rem] font-semibold" style={{ color: 'var(--text-primary)' }}>
        {isNumber ? <AnimatedValue value={value} decimals={decimals} /> : value}
      </p>
    </Card>
  )
}

function StatCardSkeleton() {
  return (
    <Card>
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-8 w-16" />
    </Card>
  )
}

function RecentPaperRow({ paper }) {
  const openTab = useStore((s) => s.openTab)
  const navigate = useNavigate()

  const handleClick = () => {
    openTab(paper)
    navigate('/papers')
  }

  return (
    <div
      className="flex items-start gap-3 py-2.5 border-b last:border-b-0 cursor-pointer rounded px-1 transition-colors hover:bg-[var(--bg-secondary)]"
      style={{ borderColor: 'var(--border)' }}
      onClick={handleClick}
    >
      <div
        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
        style={{ backgroundColor: paper.is_read ? 'var(--border)' : 'var(--accent)' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug line-clamp-1" style={{ color: 'var(--text-primary)' }}>
          {paper.title}
        </p>
        {paper.authors && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {Array.isArray(paper.authors)
              ? paper.authors.slice(0, 2).join(', ')
              : paper.authors}
          </p>
        )}
      </div>
      {paper.published_date && (
        <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {paper.published_date?.slice(0, 10)}
        </span>
      )}
    </div>
  )
}

function SchedulerStatusBadge({ status }) {
  if (!status) return null
  const running = status.running
  return (
    <div
      className="glass-panel glass-medium panel-outline rounded-glass border p-4 flex items-center gap-3"
      style={{ borderColor: 'var(--glass-stroke)' }}
    >
      <div
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: running ? '#10b981' : '#9ca3af' }}
      />
      <div>
        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          调度器 {running ? '运行中' : '已停止'}
        </p>
        {status.jobs?.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {status.jobs.length} 个任务
          </p>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recentPapers, setRecentPapers] = useState([])
  const [schedulerStatus, setSchedulerStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/stats').then((r) => r.data).catch(() => null),
      api
        .get('/api/papers', { params: { page: 1, size: 5 } })
        .then((r) => r.data?.items?.slice(0, 5) || [])
        .catch(() => []),
      api
        .get('/api/scheduler/status')
        .then((r) => r.data)
        .catch(() => null),
    ]).then(([s, papers, scheduler]) => {
      setStats(s)
      setRecentPapers(papers)
      setSchedulerStatus(scheduler)
      setLoading(false)
    })
  }, [])

  const trendData = useMemo(
    () => Object.entries(stats?.papers_over_time || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    [stats?.papers_over_time],
  )

  const statCards = [
    { label: '总论文数', value: stats?.total_papers ?? '—' },
    { label: '未读', value: stats?.unread_papers ?? '—' },
    { label: '已收藏', value: stats?.favorited_papers ?? '—' },
    {
      label: '平均相关度',
      value: stats?.avg_relevance != null ? Number(stats.avg_relevance.toFixed(1)) : '—',
    },
  ]

  return (
    <section className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="panel-header-kicker mb-2">Research Overview</div>
          <h1 className="section-title text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            仪表盘
          </h1>
          <p className="mt-2 text-sm text-muted-strong">
            监测论文摄取、阅读优先级与近阶段研究热度变化。
          </p>
        </div>
        <div className="hidden sm:block">
          {schedulerStatus && <SchedulerStatusBadge status={schedulerStatus} />}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          : statCards.map(({ label, value }, index) => (
              <StatCard key={label} label={label} value={value} index={index} />
            ))}
      </div>

      {/* Trend chart */}
      {loading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : trendData.length > 0 ? (
        <StatsChart data={trendData} />
      ) : (
        <div
          className="h-72 rounded-xl border flex items-center justify-center text-sm"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
          }}
        >
          暂无趋势数据
        </div>
      )}

      {/* Recent papers */}
      <Card title="最近论文">
        {loading ? (
          <Skeleton lines={5} />
        ) : recentPapers.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            暂无论文
          </p>
        ) : (
          <div>
            {recentPapers.map((p) => (
              <RecentPaperRow key={p.id} paper={p} />
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}
