import { useEffect, useState } from 'react'
import api from '../../api'
import { Badge, Button, Card, Input, Modal, useToast } from '../ui'

// Available template variables hint
const VARIABLE_HINT = '{title}, {abstract}, {authors}, {notes}'

const defaultForm = { name: '', prompt_text: '', icon: '' }

// ─── Template Card ────────────────────────────────────────────────────────────
function TemplateCard({ template, onEdit, onDelete }) {
  const { name, icon, prompt_text, is_builtin } = template
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-4 transition-shadow hover:shadow-md"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 min-w-0">
        {icon && (
          <span className="text-lg leading-none shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        <span
          className="text-sm font-semibold truncate flex-1"
          style={{ color: 'var(--text-primary)' }}
          title={name}
        >
          {name}
        </span>
        {is_builtin && (
          <Badge variant="neutral" className="shrink-0">
            内置
          </Badge>
        )}
      </div>

      {/* Prompt preview */}
      <p
        className="text-xs leading-relaxed line-clamp-2"
        style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}
        title={prompt_text}
      >
        {prompt_text}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={() => onEdit(template)}>
          编辑
        </Button>
        {!is_builtin && (
          <Button size="sm" variant="danger" onClick={() => onDelete(template)}>
            删除
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Edit / Create Modal ──────────────────────────────────────────────────────
function TemplateFormModal({ isOpen, onClose, editingTemplate, onSaved }) {
  const [form, setForm] = useState(defaultForm)
  const [submitting, setSubmitting] = useState(false)
  const { addToast } = useToast()

  // Sync form when the modal opens
  useEffect(() => {
    if (isOpen) {
      setForm(
        editingTemplate
          ? { name: editingTemplate.name, prompt_text: editingTemplate.prompt_text, icon: editingTemplate.icon || '' }
          : defaultForm
      )
    }
  }, [isOpen, editingTemplate])

  const isEditing = !!editingTemplate

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (isEditing) {
        await api.patch(`/api/prompt-templates/${editingTemplate.id}`, form)
        addToast({ type: 'success', message: '模板已更新' })
      } else {
        await api.post('/api/prompt-templates', form)
        addToast({ type: 'success', message: '模板已创建' })
      }
      onSaved()
      onClose()
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '操作失败' })
    } finally {
      setSubmitting(false)
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `编辑模板 — ${editingTemplate.name}` : '新增 Prompt 模板'}
      size="lg"
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="submit" form="template-form" loading={submitting}>
            {isEditing ? '保存更新' : '创建模板'}
          </Button>
        </>
      }
    >
      {/* Variable hint */}
      <p
        className="text-xs mb-4 px-3 py-2 rounded-lg"
        style={{
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
        }}
      >
        <span className="font-medium" style={{ color: 'var(--accent)' }}>可用变量：</span>
        {VARIABLE_HINT}
      </p>

      <form id="template-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Name + Icon row */}
        <div className="grid grid-cols-4 gap-3">
          <Input
            label="模板名称"
            value={form.name}
            onChange={set('name')}
            placeholder="例如：快速摘要"
            required
            className="col-span-3"
          />
          <div className="flex flex-col gap-1">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--text-secondary)' }}
            >
              图标（可选）
            </label>
            <input
              type="text"
              value={form.icon}
              onChange={set('icon')}
              placeholder=""
              maxLength={4}
              className="w-full rounded-md border px-3 py-2 text-sm text-center outline-none"
              style={{
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {/* Prompt text */}
        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Prompt 内容
          </label>
          <textarea
            value={form.prompt_text}
            onChange={set('prompt_text')}
            placeholder={'请总结以下论文的主要内容：{title}\n\n摘要：{abstract}'}
            required
            rows={8}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none resize-y"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              lineHeight: '1.6',
            }}
          />
        </div>
      </form>
    </Modal>
  )
}

// ─── Delete Confirmation Modal ────────────────────────────────────────────────
function DeleteConfirmModal({ target, onClose, onConfirm }) {
  return (
    <Modal
      isOpen={!!target}
      onClose={onClose}
      title="确认删除"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            确认删除
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--text-primary)' }}>
        确定删除模板「<strong>{target?.name}</strong>」？此操作不可撤销。
      </p>
    </Modal>
  )
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export default function TemplatesSection() {
  const [templates, setTemplates] = useState([])
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const { addToast } = useToast()

  const load = () =>
    api.get('/api/prompt-templates').then((r) => setTemplates(r.data)).catch(() => {})

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditingTemplate(null)
    setFormModalOpen(true)
  }

  const openEdit = (template) => {
    setEditingTemplate(template)
    setFormModalOpen(true)
  }

  const closeFormModal = () => {
    setFormModalOpen(false)
    setEditingTemplate(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/api/prompt-templates/${deleteTarget.id}`)
      load()
      addToast({ type: 'success', message: '已删除' })
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || '删除失败' })
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <>
      <Card
        title="Prompt 模板"
        actions={
          <Button size="sm" onClick={openCreate}>
            + 新增模板
          </Button>
        }
        className="mb-4"
      >
        {templates.length === 0 ? (
          <p
            className="text-sm text-center py-8"
            style={{ color: 'var(--text-secondary)' }}
          >
            暂无模板，点击右上角「新增模板」创建第一个。
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Create / Edit Modal */}
      <TemplateFormModal
        isOpen={formModalOpen}
        onClose={closeFormModal}
        editingTemplate={editingTemplate}
        onSaved={load}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  )
}
