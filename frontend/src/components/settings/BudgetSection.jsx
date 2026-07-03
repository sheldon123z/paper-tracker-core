import { useEffect, useState } from 'react'
import api from '../../api'
import { Badge, Button, Card, Input, useToast } from '../ui'

export default function BudgetSection() {
  const [budgets, setBudgets] = useState([])
  const [status, setStatus] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ budget_type: 'tokens', monthly_limit: '', alert_threshold: '0.8' })
  const { addToast } = useToast()

  const load = async () => {
    try {
      const [bR, sR] = await Promise.all([
        api.get('/api/budget'),
        api.get('/api/budget/status'),
      ])
      setBudgets(bR.data)
      setStatus(sR.data.budgets || [])
    } catch { /* ignore */ }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/budget', {
        budget_type: form.budget_type,
        monthly_limit: Number(form.monthly_limit),
        alert_threshold: Number(form.alert_threshold),
      })
      addToast({ type: 'success', message: '预算已创建' })
      setShowAdd(false)
      setForm({ budget_type: 'tokens', monthly_limit: '', alert_threshold: '0.8' })
      await load()
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '创建失败' })
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/budget/${id}`)
      addToast({ type: 'success', message: '已删除' })
      await load()
    } catch { addToast({ type: 'error', message: '删除失败' }) }
  }

  const statusMap = Object.fromEntries(status.map((s) => [s.budget_id, s]))

  return (
    <Card title="预算告警" className="mt-4">
      <div className="space-y-2">
        {budgets.length === 0 && !showAdd && (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            暂未设置预算限额
          </p>
        )}

        {budgets.map((b) => {
          const s = statusMap[b.id]
          const pct = s ? Math.round(s.usage_percent * 100) : 0
          return (
            <div
              key={b.id}
              className="rounded-lg border p-3 flex items-center justify-between gap-3"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  <Badge variant={b.budget_type === 'tokens' ? 'neutral' : 'warning'} style={{ fontSize: 10 }}>
                    {b.budget_type === 'tokens' ? 'Tokens' : '成本 (USD)'}
                  </Badge>
                  {b.config_id ? `模型 #${b.config_id}` : '全局'}
                  {!b.is_enabled && <Badge variant="neutral" style={{ fontSize: 10 }}>已禁用</Badge>}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        backgroundColor: pct >= 100 ? 'var(--danger)' : pct >= b.alert_threshold * 100 ? 'var(--warning)' : 'var(--success)',
                      }}
                    />
                  </div>
                  <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {s ? `${b.budget_type === 'cost' ? '$' : ''}${s.current_usage.toLocaleString()}` : '—'} / {b.budget_type === 'cost' ? '$' : ''}{b.monthly_limit.toLocaleString()}
                    {' '}({pct}%)
                  </span>
                </div>
                {s?.alert && (
                  <p className="text-xs mt-1" style={{ color: s.exceeded ? 'var(--danger)' : 'var(--warning)' }}>
                    {s.exceeded ? '已超出预算限额!' : `已达到 ${Math.round(b.alert_threshold * 100)}% 预警阈值`}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleDelete(b.id)}
                className="text-xs cursor-pointer"
                style={{ color: 'var(--danger)', background: 'none', border: 'none' }}
              >
                删除
              </button>
            </div>
          )
        })}

        {showAdd ? (
          <form onSubmit={handleCreate} className="rounded-lg border-2 border-dashed p-3 space-y-2" style={{ borderColor: 'var(--accent)' }}>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>类型</label>
                <select
                  value={form.budget_type}
                  onChange={(e) => setForm((f) => ({ ...f, budget_type: e.target.value }))}
                  className="w-full rounded border px-2 py-1 text-xs outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="tokens">Tokens</option>
                  <option value="cost">成本 (USD)</option>
                </select>
              </div>
              <Input label="月度限额" type="number" value={form.monthly_limit} onChange={(e) => setForm((f) => ({ ...f, monthly_limit: e.target.value }))} placeholder={form.budget_type === 'tokens' ? '1000000' : '10.00'} />
              <Input label="预警阈值" type="number" value={form.alert_threshold} onChange={(e) => setForm((f) => ({ ...f, alert_threshold: e.target.value }))} placeholder="0.8" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" type="submit">创建</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setShowAdd(false)}>取消</Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}>+ 添加预算</Button>
        )}
      </div>
    </Card>
  )
}
