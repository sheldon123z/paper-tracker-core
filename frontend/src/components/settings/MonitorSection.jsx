import { useEffect, useState } from 'react'
import api from '../../api'
import useStore from '../../store'
import { Card } from '../ui'
import BudgetSection from './BudgetSection'
import {
  filterLlmConfigsForRuntime,
  RUNTIME_CAPABILITIES,
} from '../../config/runtime'

export default function MonitorSection() {
  const [summary, setSummary] = useState(null)
  const [byModel, setByModel] = useState([])
  const [timeline, setTimeline] = useState([])
  const [cost, setCost] = useState(null)
  const [configs, setConfigs] = useState([])
  const [days, setDays] = useState(30)
  const [loadWarnings, setLoadWarnings] = useState([])
  const isManager = useStore((state) => state.user?.role === 'manager')

  useEffect(() => {
    let cancelled = false
    const usageParams = {
      days,
      local_only: RUNTIME_CAPABILITIES.offlineMode,
    }
    const requests = [
      {
        label: '使用总览',
        request: api.get('/api/usage/summary', { params: usageParams }),
        apply: (data) => setSummary(data || null),
        reset: () => setSummary(null),
      },
      {
        label: '模型使用量',
        request: api.get('/api/usage/by-model', { params: usageParams }),
        apply: (data) => setByModel(Array.isArray(data) ? data : []),
        reset: () => setByModel([]),
      },
      {
        label: '调用趋势',
        request: api.get('/api/usage/timeline', { params: usageParams }),
        apply: (data) => setTimeline(Array.isArray(data) ? data : []),
        reset: () => setTimeline([]),
      },
      {
        label: '模型状态',
        request: api.get('/api/llm-configs/brief'),
        apply: (data) => setConfigs(filterLlmConfigsForRuntime(data)),
        reset: () => setConfigs([]),
      },
    ]

    if (isManager && !RUNTIME_CAPABILITIES.offlineMode) {
      requests.push({
        label: '成本估算',
        request: api.get('/api/usage/cost', { params: { days } }),
        apply: (data) => setCost(data || null),
        reset: () => setCost(null),
      })
    } else {
      setCost(null)
    }

    Promise.allSettled(requests.map(({ request }) => request)).then((results) => {
      if (cancelled) return
      const warnings = []
      results.forEach((result, index) => {
        const request = requests[index]
        if (result.status === 'fulfilled') {
          request.apply(result.value?.data)
        } else {
          request.reset()
          warnings.push(request.label)
        }
      })
      setLoadWarnings(warnings)
    })

    return () => { cancelled = true }
  }, [days, isManager])

  const healthCounts = configs.reduce(
    (acc, c) => {
      const s = c.health_status || 'unknown'
      acc[s] = (acc[s] || 0) + 1
      return acc
    },
    {},
  )

  return (
    <div className="space-y-4">
      {loadWarnings.length > 0 && (
        <div
          role="status"
          data-testid="monitor-partial-warning"
          className="rounded-xl border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--warning)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
          }}
        >
          部分监控数据暂不可用：{loadWarnings.join('、')}。其他数据已正常显示。
        </div>
      )}

      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>统计周期:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className="px-2 py-1 rounded text-xs cursor-pointer transition-colors"
            style={{
              backgroundColor: days === d ? 'var(--accent)' : 'var(--bg-secondary)',
              color: days === d ? '#fff' : 'var(--text-secondary)',
              border: 'none',
            }}
          >
            {d} 天
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="可用模型数" value={configs.length} />
        <StatCard label="健康模型" value={healthCounts.ok || 0} color="var(--success)" />
        <StatCard label="总调用次数" value={summary?.total_calls || 0} />
        <StatCard label="总 Tokens" value={formatNum(summary?.total_tokens || 0)} />
      </div>

      {/* Health matrix */}
      <Card title="模型健康状态">
        <div className="flex flex-wrap gap-2">
          {configs.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              title={`${c.display_name || c.model_name}: ${c.health_status}`}
            >
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  backgroundColor: c.health_status === 'ok' ? '#22c55e' : c.health_status === 'unknown' ? '#94a3b8' : '#ef4444',
                }}
              />
              <span className="truncate" style={{ maxWidth: 100 }}>{c.display_name || c.model_name}</span>
            </div>
          ))}
          {configs.length === 0 && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>暂无可用模型</span>}
        </div>
      </Card>

      {/* Usage by model */}
      <Card title="按模型使用量">
        {byModel.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>暂无使用数据</p>
        ) : (
          <div className="space-y-2">
            {byModel.map((m, i) => {
              const maxTokens = Math.max(...byModel.map((x) => x.total_tokens || 1))
              const pct = Math.round(((m.total_tokens || 0) / maxTokens) * 100)
              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span style={{ color: 'var(--text-primary)' }}>
                      {m.model_name} <span style={{ color: 'var(--text-secondary)' }}>({m.provider})</span>
                    </span>
                    <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {m.call_count} 次 / {formatNum(m.total_tokens)} tok
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: 'var(--accent)', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Cost summary */}
      {isManager && !RUNTIME_CAPABILITIES.offlineMode && cost && (
        <Card title="成本估算">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              ${cost.total_estimated_cost_usd?.toFixed(4) || '0.00'}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>/ {days} 天</span>
          </div>
          {cost.breakdown?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ color: 'var(--text-primary)' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    <th className="px-2 py-1 text-left font-medium">模型</th>
                    <th className="px-2 py-1 text-right font-medium">调用</th>
                    <th className="px-2 py-1 text-right font-medium">Tokens</th>
                    <th className="px-2 py-1 text-right font-medium">估算成本</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.breakdown.map((row, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-2 py-1 font-mono">{row.model_name}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{row.call_count}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatNum(row.total_tokens)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {row.estimated_cost_usd != null ? `$${row.estimated_cost_usd.toFixed(4)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <Card title="调用趋势">
          <div className="flex items-end gap-px" style={{ height: 80 }}>
            {(() => {
              const maxCalls = Math.max(...timeline.map((t) => t.calls || 1))
              return timeline.map((t, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{
                    backgroundColor: 'var(--accent)',
                    height: `${Math.max(2, ((t.calls || 0) / maxCalls) * 100)}%`,
                    opacity: 0.7,
                  }}
                  title={`${t.date}: ${t.calls} 次, ${formatNum(t.tokens)} tokens`}
                />
              ))
            })()}
          </div>
          <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            <span>{timeline[0]?.date}</span>
            <span>{timeline[timeline.length - 1]?.date}</span>
          </div>
        </Card>
      )}

      {/* Budget alerts */}
      {isManager && !RUNTIME_CAPABILITIES.offlineMode && <BudgetSection />}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="text-xl font-bold mt-0.5" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function formatNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
