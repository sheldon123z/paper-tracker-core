import { useMemo, useState } from 'react'

function parseTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export default function PaperTagSelector({ value, onChange, options = [] }) {
  const [open, setOpen] = useState(false)
  const selectedTags = useMemo(() => parseTags(value), [value])
  const selectedSet = useMemo(() => new Set(selectedTags), [selectedTags])

  const toggleTag = (name) => {
    const next = selectedSet.has(name)
      ? selectedTags.filter((tag) => tag !== name)
      : [...selectedTags, name]
    onChange(next.join(', '))
  }

  return (
    <div className="relative">
      <div className="flex overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-[var(--accent)]/30"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="输入新标签，多个标签用逗号分隔"
          aria-label="论文标签"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="cursor-pointer border-l px-3 text-xs transition-colors hover:bg-[var(--bg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          选择已有标签 <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>

      {open && (
        <div
          role="listbox"
          aria-label="已有标签"
          aria-multiselectable="true"
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-md border p-1 shadow-lg"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-primary)' }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>暂无已有标签</div>
          ) : options.map((tag) => {
            const selected = selectedSet.has(tag.name)
            return (
              <button
                key={tag.id ?? tag.name}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => toggleTag(tag.name)}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                style={{ color: 'var(--text-primary)' }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color || 'var(--accent)' }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className="w-4 text-center" style={{ color: 'var(--accent)' }} aria-hidden="true">{selected ? '✓' : ''}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
