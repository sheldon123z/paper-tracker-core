import { Button } from '../ui'

/**
 * Batch action bar — shown when selection mode is active and items are selected.
 *
 * State-less presentational component; all logic lives in the parent.
 */
export default function LLMBatchActions({ selectedCount, onBatchAction }) {
  if (selectedCount === 0) return null

  return (
    <div
      className="mt-3 flex items-center justify-between rounded-lg border p-2"
      style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}
    >
      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
        已选 {selectedCount} 项
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => onBatchAction('enable')}>启用</Button>
        <Button size="sm" variant="ghost" onClick={() => onBatchAction('disable')}>禁用</Button>
        <Button size="sm" variant="ghost" onClick={() => onBatchAction('pin')}>置顶</Button>
        <Button size="sm" variant="ghost" onClick={() => onBatchAction('unpin')}>取消置顶</Button>
        <Button size="sm" variant="danger" onClick={() => onBatchAction('delete')}>删除</Button>
      </div>
    </div>
  )
}
