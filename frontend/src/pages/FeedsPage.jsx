import { useEffect, useState } from 'react'
import api from '../api'
import { Badge, Button, Card, Input, Modal, Select, useToast } from '../components/ui'
import { RUNTIME_CAPABILITIES } from '../config/runtime'
import useStore from '../store'

const SECONDS_PER_HOUR = 3600
const DEFAULT_FETCH_INTERVAL_HOURS = 5
const DEFAULT_FETCH_INTERVAL_SECONDS = DEFAULT_FETCH_INTERVAL_HOURS * SECONDS_PER_HOUR

const initialFeed = {
  name: '',
  url: '',
  source: 'rss',
  is_active: true,
  fetch_interval: DEFAULT_FETCH_INTERVAL_SECONDS,
}

function secondsToHours(seconds) {
  return (seconds ?? DEFAULT_FETCH_INTERVAL_SECONDS) / SECONDS_PER_HOUR
}

function hoursToSeconds(hours) {
  const parsed = Number.parseFloat(hours)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * SECONDS_PER_HOUR)
    : DEFAULT_FETCH_INTERVAL_SECONDS
}

function intervalInputValue(seconds) {
  return seconds === '' ? '' : String(secondsToHours(seconds))
}

function updateIntervalFromInput(value) {
  return value === '' ? '' : hoursToSeconds(value)
}

function normalizeFeedForm(form) {
  return {
    ...form,
    fetch_interval: form.fetch_interval === ''
      ? DEFAULT_FETCH_INTERVAL_SECONDS
      : form.fetch_interval,
  }
}

function apiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail.message === 'string') return detail.message
  return fallback
}

export function parseApiTimestamp(isoStr) {
  if (!isoStr) return null
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoStr)
  const normalized = hasTimezone ? isoStr : `${isoStr.replace(' ', 'T')}Z`
  const timestamp = new Date(normalized).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

export function formatRelativeTime(isoStr, now = Date.now()) {
  if (!isoStr) return null
  const fetchedAt = parseApiTimestamp(isoStr)
  if (fetchedAt == null) return isoStr
  const diff = Math.max(0, now - fetchedAt)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  return `${Math.floor(hrs / 24)} 天前`
}

export function FeedRow({ feed, onDelete, onUpdate, onFetched, now, fetchAvailable = true }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: feed.name,
    url: feed.url,
    source: feed.source,
    is_active: feed.is_active,
    fetch_interval: feed.fetch_interval ?? DEFAULT_FETCH_INTERVAL_SECONDS,
  })
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState(null)

  const handleSave = async () => {
    await onUpdate(feed.id, normalizeFeedForm(form))
    setEditing(false)
  }

  const handleTrigger = async () => {
    setTriggering(true)
    setTriggerMsg(null)
    try {
      await api.post(`/api/scheduler/trigger/${feed.id}`)
      await onFetched?.()
      setTriggerMsg({ text: '已触发', type: 'success' })
    } catch (err) {
      setTriggerMsg({ text: apiErrorMessage(err, '触发失败'), type: 'error' })
    } finally {
      setTriggering(false)
      setTimeout(() => setTriggerMsg(null), 3000)
    }
  }

  return (
    <div
      className="glass-panel glass-medium panel-outline rounded-glass border overflow-hidden"
      style={{ borderColor: 'var(--glass-stroke)' }}
    >
      {editing ? (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="名称"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="来源"
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            />
          </div>
          <Input
            label="RSS URL"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              label="自动抓取间隔 (小时)"
              type="number"
              min="1"
              step="1"
              value={intervalInputValue(form.fetch_interval)}
              onChange={(e) =>
                setForm((f) => ({ ...f, fetch_interval: updateIntervalFromInput(e.target.value) }))
              }
              className="flex-1"
            />
            <div className="flex items-center gap-2 pb-1.5">
              <input
                type="checkbox"
                id={`active-${feed.id}`}
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <label
                htmlFor={`active-${feed.id}`}
                className="text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                启用
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>
              保存
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-4 p-4 sm:flex-row">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {feed.name}
              </p>
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: feed.is_active ? 'var(--accent-light)' : 'var(--bg-secondary)',
                  color: feed.is_active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {feed.is_active ? '启用' : '停用'}
              </span>
              <Badge variant={feed.visibility === 'public' ? 'success' : 'neutral'}>
                {feed.visibility === 'public' ? '公共库' : '部门库'}
              </Badge>
            </div>
            <p className="text-xs truncate mb-1" style={{ color: 'var(--text-secondary)' }}>
              {feed.url}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                来源: {feed.source}
              </span>
              {feed.fetch_interval && (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  间隔:{' '}
                  {feed.fetch_interval >= 3600
                    ? `${(feed.fetch_interval / 3600).toFixed(0)}h`
                    : `${Math.round(feed.fetch_interval / 60)}min`}
                </span>
              )}
              {feed.last_fetched && (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  上次抓取: {formatRelativeTime(feed.last_fetched, now)}
                </span>
              )}
            </div>
            {feed.last_error && (
              <p className="text-xs mt-1" style={{ color: '#991b1b' }}>
                错误: {feed.last_error}
              </p>
            )}
            {triggerMsg && (
              <p
                className="text-xs mt-1"
                style={{
                  color: triggerMsg.type === 'success' ? '#065f46' : '#991b1b',
                }}
              >
                {triggerMsg.text}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTrigger}
              loading={triggering}
              disabled={!fetchAvailable || triggering}
              title={!fetchAvailable ? '当前为离线环境，RSS 抓取不会运行' : undefined}
            >
              {triggering ? '触发中...' : fetchAvailable ? '立即抓取' : '离线环境不抓取'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              编辑
            </Button>
            <Button variant="danger" size="sm" onClick={() => onDelete(feed.id)}>
              删除
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FeedsPage() {
  const [feeds, setFeeds] = useState([])
  const [form, setForm] = useState(initialFeed)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [scope, setScope] = useState('department')
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments] = useState([])
  const user = useStore((state) => state.user)
  const { addToast } = useToast()

  const loadFeeds = async () => {
    try {
      const res = await api.get('/api/feeds')
      setFeeds(res.data)
    } catch {
      // Keep the existing list visible during a transient refresh failure.
    }
  }

  useEffect(() => {
    loadFeeds()
    const refreshTimer = window.setInterval(() => {
      setNow(Date.now())
      loadFeeds()
    }, 60_000)
    return () => window.clearInterval(refreshTimer)
  }, [])
  useEffect(() => {
    if (user?.role !== 'manager') return
    api.get('/api/admin/departments').then((res) => {
      const active = (res.data || []).filter((department) => department.status === 'active')
      setDepartments(active)
      if (active[0]) setDepartmentId(String(active[0].id))
    }).catch(() => setDepartments([]))
  }, [user?.role])

  const handleFetched = async () => {
    await loadFeeds()
    setNow(Date.now())
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = normalizeFeedForm(form)
      if (user?.role === 'manager') {
        payload.visibility = scope
        payload.department_id = scope === 'department' ? Number(departmentId) : null
      }
      await api.post('/api/feeds', payload)
      setForm(initialFeed)
      loadFeeds()
      addToast({ type: 'success', message: '订阅已添加' })
    } catch (err) {
      addToast({ type: 'error', message: apiErrorMessage(err, '添加失败') })
    }
  }

  const handleDelete = async () => {
    if (!deleteTargetId) return
    try {
      await api.delete(`/api/feeds/${deleteTargetId}`)
      loadFeeds()
      addToast({ type: 'success', message: '已删除' })
    } catch (err) {
      addToast({ type: 'error', message: apiErrorMessage(err, '删除失败') })
    } finally {
      setDeleteTargetId(null)
    }
  }

  const handleUpdate = async (id, data) => {
    try {
      await api.put(`/api/feeds/${id}`, data)
      loadFeeds()
      addToast({ type: 'success', message: '已更新' })
    } catch (err) {
      addToast({ type: 'error', message: apiErrorMessage(err, '更新失败') })
    }
  }

  const deleteFeed = feeds.find((f) => f.id === deleteTargetId)

  return (
    <section className="space-y-4 p-4">
      {RUNTIME_CAPABILITIES.offlineMode && (
        <div
          role="status"
          className="rounded-xl border px-4 py-3 text-sm leading-6"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
          }}
        >
          当前环境处于离线模式：RSS 订阅配置仍可查看和维护，自动与手动抓取不会运行。
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="panel-header-kicker mb-2">Ingestion Network</div>
          <h1 className="section-title text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            RSS 订阅源
          </h1>
        </div>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {feeds.length} 个订阅
        </span>
      </div>

      {/* Add feed form */}
      <Card title="添加订阅" surface="premium">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="名称"
              placeholder="订阅名称"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="来源类型"
              placeholder="rss / arxiv / ..."
              value={form.source}
              onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
            />
          </div>
          <Input
            label="RSS URL"
            placeholder="https://example.com/feed.xml"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            required
          />
          {user?.role === 'manager' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="入库范围" value={scope} onChange={setScope} options={[{ value: 'public', label: '公共数据库' }, { value: 'department', label: '部门私有数据库' }]} />
              {scope === 'department' && <Select label="所属部门" value={departmentId} onChange={setDepartmentId} options={departments.map((department) => ({ value: String(department.id), label: department.name }))} />}
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              label="自动抓取间隔 (小时)"
              type="number"
              min="1"
              step="1"
              value={intervalInputValue(form.fetch_interval)}
              onChange={(e) =>
                setForm((f) => ({ ...f, fetch_interval: updateIntervalFromInput(e.target.value) }))
              }
              className="flex-1"
            />
            <div className="flex items-center gap-2 pb-1.5">
              <input
                type="checkbox"
                id="new-feed-active"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <label
                htmlFor="new-feed-active"
                className="text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                立即启用
              </label>
            </div>
            <Button type="submit" size="sm" className="mb-0.5">
              添加
            </Button>
          </div>
        </form>
      </Card>

      {/* Feed list */}
      <div className="space-y-2">
        {feeds.length === 0 ? (
          <div
            className="glass-panel glass-medium panel-outline rounded-shell border p-8 text-center text-sm"
            style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-secondary)' }}
          >
            暂无订阅，请先添加
          </div>
        ) : (
          feeds.map((feed) => (
            <FeedRow
              key={feed.id}
              feed={feed}
              onDelete={(id) => setDeleteTargetId(id)}
              onUpdate={handleUpdate}
              onFetched={handleFetched}
              now={now}
              fetchAvailable={!RUNTIME_CAPABILITIES.offlineMode}
            />
          ))
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        title="确认删除"
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleteTargetId(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              确认删除
            </Button>
          </>
        }
      >
        <p>确定删除订阅源「{deleteFeed?.name}」？此操作不可撤销。</p>
      </Modal>
    </section>
  )
}
