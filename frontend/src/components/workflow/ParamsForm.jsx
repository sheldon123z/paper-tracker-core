/**
 * ParamsForm — 动态工作流参数配置表单
 */

import { useEffect, useMemo, useState } from 'react'

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

  useEffect(() => {
    setValues(initFormValues(template?.steps ?? []))
  }, [template])

  const isValid = useMemo(() => {
    if (!template?.steps) return false
    return template.steps
      .filter((s) => s.required)
      .every((s) => {
        const v = values[s.id]
        if (Array.isArray(v)) return v.length > 0
        return typeof v === 'string' && v.trim().length > 0
      })
  }, [template, values])

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
    onStart?.(values)
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
