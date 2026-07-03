import { useEffect, useState } from 'react'
import api from '../api'
import { AppIcon, Button, Card, Input } from '../components/ui'

const TAG_COLORS = [
  '#e8f4f8', '#fef3c7', '#d1fae5', '#fee2e2', '#ede9fe',
  '#fce7f3', '#e0f2fe', '#f0fdf4', '#fff7ed', '#f5f3ff',
]

const colorDot = (color) => ({
  width: 12,
  height: 12,
  borderRadius: '50%',
  backgroundColor: color || 'var(--accent)',
  display: 'inline-block',
  marginRight: 6,
  flexShrink: 0,
})

export default function TagsPage() {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0])
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [message, setMessage] = useState(null)

  const loadTags = () => {
    setLoading(true)
    api.get('/api/tags')
      .then(res => setTags(res.data))
      .catch(() => setTags([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTags() }, [])

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newTagName.trim()) return
    try {
      await api.post('/api/tags', { name: newTagName.trim(), color: newTagColor })
      setNewTagName('')
      setNewTagColor(TAG_COLORS[0])
      loadTags()
      showMessage('标签创建成功')
    } catch (err) {
      showMessage(err.response?.data?.detail || '创建失败', 'error')
    }
  }

  const startEdit = (tag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color || TAG_COLORS[0])
  }

  const handleUpdate = async (id) => {
    if (!editName.trim()) return
    try {
      await api.put(`/api/tags/${id}`, { name: editName.trim(), color: editColor })
      setEditingId(null)
      loadTags()
      showMessage('标签已更新')
    } catch (err) {
      showMessage(err.response?.data?.detail || '更新失败', 'error')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('确定删除此标签？关联论文的标签将被移除。')) return
    try {
      await api.delete(`/api/tags/${id}`)
      loadTags()
      showMessage('标签已删除')
    } catch (err) {
      showMessage(err.response?.data?.detail || '删除失败', 'error')
    }
  }

  return (
    <section className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="panel-header-kicker mb-2">Semantic Layers</div>
          <h1 className="section-title text-xl font-bold" style={{ color: 'var(--text-primary)' }}>标签管理</h1>
        </div>
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{tags.length} 个标签</span>
      </div>

      {/* Message */}
      {message && (
        <div
          className="glass-panel glass-subtle rounded-2xl px-3 py-2 text-sm"
          style={{
            color: message.type === 'error' ? '#991b1b' : '#065f46',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Create new tag */}
      <Card title="创建新标签" surface="premium">
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <Input
            label="标签名称"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            placeholder="输入标签名..."
            required
            className="min-w-40 flex-1"
          />
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>颜色</label>
            <div className="flex gap-1.5 flex-wrap">
              {TAG_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewTagColor(c)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    backgroundColor: c,
                    border: newTagColor === c ? '2px solid var(--accent)' : '2px solid var(--border)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  aria-label={`选择颜色 ${c}`}
                />
              ))}
            </div>
          </div>
          <Button type="submit">创建</Button>
        </form>
      </Card>

      {/* Tags list */}
      {loading ? (
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>加载中...</div>
      ) : tags.length === 0 ? (
        <div
          className="glass-panel glass-medium panel-outline rounded-shell border p-8 text-center text-sm"
          style={{ borderColor: 'var(--glass-stroke)', color: 'var(--text-secondary)' }}
        >
          暂无标签，请先创建
        </div>
      ) : (
        <div className="space-y-2">
          {tags.map(tag => (
            <div
              key={tag.id}
              className="glass-panel glass-medium panel-outline rounded-glass border p-3 flex items-center gap-3"
              style={{ borderColor: 'var(--glass-stroke)' }}
            >
              {editingId === tag.id ? (
                <>
                  {/* Color picker in edit mode */}
                  <div className="flex gap-1 flex-wrap">
                    {TAG_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          backgroundColor: c,
                          border: editColor === c ? '2px solid var(--accent)' : '2px solid var(--border)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                        aria-label={`选择颜色 ${c}`}
                      />
                    ))}
                  </div>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="flex-1 rounded border px-2 py-1 text-sm outline-none"
                    style={{
                      borderColor: 'var(--accent)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleUpdate(tag.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                  <button
                    onClick={() => handleUpdate(tag.id)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <span style={colorDot(tag.color)} />
                  <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {tag.name}
                  </span>
                  {tag.paper_count !== undefined && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                    >
                      {tag.paper_count} 篇
                    </span>
                  )}
                  <button
                    onClick={() => startEdit(tag)}
                    className="text-xs px-2 py-1 rounded hover:opacity-80"
                    style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    重命名
                  </button>
                  <button
                    onClick={() => handleDelete(tag.id)}
                    className="text-xs px-2 py-1 rounded hover:opacity-80"
                    style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
                  >
                    删除
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
