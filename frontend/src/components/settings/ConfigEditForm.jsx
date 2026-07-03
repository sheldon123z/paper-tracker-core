import { useState } from 'react'
import { Badge, Button, Input } from '../ui'

const labelCss = { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 500 }
const selectCss = { width: '100%', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', padding: '7px 10px', fontSize: 13, outline: 'none' }
const textAreaCss = { width: '100%', minHeight: 80, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', padding: '8px 10px', fontSize: 12, fontFamily: 'ui-monospace, monospace', outline: 'none', resize: 'vertical' }

/**
 * Inline edit form for creating / editing a single LLM config.
 *
 * The form state (`form`, `setForm`) is owned by the parent so the parent can
 * initialise it from an existing config and read the final payload.
 */
export default function ConfigEditForm({ form, setForm, selectedProvider, providerOptions, providerMap, onSubmit, onCancel, submitting, formError, isNew }) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleProviderChange = (key) => {
    setForm((cur) => {
      const next = providerMap[key]
      const prev = providerMap[cur.provider]
      return {
        ...cur,
        provider: key,
        base_url: (!cur.base_url || cur.base_url === prev?.default_base_url) ? (next?.default_base_url || '') : cur.base_url,
        model_name: (!cur.model_name || cur.model_name === prev?.default_model_hint) ? (next?.default_model_hint || '') : cur.model_name,
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label style={labelCss}>Provider</label>
          <select value={form.provider} onChange={(e) => handleProviderChange(e.target.value)} style={selectCss}>
            {providerOptions.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <Input label="显示名称" value={form.display_name} onChange={(e) => setForm((c) => ({ ...c, display_name: e.target.value }))} placeholder="我的 GPT-4o" />
        <Input label="模型名称" value={form.model_name} onChange={(e) => setForm((c) => ({ ...c, model_name: e.target.value }))} placeholder={selectedProvider?.default_model_hint || 'gpt-4o-mini'} />
        <Input label={`API Key${selectedProvider?.requires_api_key ? '' : '（可选）'}`} type="password" value={form.api_key} onChange={(e) => setForm((c) => ({ ...c, api_key: e.target.value }))} placeholder={isNew ? (selectedProvider?.requires_api_key ? 'sk-...' : '本地可留空') : '留空保持不变'} />
        <Input label="Base URL（可选）" value={form.base_url} onChange={(e) => setForm((c) => ({ ...c, base_url: e.target.value }))} placeholder={selectedProvider?.default_base_url || 'https://...'} className="md:col-span-2" />
      </div>

      {selectedProvider && (
        <div className="text-xs flex flex-wrap items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <Badge variant="neutral" style={{ fontSize: 11 }}>{selectedProvider.api_format}</Badge>
          <Badge variant={selectedProvider.is_local ? 'warning' : 'neutral'} style={{ fontSize: 11 }}>{selectedProvider.is_local ? '本地' : '远程'}</Badge>
          {selectedProvider.requires_api_key && <Badge variant="warning" style={{ fontSize: 11 }}>需要 Key</Badge>}
          <span style={{ marginLeft: 4 }}>{selectedProvider.description}</span>
        </div>
      )}

      <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', padding: '2px 0' }}>
        <span style={{ display: 'inline-block', transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', fontSize: 11 }}>&#9654;</span>
        高级设置
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label style={labelCss}>extra_headers</label>
            <textarea value={form.extra_headers_json} onChange={(e) => setForm((c) => ({ ...c, extra_headers_json: e.target.value }))} style={textAreaCss} spellCheck="false" />
          </div>
          <div>
            <label style={labelCss}>extra_body</label>
            <textarea value={form.extra_body_json} onChange={(e) => setForm((c) => ({ ...c, extra_body_json: e.target.value }))} style={textAreaCss} spellCheck="false" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={form.is_enabled} onChange={(e) => setForm((c) => ({ ...c, is_enabled: e.target.checked }))} /> 启用
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((c) => ({ ...c, is_default: e.target.checked }))} /> 默认
          </label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" type="submit" loading={submitting}>{isNew ? '添加' : '保存'}</Button>
          <Button size="sm" variant="ghost" type="button" onClick={onCancel}>取消</Button>
        </div>
      </div>

      {formError && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: 'var(--danger-light)', color: 'var(--danger)' }}>{formError}</div>
      )}
    </form>
  )
}
