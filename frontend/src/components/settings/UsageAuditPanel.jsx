import { useEffect, useState } from 'react'
import api from '../../api'
import { Button } from '../ui'

export default function UsageAuditPanel() {
  const [data, setData] = useState({ items: [], meta: { total: 0, page: 1, size: 20 } })
  const [page, setPage] = useState(1)
  const [agentFilter, setAgentFilter] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = async (p = page) => {
    setLoading(true)
    try {
      const params = { page: p, size: 20 }
      if (agentFilter) params.agent_type = agentFilter
      const r = await api.get('/api/usage/audit', { params })
      setData(r.data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { if (expanded) load(1) }, [expanded, agentFilter])

  const totalPages = Math.max(1, Math.ceil(data.meta.total / data.meta.size))

  const goPage = (p) => { setPage(p); load(p) }

  const fmtDate = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <div className="mt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium cursor-pointer w-full text-left"
        style={{ color: 'var(--text-primary)', background: 'none', border: 'none', padding: 0 }}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>&#9654;</span>
        使用记录审计
        {data.meta.total > 0 && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>({data.meta.total})</span>}
      </button>

      {expanded && (
        <div className="mt-2">
          {/* Filters */}
          <div className="flex items-center gap-2 mb-2">
            <select
              value={agentFilter}
              onChange={(e) => { setAgentFilter(e.target.value); setPage(1) }}
              className="rounded border px-2 py-1 text-xs outline-none"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            >
              <option value="">全部 Agent</option>
              <option value="paper">Paper</option>
              <option value="global">Global</option>
              <option value="assistant">Assistant</option>
              <option value="workflow">Workflow</option>
              <option value="catalog">Catalog</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-xs" style={{ color: 'var(--text-primary)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <th className="px-2 py-1.5 text-left font-medium">时间</th>
                  <th className="px-2 py-1.5 text-left font-medium">Agent</th>
                  <th className="px-2 py-1.5 text-left font-medium">模型</th>
                  <th className="px-2 py-1.5 text-right font-medium">Tokens</th>
                  <th className="px-2 py-1.5 text-right font-medium">耗时</th>
                  <th className="px-2 py-1.5 text-right font-medium">TTFT</th>
                  <th className="px-2 py-1.5 text-center font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="px-2 py-4 text-center" style={{ color: 'var(--text-secondary)' }}>加载中...</td></tr>
                )}
                {!loading && data.items.length === 0 && (
                  <tr><td colSpan={7} className="px-2 py-4 text-center" style={{ color: 'var(--text-secondary)' }}>暂无记录</td></tr>
                )}
                {!loading && data.items.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                    <td className="px-2 py-1.5">{row.agent_type || '—'}</td>
                    <td className="px-2 py-1.5 font-mono truncate" style={{ maxWidth: 140 }}>{row.model_name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.total_tokens > 0 ? row.total_tokens.toLocaleString() : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.duration_ms > 0 ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.ttft_ms != null ? `${row.ttft_ms}ms` : '—'}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span style={{ color: row.status === 'success' ? 'var(--success)' : 'var(--danger)' }}>
                        {row.status === 'success' ? '✓' : '✗'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <Button size="sm" variant="ghost" onClick={() => goPage(page - 1)} disabled={page <= 1}>上一页</Button>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{page} / {totalPages}</span>
              <Button size="sm" variant="ghost" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>下一页</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
