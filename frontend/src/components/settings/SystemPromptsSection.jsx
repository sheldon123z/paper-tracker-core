// Usage (placed inside SettingsPage.jsx):
// import SystemPromptsSection from '../components/settings/SystemPromptsSection'
// <SystemPromptsSection />
//
// Fetches system prompts from GET /api/system-prompts and renders a compact card
// per prompt type. Clicking "编辑" opens a Modal (size="2xl") with a large focused
// textarea. Supports save (PATCH) and reset to default (POST …/reset).

import { useEffect, useState } from 'react'
import api from '../../api'
import { Badge, Button, Card, Modal, useToast } from '../ui'

const TYPE_LABELS = {
  paper:     '论文分析助手',
  global:    '全局研究助手',
  assistant: '对话助手',
}

const TYPE_DESCRIPTIONS = {
  paper:     '分析单篇论文时使用的系统提示词',
  global:    '全局聊天模式下使用的系统提示词',
  assistant: '通用对话助手的系统提示词',
}

// Small SVG icons per prompt type
const TYPE_ICONS = {
  paper: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15 }} aria-hidden="true">
      <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.963 8.963 0 00-4.25 1.065V16.82zM9.25 4.065A8.963 8.963 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
    </svg>
  ),
  global: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15 }} aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  ),
  assistant: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 15, height: 15 }} aria-hidden="true">
      <path d="M3.505 2.365A41.369 41.369 0 019 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 00-.577-.069 43.141 43.141 0 00-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 015 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914z" />
      <path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.147 2.839 2.71 2.935.214.013.428.024.642.034.2.009.385.09.518.224l2.35 2.35a.75.75 0 001.28-.531v-2.07c1.453-.195 2.5-1.463 2.5-2.915V8.998c0-1.526-1.157-2.85-2.729-2.936A41.645 41.645 0 0014 6z" />
    </svg>
  ),
}

// ── Compact card showing summary info for one prompt type ─────────────────────
function PromptCard({ promptType, label, description, text, serverText, onEdit }) {
  const isModified = text !== serverText
  const charCount = (text || '').length
  // One-line preview with newlines collapsed
  const preview = (text || '').replace(/\s*\n\s*/g, ' ').trim().slice(0, 110)
  const previewTruncated = (text || '').length > 110

  return (
    <div
      role="region"
      aria-label={label}
      style={{
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
        background: 'var(--bg-secondary)',
        padding: '0.875rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      {/* Top row: icon + label + modified badge + meta + edit button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        {/* Icon */}
        <span style={{ color: 'var(--accent)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {TYPE_ICONS[promptType]}
        </span>

        {/* Label */}
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {label}
        </span>

        {/* Modified badge */}
        {isModified && <Badge variant="warning">未保存</Badge>}

        {/* Spacer */}
        <span style={{ flex: 1 }} />

        {/* Char count */}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {charCount.toLocaleString()} 字符
        </span>

        {/* Edit button */}
        <Button size="sm" variant="secondary" onClick={() => onEdit(promptType)}>
          编辑
        </Button>
      </div>

      {/* Description */}
      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        {description}
      </p>

      {/* Prompt preview snippet */}
      {preview && (
        <p
          title={text}
          style={{
            margin: 0,
            padding: '0.4rem 0.625rem',
            fontSize: '0.72rem',
            lineHeight: '1.5',
            color: 'var(--text-secondary)',
            background: 'var(--bg-primary, rgba(0,0,0,0.03))',
            border: '1px solid var(--border)',
            borderRadius: '0.375rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {preview}{previewTruncated ? '…' : ''}
        </p>
      )}
    </div>
  )
}

// ── Edit modal with focused textarea ─────────────────────────────────────────
function EditModal({ isOpen, onClose, promptType, draftText, onChange, onSave, onReset, saving, resetting }) {
  const label = TYPE_LABELS[promptType] || promptType
  const description = TYPE_DESCRIPTIONS[promptType]
  const charCount = (draftText || '').length
  const isBusy = saving || resetting

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title={`编辑提示词 — ${label}`}
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            loading={resetting}
            disabled={saving}
            onClick={onReset}
          >
            重置为默认
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={resetting}
            onClick={onSave}
          >
            保存
          </Button>
        </>
      }
    >
      {/* Description */}
      {description && (
        <p style={{ margin: '0 0 0.875rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          {description}
        </p>
      )}

      {/* Textarea */}
      <textarea
        value={draftText || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={16}
        spellCheck={false}
        disabled={isBusy}
        aria-label={`${label} 提示词内容`}
        style={{
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          padding: '0.75rem',
          fontSize: '0.8125rem',
          lineHeight: '1.65',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          color: 'var(--text-primary)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '0.5rem',
          outline: 'none',
          transition: 'border-color 0.15s ease, opacity 0.15s ease',
          opacity: isBusy ? 0.6 : 1,
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--accent)' }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--border)' }}
      />

      {/* Character count below textarea */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.375rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {charCount.toLocaleString()} 字符
        </span>
      </div>
    </Modal>
  )
}

// ── Main section component ────────────────────────────────────────────────────
export default function SystemPromptsSection() {
  // prompts: array of { id, prompt_type, name, prompt_text, is_active }
  const [prompts, setPrompts] = useState([])
  // drafts: { [prompt_type]: string } — local edits, persisted across modal open/close
  const [drafts, setDrafts] = useState({})
  // originals: server-confirmed text, used for "modified" indicator
  const [originals, setOriginals] = useState({})
  const [saving, setSaving] = useState({})      // { [prompt_type]: bool }
  const [resetting, setResetting] = useState({}) // { [prompt_type]: bool }
  // which prompt type is currently open in the modal (null = closed)
  const [editingType, setEditingType] = useState(null)
  const { addToast } = useToast()

  const load = () =>
    api
      .get('/api/system-prompts')
      .then((r) => {
        setPrompts(r.data)
        const texts = {}
        r.data.forEach((p) => { texts[p.prompt_type] = p.prompt_text })
        // Merge: keep any in-progress local drafts, seed new types from server
        setDrafts((prev) => ({ ...texts, ...prev }))
        setOriginals(texts)
      })
      .catch(() => addToast({ type: 'error', message: '加载系统提示词失败' }))

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async (promptType) => {
    setSaving((s) => ({ ...s, [promptType]: true }))
    try {
      await api.patch(`/api/system-prompts/${promptType}`, {
        prompt_text: drafts[promptType],
      })
      addToast({ type: 'success', message: `「${TYPE_LABELS[promptType] || promptType}」已保存` })
      await load()
      setEditingType(null)
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '保存失败' })
    } finally {
      setSaving((s) => ({ ...s, [promptType]: false }))
    }
  }

  const handleReset = async (promptType) => {
    setResetting((r) => ({ ...r, [promptType]: true }))
    try {
      const res = await api.post(`/api/system-prompts/${promptType}/reset`)
      const resetText = res.data.prompt_text
      setDrafts((d) => ({ ...d, [promptType]: resetText }))
      setOriginals((o) => ({ ...o, [promptType]: resetText }))
      addToast({ type: 'info', message: `「${TYPE_LABELS[promptType] || promptType}」已重置为默认值` })
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '重置失败' })
    } finally {
      setResetting((r) => ({ ...r, [promptType]: false }))
    }
  }

  return (
    <Card title="系统提示词" className="mb-4">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {prompts.length === 0 && (
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            加载中...
          </p>
        )}

        {prompts.map((prompt) => {
          const type = prompt.prompt_type
          return (
            <PromptCard
              key={type}
              promptType={type}
              label={TYPE_LABELS[type] || prompt.name}
              description={TYPE_DESCRIPTIONS[type]}
              text={drafts[type] ?? prompt.prompt_text}
              serverText={originals[type] ?? prompt.prompt_text}
              onEdit={setEditingType}
            />
          )
        })}
      </div>

      {/* Single modal instance — driven by editingType */}
      <EditModal
        isOpen={editingType !== null}
        onClose={() => setEditingType(null)}
        promptType={editingType || ''}
        draftText={editingType !== null ? (drafts[editingType] ?? '') : ''}
        onChange={(val) => setDrafts((d) => ({ ...d, [editingType]: val }))}
        onSave={() => handleSave(editingType)}
        onReset={() => handleReset(editingType)}
        saving={!!(editingType && saving[editingType])}
        resetting={!!(editingType && resetting[editingType])}
      />
    </Card>
  )
}
