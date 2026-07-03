import { useEffect, useState } from 'react'
import api from '../api'
import { Button, Card, Input, Modal, useToast } from '../components/ui'

const initialFeed = { name: '', url: '', source: 'rss', is_active: true, fetch_interval: 3600 }

function formatRelativeTime(isoStr) {
  if (!isoStr) return null
  try {
    const diff = Date.now() - new Date(isoStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins} 分钟前`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs} 小时前`
    return `${Math.floor(hrs / 24)} 天前`
  } catch {
    return isoStr
  }
}

function FeedRow({ feed, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: feed.name,
    url: feed.url,
    source: feed.source,
    is_active: feed.is_active,
    fetch_interval: feed.fetch_interval ?? 3600,
  })
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState(null)

  const handleSave = async () => {
    await onUpdate(feed.id, form)
    setEditing(false)
  }

  const handleTrigger = async () => {
    setTriggering(true)
    setTriggerMsg(null)
    try {
      await api.post(`/api/scheduler/trigger/${feed.id}`)
      setTriggerMsg({ text: '已触发', type: 'success' })
    } catch (err) {
      setTriggerMsg({ text: err.response?.data?.detail || '触发失败', type: 'error' })
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="flex items-end gap-3">
            <Input
              label="抓取间隔 (秒)"
              type="number"
              value={String(form.fetch_interval)}
              onChange={(e) =>
                setForm((f) => ({ ...f, fetch_interval: parseInt(e.target.value) || 3600 }))
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
        <div className="flex items-start gap-4 p-4">
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
                  上次抓取: {formatRelativeTime(feed.last_fetched)}
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
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTrigger}
              loading={triggering}
            >
              {triggering ? '触发中...' : '立即抓取'}
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
  const { addToast } = useToast()

  const loadFeeds = () => {
    api
      .get('/api/feeds')
      .then((res) => setFeeds(res.data))
      .catch(() => {})
  }

  useEffect(() => {
    loadFeeds()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/feeds', form)
      setForm(initialFeed)
      loadFeeds()
      addToast({ type: 'success', message: '订阅已添加' })
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '添加失败' })
    }
  }

  const handleDelete = async () => {
    if (!deleteTargetId) return
    try {
      await api.delete(`/api/feeds/${deleteTargetId}`)
      loadFeeds()
      addToast({ type: 'success', message: '已删除' })
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '删除失败' })
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
      addToast({ type: 'error', message: err.response?.data?.detail || '更新失败' })
    }
  }

  const deleteFeed = feeds.find((f) => f.id === deleteTargetId)

  return (
    <section className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="panel-header-kicker mb-2">Ingestion Network</div>
          <h1 className="section-title text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          订阅管理
          </h1>
        </div>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {feeds.length} 个订阅
        </span>
      </div>

      {/* Add feed form */}
      <Card title="添加订阅" surface="premium">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
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
          <div className="flex items-end gap-3">
            <Input
              label="抓取间隔 (秒)"
              type="number"
              value={String(form.fetch_interval)}
              onChange={(e) =>
                setForm((f) => ({ ...f, fetch_interval: parseInt(e.target.value) || 3600 }))
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
