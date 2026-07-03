import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import useStore from '../../store'

const STATUS_DOT = { ok: '#22c55e', error: '#ef4444', unknown: '#94a3b8', testing: '#eab308' }

export default function ModelSelector() {
  const selectedModelId = useStore((s) => s.selectedModelId)
  const selectedModelMeta = useStore((s) => s.selectedModelMeta)
  const llmCatalog = useStore((s) => s.llmCatalog)
  const llmCatalogLoaded = useStore((s) => s.llmCatalogLoaded)
  const setSelectedModelId = useStore((s) => s.setSelectedModelId)
  const refreshLlmCatalog = useStore((s) => s.refreshLlmCatalog)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (llmCatalogLoaded || llmCatalog.length > 0) return
    refreshLlmCatalog().catch(() => {})
  }, [llmCatalog.length, llmCatalogLoaded, refreshLlmCatalog])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Filter
  const filtered = useMemo(() => {
    if (!query) return llmCatalog
    const q = query.toLowerCase()
    return llmCatalog.filter(
      (m) =>
        (m.label || '').toLowerCase().includes(q) ||
        (m.provider_label || '').toLowerCase().includes(q) ||
        (m.provider || '').toLowerCase().includes(q),
    )
  }, [llmCatalog, query])

  // Group: pinned first, then by provider
  const groups = useMemo(() => {
    const pinned = filtered.filter((m) => m.is_pinned)
    const rest = filtered.filter((m) => !m.is_pinned)
    const byProvider = {}
    rest.forEach((m) => {
      const key = m.provider_label || m.provider || '其他'
      ;(byProvider[key] ||= []).push(m)
    })
    const result = []
    if (pinned.length) result.push({ label: '★ 置顶', items: pinned })
    Object.entries(byProvider).forEach(([label, items]) => result.push({ label, items }))
    return result
  }, [filtered])

  if (llmCatalog.length === 0) return null

  const select = (m) => {
    startTransition(() => setSelectedModelId(m.id))
    setOpen(false)
    setQuery('')
  }

  const label = selectedModelMeta
    ? `${selectedModelMeta.is_pinned ? '★ ' : ''}${selectedModelMeta.label || selectedModelMeta.provider}`
    : '选择模型'

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="w-full flex items-center justify-between rounded border px-2 py-1 text-xs outline-none cursor-pointer"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
      >
        <span className="truncate">{label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg border shadow-lg overflow-hidden"
          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', maxHeight: 320 }}
        >
          {/* Search input */}
          <div className="p-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="搜索模型..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded px-2 py-1 text-xs outline-none"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: 'none' }}
            />
          </div>

          {/* Results */}
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {groups.length === 0 && (
              <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>无匹配模型</div>
            )}
            {groups.map((group) => (
              <div key={group.label}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}>
                  {group.label}
                </div>
                {group.items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => select(m)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left cursor-pointer transition-colors"
                    style={{
                      color: m.id === selectedModelId ? 'var(--accent)' : 'var(--text-primary)',
                      backgroundColor: m.id === selectedModelId ? 'var(--bg-secondary)' : 'transparent',
                      border: 'none',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
                    onMouseLeave={(e) => { if (m.id !== selectedModelId) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    {/* Health dot */}
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: STATUS_DOT[m.health_status] || STATUS_DOT.unknown, flexShrink: 0 }} />
                    <span className="truncate flex-1">{m.label}</span>
                    {m.is_default && <span className="text-[10px] px-1 rounded" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>默认</span>}
                    {m.is_local && <span className="text-[10px] px-1 rounded" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>本地</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
