/**
 * ParamsForm — 动态工作流参数配置表单
 */

import { useEffect, useMemo, useState } from 'react'
import useStore from '../../store'

function initFormValues(steps) {
  const values = {}
  for (const step of steps) {
    if (step.type === 'multiselect') {
      values[step.id] = Array.isArray(step.default) ? [...step.default] : []
    } else if (step.type === 'select') {
      values[step.id] = step.default ?? (step.options?.[0] ?? '')
    } else {
      values[step.id] = step.default ?? ''
    }
  }
  return values
}

export default function ParamsForm({ template, onStart, onBack }) {
  const [values, setValues] = useState(() => initFormValues(template?.steps ?? []))
  const [selectedConfigId, setSelectedConfigId] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const llmCatalog = useStore((state) => state.llmCatalog)
  const llmCatalogLoaded = useStore((state) => state.llmCatalogLoaded)
  const globalSelectedModelId = useStore((state) => state.selectedModelId)
  const setSelectedModelId = useStore((state) => state.setSelectedModelId)
  const refreshLlmCatalog = useStore((state) => state.refreshLlmCatalog)

  useEffect(() => {
    setValues(initFormValues(template?.steps ?? []))
  }, [template])

  useEffect(() => {
    if (llmCatalogLoaded) return

    let cancelled = false
    setCatalogLoading(true)
    setCatalogError('')
    refreshLlmCatalog()
      .catch((error) => {
        if (!cancelled) {
          setCatalogError(error instanceof Error ? error.message : 'LLM 配置加载失败')
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [llmCatalogLoaded, refreshLlmCatalog])

  useEffect(() => {
    const currentId = Number(selectedConfigId)
    if (llmCatalog.some((config) => config.id === currentId)) return

    const preferredId = llmCatalog.some((config) => config.id === globalSelectedModelId)
      ? globalSelectedModelId
      : llmCatalog.find((config) => config.is_default)?.id ?? llmCatalog[0]?.id

    setSelectedConfigId(preferredId == null ? '' : String(preferredId))
  }, [globalSelectedModelId, llmCatalog, selectedConfigId])

  const paramsValid = useMemo(() => {
    if (!template?.steps) return false
    return template.steps
      .filter((s) => s.required)
      .every((s) => {
        const v = values[s.id]
        if (Array.isArray(v)) return v.length > 0
        return typeof v === 'string' && v.trim().length > 0
      })
  }, [template, values])

  const selectedConfig = useMemo(
    () => llmCatalog.find((config) => config.id === Number(selectedConfigId)) || null,
    [llmCatalog, selectedConfigId],
  )
  const isValid = paramsValid && Boolean(selectedConfig) && !catalogLoading

  function handleTextChange(stepId, val) {
    setValues((prev) => ({ ...prev, [stepId]: val }))
  }
  function handleSelectChip(stepId, option) {
    setValues((prev) => ({ ...prev, [stepId]: option }))
  }
  function handleMultiselectToggle(stepId, option) {
    setValues((prev) => {
      const current = Array.isArray(prev[stepId]) ? prev[stepId] : []
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option]
      return { ...prev, [stepId]: next }
    })
  }
  function handleSubmit() {
    if (!isValid) return
    setSelectedModelId(selectedConfig.id)
    onStart?.(values, selectedConfig.id)
  }
  function handleRetryCatalog() {
    setCatalogLoading(true)
    setCatalogError('')
    refreshLlmCatalog()
      .catch((error) => {
        setCatalogError(error instanceof Error ? error.message : 'LLM 配置加载失败')
      })
      .finally(() => setCatalogLoading(false))
  }

  if (!template) return null

  return (
    <div className="wf-params-container">
      {/* Header */}
      <div className="wf-fade-up" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
        <button className="wf-back-btn" onClick={onBack} aria-label="返回模板选择">
          &#8592;
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 32 }}>{template.icon}</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {template.name}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
              {template.description}
            </div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {template.steps.map((step, idx) => (
          <div key={step.id} className="wf-fade-up" style={{ animationDelay: `${idx * 60}ms` }}>
            <label htmlFor={`step-${step.id}`} className="wf-step-label">
              <span className="wf-step-num">{idx + 1}</span>
              {step.label}
              {step.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
            </label>

            {step.type === 'text' && (
              <input
                id={`step-${step.id}`}
                type="text"
                className="wf-text-input"
                value={values[step.id]}
                placeholder={step.placeholder}
                onChange={(e) => handleTextChange(step.id, e.target.value)}
              />
            )}

            {step.type === 'select' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {step.options.map((option) => (
                  <button
                    key={option}
                    className={`wf-chip ${values[step.id] === option ? 'wf-chip--selected' : ''}`}
                    onClick={() => handleSelectChip(step.id, option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {step.type === 'multiselect' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {step.options.map((option) => {
                  const isChecked = (values[step.id] || []).includes(option)
                  return (
                    <label
                      key={option}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleMultiselectToggle(step.id, option)}
                        style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{option}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        <div className="wf-fade-up" style={{ animationDelay: `${template.steps.length * 60}ms` }}>
          <label htmlFor="workflow-llm-config" className="wf-step-label">
            <span className="wf-step-num">{template.steps.length + 1}</span>
            LLM 配置
            <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>
          </label>

          <div className={`wf-model-config ${catalogError ? 'wf-model-config--error' : ''}`}>
            <select
              id="workflow-llm-config"
              className="wf-model-select"
              value={selectedConfigId}
              onChange={(event) => setSelectedConfigId(event.target.value)}
              disabled={catalogLoading || llmCatalog.length === 0}
              aria-describedby="workflow-llm-help"
              required
            >
              <option value="">
                {catalogLoading ? '正在加载 LLM 配置…' : '请选择 LLM 配置'}
              </option>
              {llmCatalog.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.label || config.display_name || config.model_name || config.provider}
                  {config.is_local ? ' · 本地' : ''}
                  {config.is_default ? ' · 默认' : ''}
                </option>
              ))}
            </select>

            {selectedConfig && !catalogError && (
              <div className="wf-model-meta" id="workflow-llm-help">
                <span
                  className={`wf-model-health wf-model-health--${selectedConfig.health_status || 'unknown'}`}
                  aria-hidden="true"
                />
                <span>{selectedConfig.provider_label || selectedConfig.provider}</span>
                <span>·</span>
                <span>{selectedConfig.model_name || selectedConfig.label}</span>
                {selectedConfig.is_local && <span className="wf-model-badge">本地</span>}
              </div>
            )}

            {!catalogLoading && llmCatalog.length === 0 && !catalogError && (
              <p className="wf-model-message" id="workflow-llm-help">
                暂无可用 LLM 配置，请先到“设置 → LLM 配置”添加并启用模型。
              </p>
            )}

            {catalogError && (
              <div className="wf-model-message wf-model-message--error" id="workflow-llm-help" role="alert">
                <span>LLM 配置加载失败：{catalogError}</span>
                <button type="button" className="wf-model-retry" onClick={handleRetryCatalog}>
                  重试
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        className="wf-start-btn"
        onClick={handleSubmit}
        disabled={!isValid}
      >
        <span>&#9654;</span>
        <span>开始工作流</span>
      </button>
    </div>
  )
}
