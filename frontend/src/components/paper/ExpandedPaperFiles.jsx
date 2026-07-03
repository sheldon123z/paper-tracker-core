import { Skeleton } from '../ui'

const FILE_TYPE_ICONS = {
  pdf: '\u{1F4C4}',
  markdown: '\u{1F4DD}',
  text: '\u{1F4DD}',
  docx: '\u{1F4D8}',
  xlsx: '\u{1F4CA}',
  pptx: '\u{1F4CA}',
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ExpandedPaperFiles({ data, paper, onOpenFile }) {
  const hasNotes = paper?.notes && paper.notes.trim().length > 0
  const isEmpty = !data?.loading && (!data?.files || data.files.length === 0) && !hasNotes

  return (
    <div
      style={{
        backgroundColor: 'rgba(var(--accent-rgb, 99,102,241), 0.03)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {data?.loading && (
        <div className="flex items-center gap-3 px-4 py-2" style={{ paddingLeft: 56 }}>
          <Skeleton className="h-3 w-48" />
        </div>
      )}

      {!data?.loading && data?.files?.map((f) => (
        <div
          key={f.id}
          onClick={(e) => { e.stopPropagation(); onOpenFile(f.id) }}
          className="flex items-center gap-3 px-4 py-1.5 cursor-pointer transition-colors text-sm hover:bg-[rgba(var(--accent-rgb,99,102,241),0.06)]"
          style={{ paddingLeft: 56, color: 'var(--text-primary)' }}
        >
          <span style={{ width: 20, textAlign: 'center' }}>
            {FILE_TYPE_ICONS[f.file_type] || '\u{1F4CE}'}
          </span>
          <span className="font-medium truncate" style={{ minWidth: 120, maxWidth: 280 }}>
            {f.filename}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-secondary)', minWidth: 60 }}>
            {formatSize(f.file_size)}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}
          >
            {(f.file_type || '').toUpperCase()}
          </span>
        </div>
      ))}

      {hasNotes && (
        <div
          className="flex items-center gap-3 px-4 py-1.5 text-sm"
          style={{ paddingLeft: 56, color: 'var(--text-secondary)' }}
        >
          <span style={{ width: 20, textAlign: 'center' }}>{'\u{1F4CB}'}</span>
          <span className="truncate" style={{ maxWidth: 400 }}>
            {paper.notes.slice(0, 80)}{paper.notes.length > 80 ? '...' : ''}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            笔记
          </span>
        </div>
      )}

      {isEmpty && (
        <div
          className="px-4 py-2 text-xs"
          style={{ paddingLeft: 56, color: 'var(--text-secondary)' }}
        >
          暂无附件
        </div>
      )}
    </div>
  )
}
