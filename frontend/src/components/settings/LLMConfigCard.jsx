import { useState } from 'react'
import { Badge } from '../ui'
import ConfigEditForm from './ConfigEditForm'

/* ── Helpers (local to card) ── */

function healthColor(status) {
  switch ((status || '').toLowerCase()) {
    case 'ok': return 'var(--success)'
    case 'testing': return 'var(--warning)'
    case 'unknown': return 'var(--text-secondary)'
    default: return 'var(--danger)'
  }
}

function healthLabel(status) {
  const map = { ok: '正常', testing: '测试中', auth_error: '鉴权失败', billing_error: '额度不足', region_blocked: '区域限制', config_invalid: '配置异常', ssrf_blocked: '安全拦截', error: '错误' }
  return map[(status || '').toLowerCase()] || '未知'
}

function healthVariant(status) {
  const map = { ok: 'success', testing: 'neutral', unknown: 'neutral', billing_error: 'warning', region_blocked: 'warning' }
  return map[(status || '').toLowerCase()] || 'danger'
}

/**
 * Single LLM config card — handles inline editing, health-check display, delete confirmation.
 *
 * All mutation callbacks (onEdit, onDelete, onTest, onSetDefault, onTogglePin, onToggleSelection)
 * are lifted from the parent so that LLMSection stays the single source of truth for API calls.
 */
export default function LLMConfigCard({
  cfg,
  // edit state (owned by parent)
  isEditing,
  form,
  setForm,
  selectedProvider,
  providerOptions,
  providerMap,
  onSubmit,
  onCancel,
  submitting,
  formError,
  // test state
  testResult,
  // selection state
  selectionMode,
  isSelected,
  // callbacks
  onEdit,
  onDelete,
  onTest,
  onSetDefault,
  onTogglePin,
  onToggleSelection,
}) {
  // Delete confirmation is local to this card — no need to lift it
  const [confirmDelete, setConfirmDelete] = useState(false)
  const test = testResult[cfg.id]

  if (isEditing) {
    return (
      <div
        className="rounded-xl border-2 p-4 col-span-full"
        style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <p className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--accent)', display: 'inline-block' }} />
          编辑: {cfg.display_name || cfg.model_name || cfg.provider}
        </p>
        <ConfigEditForm
          form={form}
          setForm={setForm}
          selectedProvider={selectedProvider}
          providerOptions={providerOptions}
          providerMap={providerMap}
          onSubmit={onSubmit}
          onCancel={onCancel}
          submitting={submitting}
          formError={formError}
          isNew={false}
        />
      </div>
    )
  }

  return (
    <div
      className="rounded-lg border p-3 transition-all duration-150 cursor-default"
      style={{
        borderColor: 'var(--border)',
        borderLeftWidth: 3,
        borderLeftColor: healthColor(cfg.health_status),
        backgroundColor: 'var(--bg-secondary)',
        opacity: cfg.is_enabled === false ? 0.5 : 1,
      }}
    >
      {/* Row 1: Name + quick actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {selectionMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelection}
              className="cursor-pointer"
              style={{ accentColor: 'var(--accent)' }}
            />
          )}
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {cfg.display_name || cfg.model_name || cfg.provider}
          </span>
          <Badge variant={healthVariant(cfg.health_status)} style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>
            {healthLabel(cfg.health_status)}
          </Badge>
          {cfg.is_default && <Badge variant="neutral" style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px' }}>默认</Badge>}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {!cfg.is_default && (
            <button
              onClick={onSetDefault}
              className="px-2 py-1 rounded text-xs transition-colors cursor-pointer"
              style={{ color: 'var(--accent)', background: 'none', border: 'none', fontWeight: 500 }}
              title="设为默认模型"
            >
              设默认
            </button>
          )}
          <button
            onClick={onTogglePin}
            className="px-2 py-1 rounded text-xs transition-colors cursor-pointer"
            style={{ color: cfg.is_pinned ? 'var(--warning)' : 'var(--text-secondary)', background: 'none', border: 'none' }}
            title={cfg.is_pinned ? '取消置顶' : '置顶'}
          >
            {cfg.is_pinned ? '\u2605' : '\u2606'}
          </button>
          <button
            onClick={onTest}
            className="px-2 py-1 rounded text-xs transition-colors cursor-pointer"
            style={{ color: 'var(--text-secondary)', background: 'none', border: 'none' }}
            title="测试连接"
          >
            {test?.status === 'testing' ? '...' : '测试'}
          </button>
          <button
            onClick={onEdit}
            className="px-2 py-1 rounded text-xs transition-colors cursor-pointer"
            style={{ color: 'var(--accent)', background: 'none', border: 'none', fontWeight: 500 }}
          >
            编辑
          </button>
          {confirmDelete ? (
            <>
              <button onClick={onDelete} className="px-2 py-1 rounded text-xs cursor-pointer" style={{ color: '#fff', backgroundColor: 'var(--danger)', border: 'none', borderRadius: 4 }}>确认</button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded text-xs cursor-pointer" style={{ color: 'var(--text-secondary)', background: 'none', border: 'none' }}>取消</button>
            </>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="px-2 py-1 rounded text-xs transition-colors cursor-pointer" style={{ color: 'var(--danger)', background: 'none', border: 'none' }}>删除</button>
          )}
        </div>
      </div>

      {/* Row 2: Provider + model */}
      <div className="mt-1 text-[13px] flex items-center gap-1 truncate" style={{ color: 'var(--text-secondary)' }}>
        <span className="font-mono truncate">{cfg.model_name || '\u2014'}</span>
      </div>

      {/* Row 3: URL */}
      <div className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
        {cfg.effective_base_url || 'Provider 默认地址'}
      </div>

      {/* Row 4: Performance metrics (only if data exists) */}
      {(cfg.last_ttft_ms != null || cfg.last_tokens_per_second != null) && (
        <div className="mt-1 text-xs flex items-center gap-2" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
          {cfg.last_ttft_ms != null && <span>TTFT: {cfg.last_ttft_ms}ms</span>}
          {cfg.last_tokens_per_second != null && <span>{'\u26A1'} {cfg.last_tokens_per_second} tok/s</span>}
        </div>
      )}

      {/* Row 5: User tags */}
      {cfg.user_tags?.length > 0 && (
        <div className="mt-1 flex items-center gap-1 flex-wrap">
          {cfg.user_tags.map((tag) => (
            <Badge key={tag} variant="neutral" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{tag}</Badge>
          ))}
        </div>
      )}

      {/* Error / test result */}
      {cfg.last_error && (
        <p className="mt-1 text-xs truncate" style={{ color: 'var(--danger)' }} title={cfg.last_error}>
          {cfg.last_error}
        </p>
      )}
      {test && test.status !== 'testing' && (
        <p className="mt-1 text-xs" style={{ color: test.status === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
          {test.message || test.status}
          {test.status === 'ok' && test.ttft_ms != null && ` \u00B7 TTFT ${test.ttft_ms}ms`}
          {test.status === 'ok' && test.tokens_per_second != null && ` \u00B7 ${test.tokens_per_second} tok/s`}
        </p>
      )}
    </div>
  )
}
