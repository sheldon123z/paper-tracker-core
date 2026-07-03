import { useMemo, useState } from 'react'
import { Badge, Button, Modal } from '../ui'

const CAP_LABELS = {
  supports_streaming: '流式输出',
  supports_tool_calling: '工具调用',
  supports_reasoning: '推理模式',
  supports_vision: '视觉理解',
}

export default function ModelCompareModal({ isOpen, onClose, configs }) {
  const [selectedIds, setSelectedIds] = useState(new Set())

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 4) next.add(id)
      return next
    })
  }

  const selected = useMemo(
    () => configs.filter((c) => selectedIds.has(c.id)),
    [configs, selectedIds],
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="模型对比" size="2xl">
      <div className="flex gap-4" style={{ minHeight: 300 }}>
        {/* Left: model selector */}
        <div className="w-48 shrink-0 border-r pr-3 overflow-y-auto" style={{ borderColor: 'var(--border)', maxHeight: 400 }}>
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            选择模型 (最多 4 个)
          </p>
          {configs.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-1.5 py-1 cursor-pointer text-xs"
              style={{ color: 'var(--text-primary)' }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(c.id)}
                onChange={() => toggle(c.id)}
                disabled={!selectedIds.has(c.id) && selectedIds.size >= 4}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="truncate">{c.display_name || c.model_name}</span>
            </label>
          ))}
        </div>

        {/* Right: comparison table */}
        <div className="flex-1 overflow-x-auto">
          {selected.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-secondary)' }}>
              请在左侧选择要对比的模型
            </div>
          ) : (
            <table className="w-full text-xs" style={{ color: 'var(--text-primary)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <th className="px-2 py-1.5 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>属性</th>
                  {selected.map((c) => (
                    <th key={c.id} className="px-2 py-1.5 text-center font-medium" style={{ maxWidth: 120 }}>
                      <span className="truncate block">{c.display_name || c.model_name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Provider" values={selected.map((c) => c.provider_label || c.provider)} />
                <Row label="模型" values={selected.map((c) => <span className="font-mono">{c.model_name}</span>)} />
                <Row label="类型" values={selected.map((c) => c.is_local ? '本地' : '远程')} />
                <Row
                  label="健康状态"
                  values={selected.map((c) => (
                    <Badge
                      key={c.id}
                      variant={c.health_status === 'ok' ? 'success' : c.health_status === 'unknown' ? 'neutral' : 'danger'}
                      style={{ fontSize: 10 }}
                    >
                      {c.health_status}
                    </Badge>
                  ))}
                />
                {Object.entries(CAP_LABELS).map(([key, label]) => (
                  <Row
                    key={key}
                    label={label}
                    values={selected.map((c) => c.capabilities?.[key] ? '✓' : '—')}
                  />
                ))}
                <Row label="TTFT" values={selected.map((c) => c.last_ttft_ms != null ? `${c.last_ttft_ms}ms` : '—')} />
                <Row label="吞吐" values={selected.map((c) => c.last_tokens_per_second != null ? `${c.last_tokens_per_second} tok/s` : '—')} />
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button variant="ghost" onClick={onClose}>关闭</Button>
      </div>
    </Modal>
  )
}

function Row({ label, values }) {
  return (
    <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
      <td className="px-2 py-1.5 font-medium whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-2 py-1.5 text-center">{v}</td>
      ))}
    </tr>
  )
}
