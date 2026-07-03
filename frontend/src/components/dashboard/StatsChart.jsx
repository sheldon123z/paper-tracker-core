import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function formatDateLabel(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function deriveSignals(data = []) {
  const total = data.reduce((sum, item) => sum + Number(item.count || 0), 0)
  const peakItem = data.reduce((best, item) => {
    if (!best || Number(item.count || 0) > Number(best.count || 0)) return item
    return best
  }, null)
  const latest = Number(data[data.length - 1]?.count || 0)
  const previous = Number(data[data.length - 2]?.count || 0)
  const delta = previous > 0 ? ((latest - previous) / previous) * 100 : latest > 0 ? 100 : 0

  return [
    { label: '近 30 天总量', value: `${total}`, accent: 'var(--accent)' },
    { label: '峰值日期', value: peakItem ? formatDateLabel(peakItem.date) : '—', accent: 'var(--warning)' },
    { label: '环比变化', value: `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`, accent: delta >= 0 ? 'var(--success)' : 'var(--danger)' },
  ]
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: 'var(--glass-card-premium)',
        border: '1px solid var(--glass-stroke)',
        borderRadius: 14,
        padding: '10px 12px',
        fontSize: 12,
        color: 'var(--text-primary)',
        boxShadow: 'var(--glass-shadow-edge), var(--shadow-sm)',
        backdropFilter: 'blur(var(--glass-blur-medium)) saturate(var(--glass-saturate))',
        WebkitBackdropFilter: 'blur(var(--glass-blur-medium)) saturate(var(--glass-saturate))',
      }}
    >
      <p style={{ color: 'var(--text-muted-strong)', marginBottom: 4 }}>{formatDateLabel(label)}</p>
      <p style={{ fontWeight: 700 }}>{payload[0].value} 篇</p>
    </div>
  )
}

function SignalChip({ label, value, accent }) {
  return (
    <div
      className="glass-subtle"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
        padding: '10px 12px',
        borderRadius: 16,
        borderColor: 'color-mix(in srgb, var(--glass-stroke) 82%, transparent)',
      }}
    >
      <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted-strong)', fontWeight: 700 }}>
        {label}
      </span>
      <span className="font-display metric-display-safe" style={{ fontSize: 16, color: accent }}>
        {value}
      </span>
    </div>
  )
}

export default function StatsChart({ data }) {
  const chartData = Array.isArray(data) ? data : []
  const summarySignals = deriveSignals(chartData)
  const useBars = chartData.length <= 4

  return (
    <div
      className="glass-panel glass-premium panel-outline rounded-shell border p-4"
      style={{ borderColor: 'var(--glass-stroke)' }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="panel-header-kicker mb-2">Trend Signal</div>
          <h3 className="font-display metric-display-safe text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            论文趋势
          </h3>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted-strong)' }}>
            观察近阶段论文摄取密度、峰值节点与变化斜率。
          </p>
        </div>

        <div className="grid min-w-[280px] flex-1 gap-2 sm:grid-cols-3">
          {summarySignals.map((signal) => (
            <SignalChip key={signal.label} {...signal} />
          ))}
        </div>
      </div>

      <div style={{ height: 248 }}>
        <ResponsiveContainer width="100%" height="100%">
          {useBars ? (
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                minTickGap={18}
                tick={{ fontSize: 11, fill: 'var(--text-secondary-strong)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-secondary-strong)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--accent-light)' }} />
              <Bar dataKey="count" fill="url(#trendBarGradient)" radius={[10, 10, 4, 4]} />
              <defs>
                <linearGradient id="trendBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(var(--accent-rgb), 0.96)" />
                  <stop offset="100%" stopColor="rgba(var(--accent-rgb), 0.38)" />
                </linearGradient>
              </defs>
            </BarChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 16 }}>
              <defs>
                <linearGradient id="trendAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(var(--accent-rgb), 0.34)" />
                  <stop offset="100%" stopColor="rgba(var(--accent-rgb), 0.04)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                minTickGap={18}
                tick={{ fontSize: 11, fill: 'var(--text-secondary-strong)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--text-secondary-strong)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="count" fill="url(#trendAreaGradient)" stroke="none" />
              <Line
                type="monotone"
                dataKey="count"
                stroke="rgba(var(--accent-rgb), 0.96)"
                strokeWidth={2.6}
                dot={{ r: 0 }}
                activeDot={{ r: 4, fill: 'rgba(var(--accent-rgb), 0.96)', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
