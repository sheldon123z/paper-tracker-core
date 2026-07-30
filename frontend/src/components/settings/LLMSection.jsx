import { startTransition, useEffect, useMemo, useState } from 'react'
import api from '../../api'
import useStore from '../../store'
import { Button, Card, useToast } from '../ui'
import ConfigEditForm from './ConfigEditForm'
import LLMBatchActions from './LLMBatchActions'
import LLMConfigList from './LLMConfigList'
import ModelCompareModal from './ModelCompareModal'
import UsageAuditPanel from './UsageAuditPanel'
import {
  filterLlmConfigsForRuntime,
  getRuntimeDefaultLlmBaseUrl,
  prepareLlmProvidersForRuntime,
  RUNTIME_CAPABILITIES,
} from '../../config/runtime'

const fallbackProviders = [
  { key: 'openai', label: 'OpenAI', requires_api_key: true, default_model_hint: 'gpt-4o-mini', default_base_url: 'https://api.openai.com/v1', description: 'Official OpenAI models.', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'native' },
  { key: 'claude', label: 'Anthropic Claude', requires_api_key: true, default_model_hint: 'claude-sonnet-4-20250514', default_base_url: null, description: 'Anthropic native API.', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'native' },
  { key: 'deepseek', label: 'DeepSeek', requires_api_key: true, default_model_hint: 'deepseek-chat', default_base_url: 'https://api.deepseek.com', description: 'Official DeepSeek API.', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'native' },
  { key: 'volcengine_ark', label: '火山引擎 ARK', requires_api_key: true, default_model_hint: 'ep-xxxxxxxxxxxxxxxx', default_base_url: 'https://ark.cn-beijing.volces.com/api/v3', description: 'Use your ARK deployment endpoint ID (ep-...).', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'openai_compatible' },
  { key: 'dashscope', label: '阿里云 DashScope', requires_api_key: true, default_model_hint: 'qwen-plus', default_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', description: 'DashScope OpenAI-compatible endpoint.', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'openai_compatible' },
  { key: 'openrouter', label: 'OpenRouter', requires_api_key: true, default_model_hint: 'openai/gpt-4o-mini', default_base_url: 'https://openrouter.ai/api/v1', description: 'OpenRouter unified routing endpoint.', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'native' },
  { key: 'moonshot', label: 'Moonshot / Kimi', requires_api_key: true, default_model_hint: 'moonshot-v1-auto', default_base_url: 'https://api.moonshot.cn/v1', description: 'Moonshot OpenAI-compatible endpoint.', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'openai_compatible' },
  { key: 'zhipu', label: '智谱 AI', requires_api_key: true, default_model_hint: 'glm-4-flash', default_base_url: 'https://open.bigmodel.cn/api/paas/v4', description: 'Zhipu OpenAI-compatible root endpoint.', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'openai_compatible' },
  { key: 'xai', label: 'xAI Grok', requires_api_key: true, default_model_hint: 'grok-3-mini-fast', default_base_url: 'https://api.x.ai/v1', description: 'xAI Grok models.', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'native' },
  { key: 'ollama', label: 'Ollama', requires_api_key: false, default_model_hint: 'qwen3:8b', default_base_url: 'http://127.0.0.1:11434', description: 'Local Ollama server.', is_local: true, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'native' },
  { key: 'vllm', label: 'vLLM', requires_api_key: false, default_model_hint: 'Qwen/Qwen3-8B', default_base_url: 'http://127.0.0.1:8000/v1', description: 'OpenAI-compatible vLLM server.', is_local: true, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'openai_compatible' },
  { key: 'lmstudio', label: 'LM Studio', requires_api_key: false, default_model_hint: 'qwen/qwen3.5-9b', default_base_url: 'http://127.0.0.1:1234/v1', description: 'Local LM Studio OpenAI-compatible server.', is_local: true, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'openai_compatible' },
  { key: 'llamacpp', label: 'llama.cpp', requires_api_key: false, default_model_hint: 'Qwen3-Coder-Next-Q4_K_M.gguf', default_base_url: 'http://localhost:30000/v1', description: 'Local or LAN llama.cpp server with OpenAI-compatible API.', is_local: true, supports_reasoning: true, supports_streaming: true, supports_tools: false, api_format: 'openai_compatible' },
  { key: 'openai_compatible', label: '自定义 OpenAI 兼容接口', requires_api_key: false, default_model_hint: 'custom-model', default_base_url: null, description: 'Remote OpenAI-compatible endpoint over HTTPS.', is_local: false, supports_reasoning: true, supports_streaming: true, supports_tools: true, api_format: 'openai_compatible' },
]

function createDefaultForm() {
  const provider = RUNTIME_CAPABILITIES.offlineMode ? 'ollama' : 'openai'
  return {
    provider,
    display_name: '',
    api_key: '',
    model_name: '',
    base_url: getRuntimeDefaultLlmBaseUrl(provider, '', RUNTIME_CAPABILITIES),
    extra_headers_json: '{}',
    extra_body_json: '{}',
    is_enabled: true,
    is_default: false,
  }
}

/* ── Helpers ── */

function stringifyJson(value) {
  if (!value || typeof value !== 'object') return '{}'
  try { return JSON.stringify(value, null, 2) } catch { return '{}' }
}

function parseJsonObject(raw, fieldName) {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`${fieldName} 必须是 JSON 对象`)
  return parsed
}

/* ── Main component ── */
export default function LLMSection() {
  const [configs, setConfigs] = useState([])
  const [providerOptions, setProviderOptions] = useState(fallbackProviders)
  const [form, setForm] = useState(createDefaultForm)
  const [editingId, setEditingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [testResult, setTestResult] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [search, setSearch] = useState('')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [batchTesting, setBatchTesting] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const { addToast } = useToast()
  const refreshLlmCatalog = useStore((state) => state.refreshLlmCatalog)

  const availableProviderOptions = useMemo(
    () => prepareLlmProvidersForRuntime(providerOptions, RUNTIME_CAPABILITIES),
    [providerOptions],
  )
  const providerMap = useMemo(
    () => Object.fromEntries(availableProviderOptions.map((p) => [p.key, p])),
    [availableProviderOptions],
  )
  const selectedProvider = providerMap[form.provider]
    || availableProviderOptions[0]
    || fallbackProviders.find((provider) => provider.is_local)

  /* ── Data loading ── */
  const loadConfigs = async () => {
    try {
      const r = await api.get('/api/llm-configs')
      startTransition(() => setConfigs(Array.isArray(r.data) ? r.data : []))
    } catch { /* keep state */ }
  }

  const loadProviders = async () => {
    try {
      const r = await api.get('/api/llm-configs/providers')
      if (Array.isArray(r.data) && r.data.length > 0) startTransition(() => setProviderOptions(r.data))
    } catch { /* keep fallback */ }
  }

  const reloadModelData = async () => {
    await loadConfigs()
    try {
      await refreshLlmCatalog({ force: true })
    } catch {
      addToast({ type: 'warning', message: '配置已保存，但模型下拉列表刷新失败，请稍后重试' })
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadConfigs(); loadProviders() }, [])

  /* ── Filtered & grouped configs ── */
  const availableConfigs = useMemo(
    () => filterLlmConfigsForRuntime(configs),
    [configs],
  )
  const filteredConfigs = useMemo(() => {
    if (!search.trim()) return availableConfigs
    const q = search.toLowerCase()
    return availableConfigs.filter((c) =>
      (c.display_name || '').toLowerCase().includes(q) ||
      (c.model_name || '').toLowerCase().includes(q) ||
      (c.provider_label || c.provider || '').toLowerCase().includes(q) ||
      (c.effective_base_url || '').toLowerCase().includes(q) ||
      (c.user_tags || []).some((t) => t.toLowerCase().includes(q))
    )
  }, [availableConfigs, search])

  const groupedConfigs = useMemo(() => {
    const groups = {}
    for (const cfg of filteredConfigs) {
      const key = cfg.provider_label || cfg.provider || 'Other'
      if (!groups[key]) groups[key] = []
      groups[key].push(cfg)
    }
    return groups
  }, [filteredConfigs])

  /* ── CRUD handlers ── */
  const buildPayload = () => {
    const extraHeaders = parseJsonObject(form.extra_headers_json, 'extra_headers')
    const extraBody = parseJsonObject(form.extra_body_json, 'extra_body')
    const payload = {
      provider: form.provider,
      display_name: form.display_name.trim() || null,
      model_name: form.model_name.trim() || selectedProvider?.default_model_hint || '',
      base_url: form.base_url.trim() || null,
      extra_headers: extraHeaders,
      extra_body: extraBody,
      is_local: Boolean(selectedProvider?.is_local),
      is_enabled: form.is_enabled,
      is_default: form.is_default,
    }
    if (form.api_key.trim()) payload.api_key = form.api_key.trim()
    else if (!editingId && !selectedProvider?.requires_api_key) payload.api_key = ''
    return payload
  }

  const resetForm = () => { setEditingId(null); setShowAddForm(false); setForm(createDefaultForm()); setFormError('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')
    try {
      const payload = buildPayload()
      if (editingId) {
        await api.patch(`/api/llm-configs/${editingId}`, payload)
        addToast({ type: 'success', message: 'LLM 配置已更新' })
      } else {
        await api.post('/api/llm-configs', payload)
        addToast({ type: 'success', message: 'LLM 配置已创建' })
      }
      resetForm()
      await reloadModelData()
    } catch (err) {
      const message = err instanceof SyntaxError
        ? 'extra_headers / extra_body 必须是有效 JSON 对象'
        : err.response?.data?.detail || err.response?.data?.message || err.message || '操作失败'
      setFormError(message)
      addToast({ type: 'error', message })
    } finally { setSubmitting(false) }
  }

  const handleEdit = (cfg) => {
    setShowAddForm(false)
    setEditingId(cfg.id)
    setForm({
      provider: cfg.provider,
      display_name: cfg.display_name || '',
      api_key: '',
      model_name: cfg.model_name || '',
      base_url: cfg.base_url || cfg.effective_base_url || '',
      extra_headers_json: stringifyJson(cfg.extra_headers),
      extra_body_json: stringifyJson(cfg.extra_body),
      is_enabled: cfg.is_enabled ?? true,
      is_default: cfg.is_default,
    })
    setFormError('')
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/llm-configs/${id}`)
      await reloadModelData()
      addToast({ type: 'success', message: '已删除' })
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '删除失败' })
    }
  }

  const testConnection = async (id) => {
    setTestResult((c) => ({ ...c, [id]: { status: 'testing', message: '测试中...' } }))
    try {
      const r = await api.post(`/api/llm-configs/${id}/test`)
      setTestResult((c) => ({ ...c, [id]: r.data }))
      await reloadModelData()
    } catch (err) {
      const d = err.response?.data || {}
      setTestResult((c) => ({ ...c, [id]: { status: d.status || 'error', message: d.message || d.detail || '连接失败' } }))
      await reloadModelData()
    }
  }

  const handleTogglePin = async (cfg) => {
    try {
      await api.patch(`/api/llm-configs/${cfg.id}`, { is_pinned: !cfg.is_pinned })
      await reloadModelData()
    } catch (err) {
      addToast({ type: 'error', message: '操作失败' })
    }
  }

  const handleSetDefault = async (cfg) => {
    try {
      await api.patch(`/api/llm-configs/${cfg.id}`, { is_default: true })
      addToast({ type: 'success', message: `已将 ${cfg.display_name || cfg.model_name} 设为默认模型` })
      await reloadModelData()
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '设置默认模型失败' })
    }
  }

  const handleBatchTest = async () => {
    setBatchTesting(true)
    try {
      const r = await api.post('/api/llm-configs/batch-test')
      const d = r.data
      addToast({ type: d.failed > 0 ? 'warning' : 'success', message: `测试完成: ${d.success} 成功, ${d.failed} 失败` })
      await reloadModelData()
    } catch (err) {
      addToast({ type: 'error', message: '批量测试失败' })
    } finally { setBatchTesting(false) }
  }

  const handleBatchAction = async (action) => {
    if (selectedIds.size === 0) return
    try {
      await api.post('/api/llm-configs/batch-action', { config_ids: [...selectedIds], action })
      addToast({ type: 'success', message: `已${action === 'enable' ? '启用' : action === 'disable' ? '禁用' : action === 'delete' ? '删除' : action === 'pin' ? '置顶' : '取消置顶'} ${selectedIds.size} 个配置` })
      setSelectedIds(new Set())
      setSelectionMode(false)
      await reloadModelData()
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '操作失败' })
    }
  }

  const toggleSelection = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAddForm = () => {
    if (showAddForm) resetForm()
    else { setEditingId(null); setForm(createDefaultForm()); setFormError(''); setShowAddForm(true) }
  }

  return (
    <Card
      title="LLM 配置"
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{availableConfigs.length} 个配置</span>
          <Button size="sm" variant="ghost" onClick={async () => {
            try {
              const r = await api.get('/api/llm-configs/export')
              const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' })
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'llm-configs.json'; a.click()
              addToast({ type: 'success', message: '已导出' })
            } catch { addToast({ type: 'error', message: '导出失败' }) }
          }}>
            导出
          </Button>
          <Button size="sm" variant="ghost" onClick={() => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
            input.onchange = async (e) => {
              const file = e.target.files?.[0]; if (!file) return
              try {
                const text = await file.text(); const data = JSON.parse(text)
                await api.post('/api/llm-configs/import', { ...data, mode: 'merge' })
                addToast({ type: 'success', message: '导入完成' }); await reloadModelData()
              } catch { addToast({ type: 'error', message: '导入失败' }) }
            }
            input.click()
          }}>
            导入
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCompareOpen(true)}>
            对比
          </Button>
          {!RUNTIME_CAPABILITIES.offlineMode && (
            <Button size="sm" variant="ghost" onClick={handleBatchTest} disabled={batchTesting}>
              {batchTesting ? '测试中...' : '全部测试'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()) }}>
            {selectionMode ? '退出选择' : '选择'}
          </Button>
          <Button size="sm" variant={showAddForm ? 'ghost' : 'secondary'} onClick={toggleAddForm}>
            {showAddForm ? '取消' : '+ 添加'}
          </Button>
        </div>
      }
      className="mb-4"
    >
      {/* Add new form */}
      {showAddForm && (
        <div className="rounded-xl border-2 border-dashed p-4 mb-4" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-secondary)' }}>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>新增配置</p>
          <ConfigEditForm form={form} setForm={setForm} selectedProvider={selectedProvider} providerOptions={availableProviderOptions} providerMap={providerMap} onSubmit={handleSubmit} onCancel={resetForm} submitting={submitting} formError={formError} isNew />
        </div>
      )}

      {/* Config list (search + grouped cards) */}
      <LLMConfigList
        groupedConfigs={groupedConfigs}
        filteredConfigs={filteredConfigs}
        configs={availableConfigs}
        search={search}
        setSearch={setSearch}
        editingId={editingId}
        form={form}
        setForm={setForm}
        selectedProvider={selectedProvider}
        providerOptions={availableProviderOptions}
        providerMap={providerMap}
        onSubmit={handleSubmit}
        onCancelEdit={resetForm}
        submitting={submitting}
        formError={formError}
        testResult={testResult}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        toggleSelection={toggleSelection}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTest={testConnection}
        onSetDefault={handleSetDefault}
        onTogglePin={handleTogglePin}
        showAddForm={showAddForm}
      />

      {/* Usage audit panel */}
      <UsageAuditPanel />

      {/* Model compare modal */}
      <ModelCompareModal isOpen={compareOpen} onClose={() => setCompareOpen(false)} configs={availableConfigs} />

      {/* Batch action bar */}
      {selectionMode && (
        <LLMBatchActions selectedCount={selectedIds.size} onBatchAction={handleBatchAction} />
      )}
    </Card>
  )
}
