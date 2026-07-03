import { useEffect, useState } from 'react'
import api from '../api'
import { AppIcon, Button, Card, Select } from '../components/ui'

function PaperMiniCard({ paper, isPrimary }) {
  return (
    <div
      className="glass-panel glass-subtle rounded-glass border p-3 min-w-0 flex-1"
      style={{
        backgroundColor: isPrimary ? 'var(--accent-light)' : undefined,
        borderColor: isPrimary ? 'var(--accent)' : 'var(--glass-stroke)',
      }}
    >
      {isPrimary && (
        <span
          className="inline-block text-xs px-2 py-0.5 rounded-full mb-2"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          保留
        </span>
      )}
      <h3
        className="text-sm font-medium leading-snug line-clamp-2 mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {paper.title}
      </h3>
      {paper.authors && (
        <p className="text-xs truncate mb-0.5" style={{ color: 'var(--text-secondary)' }}>
          {Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors}
        </p>
      )}
      {paper.published_date && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {paper.published_date}
        </p>
      )}
      {paper.source && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          来源: {paper.source}
        </p>
      )}
    </div>
  )
}

export default function DuplicatesPage() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState({})
  const [message, setMessage] = useState(null)
  const [threshold, setThreshold] = useState(0.90)
  const [detectMode, setDetectMode] = useState('title') // title | doi | author

  const loadDuplicates = () => {
    setLoading(true)
    api.get('/api/papers/duplicates', { params: { threshold } })
      .then(res => setGroups(res.data))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }

  // Don't auto-scan on mount — user triggers manually
  useEffect(() => {}, [])

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleMerge = async (group, groupIndex) => {
    const primary = group[0]
    const duplicates = group.slice(1)
    setProcessing(p => ({ ...p, [groupIndex]: 'merging' }))
    try {
      await api.post('/api/papers/merge', {
        keep_id: primary.id,
        remove_ids: duplicates.map(p => p.id),
      })
      setGroups(prev => prev.filter((_, i) => i !== groupIndex))
      showMessage(`已合并 ${duplicates.length} 篇重复论文，保留: "${primary.title}"`)
    } catch (err) {
      showMessage(err.response?.data?.detail || '合并失败', 'error')
    } finally {
      setProcessing(p => { const n = { ...p }; delete n[groupIndex]; return n })
    }
  }

  const handleDismiss = (groupIndex) => {
    setGroups(prev => prev.filter((_, i) => i !== groupIndex))
    showMessage('已忽略此重复组')
  }

  return (
    <section className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="panel-header-kicker mb-2">Integrity Check</div>
          <h1 className="section-title text-xl font-bold" style={{ color: 'var(--text-primary)' }}>重复检测</h1>
        </div>
        {!loading && groups.length > 0 && (
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {groups.length} 组重复
          </span>
        )}
      </div>

      {/* Detection controls */}
      <Card surface="premium" className="p-0" bodyClassName="p-4">
        <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>检测方式</label>
          <Select
            value={detectMode}
            onChange={setDetectMode}
            options={[
              { value: 'title', label: '标题相似度' },
              { value: 'doi', label: 'DOI 匹配' },
              { value: 'author', label: '作者 + 标题' },
            ]}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            相似度阈值: {Math.round(threshold * 100)}%
          </label>
          <input
            type="range"
            min="0.7"
            max="1.0"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-32"
          />
        </div>
        <Button
          onClick={loadDuplicates}
          disabled={loading}
        >
          {loading ? '扫描中...' : '开始检测'}
        </Button>
        </div>
      </Card>

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

      {loading ? (
        <div className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
          正在扫描重复论文...
        </div>
      ) : groups.length === 0 ? (
        <div
          className="glass-panel glass-premium panel-outline rounded-shell border p-12 text-center"
          style={{ borderColor: 'var(--glass-stroke)' }}
        >
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full border border-success/20 bg-success-light text-success">
            <AppIcon name="completed" size={24} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>未发现重复论文</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>所有论文均唯一</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group, groupIndex) => (
            <div
              key={groupIndex}
              className="glass-panel glass-medium panel-outline rounded-shell border overflow-hidden"
              style={{ borderColor: 'var(--glass-stroke)' }}
            >
              {/* Group header */}
              <div
                className="px-4 py-2.5 border-b flex items-center justify-between"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  重复组 #{groupIndex + 1} — {group.length} 篇论文
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleMerge(group, groupIndex)}
                    disabled={processing[groupIndex] === 'merging'}
                    className="text-xs px-3 py-1 rounded-xl"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: '#fff',
                      opacity: processing[groupIndex] === 'merging' ? 0.5 : 1,
                    }}
                  >
                    {processing[groupIndex] === 'merging' ? '合并中...' : '合并 (保留第一篇)'}
                  </button>
                  <button
                    onClick={() => handleDismiss(groupIndex)}
                    className="text-xs px-3 py-1 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    忽略
                  </button>
                </div>
              </div>

              {/* Papers side by side */}
              <div className="p-4 flex gap-3 overflow-x-auto">
                {group.map((paper, paperIndex) => (
                  <PaperMiniCard
                    key={paper.id}
                    paper={paper}
                    isPrimary={paperIndex === 0}
                  />
                ))}
              </div>

              {/* Similarity score if available */}
              {group[0]?.similarity_score !== undefined && (
                <div
                  className="px-4 py-2 border-t text-xs"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  相似度: {(group[0].similarity_score * 100).toFixed(1)}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
