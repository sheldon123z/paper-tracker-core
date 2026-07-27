import { useEffect, useMemo, useRef, useState } from 'react'

import api from '../../api'
import { Badge, Button, Input, Modal, Select } from '../ui'

const MAX_FILE_SIZE = 100 * 1024 * 1024

const STATUS_LABELS = {
  queued: '等待识别',
  analyzing: '正在提取文本 / OCR / 模型识别',
  ready: '待复核',
  abandoned: '已放弃',
  failed: '识别失败',
  importing: '正在入库',
  success: '导入成功',
  import_failed: '入库失败',
}

const LANGUAGE_LABELS = {
  zh: '中文',
  en: '英文',
  mixed: '中英混排',
  unknown: '待判断',
}

const CONFIDENCE_LABELS = { high: '高', medium: '中', low: '低' }
const MATCH_LABELS = { file_hash: '相同 PDF', doi: 'DOI', arxiv_id: 'arXiv ID', title: '标准化标题' }

function requestScope(user, visibility, departmentId) {
  if (user?.role !== 'manager') return {}
  return {
    visibility,
    department_id: visibility === 'department' ? Number(departmentId) : undefined,
  }
}

function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg || String(item)).join('；')
  return error?.message || fallback
}

function Confidence({ value }) {
  if (!value) return null
  const variant = value === 'high' ? 'success' : value === 'medium' ? 'warning' : 'danger'
  return <Badge variant={variant}>置信度{CONFIDENCE_LABELS[value] || value}</Badge>
}

function FieldLabel({ children, confidence }) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span>{children}</span>
      <Confidence value={confidence} />
    </span>
  )
}

function MetadataEditor({ entry, onChange }) {
  const metadata = entry.metadata || {}
  const confidence = entry.analysis?.confidence || {}
  const setField = (field, value) => onChange({ ...metadata, [field]: value })

  return (
    <div className="mt-3 grid gap-3 border-t pt-3 surface-divider sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Input
          label={<FieldLabel confidence={confidence.title}>标题</FieldLabel>}
          value={metadata.title || ''}
          onChange={(event) => setField('title', event.target.value)}
          required
        />
        {!metadata.title?.trim() && <p className="mt-1 text-xs text-danger" role="alert">标题不能为空</p>}
      </div>
      <Input
        label={<FieldLabel confidence={confidence.authors}>作者</FieldLabel>}
        value={metadata.authors || ''}
        onChange={(event) => setField('authors', event.target.value)}
      />
      <Input
        label={<FieldLabel confidence={confidence.published_date}>发布日期</FieldLabel>}
        type="date"
        value={(metadata.published_date || '').slice(0, 10)}
        onChange={(event) => setField('published_date', event.target.value || null)}
      />
      <Input
        label={<FieldLabel confidence={confidence.doi}>DOI</FieldLabel>}
        value={metadata.doi || ''}
        onChange={(event) => setField('doi', event.target.value)}
      />
      <Input
        label={<FieldLabel confidence={confidence.arxiv_id}>arXiv ID</FieldLabel>}
        value={metadata.arxiv_id || ''}
        onChange={(event) => setField('arxiv_id', event.target.value)}
      />
      <Input
        label="分类"
        value={metadata.category || ''}
        onChange={(event) => setField('category', event.target.value)}
      />
      <div className="flex flex-col justify-end gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-secondary">识别语言</span>
        <div className="input-surface rounded-2xl border px-4 py-2.5 text-sm">
          {LANGUAGE_LABELS[entry.analysis?.language] || '待判断'}
        </div>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-secondary sm:col-span-2">
        <FieldLabel confidence={confidence.abstract}>原文摘要</FieldLabel>
        <textarea
          className="input-surface min-h-28 w-full rounded-2xl border px-4 py-3 text-sm font-normal normal-case tracking-normal text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          value={metadata.abstract || ''}
          onChange={(event) => setField('abstract', event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-secondary sm:col-span-2">
        AI 摘要（仅在原摘要缺失时生成）
        <textarea
          className="input-surface min-h-24 w-full rounded-2xl border px-4 py-3 text-sm font-normal normal-case tracking-normal text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          value={metadata.ai_summary || ''}
          onChange={(event) => setField('ai_summary', event.target.value)}
        />
      </label>
    </div>
  )
}

export default function PdfBatchImportModal({ isOpen, onClose, user, departments, onImported, addToast }) {
  const directoryInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [entries, setEntries] = useState([])
  const entriesRef = useRef([])
  const analyzeAbortRef = useRef(null)
  const abortRequestedRef = useRef(false)
  const [ignoredCount, setIgnoredCount] = useState(0)
  const [visibility, setVisibility] = useState('public')
  const [departmentId, setDepartmentId] = useState('')
  const [llmConfigs, setLlmConfigs] = useState([])
  const [llmConfigId, setLlmConfigId] = useState('')
  const [llmConfigsLoading, setLlmConfigsLoading] = useState(false)
  const [llmConfigsError, setLlmConfigsError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const busy = analyzing || importing
  const readyEntries = entries.filter((entry) => entry.include && ['ready', 'import_failed'].includes(entry.status))
  const abandonedCount = entries.filter((entry) => entry.status === 'abandoned').length
  const successCount = entries.filter((entry) => entry.status === 'success').length
  const failedCount = entries.filter((entry) => ['failed', 'import_failed'].includes(entry.status)).length
  const canUseScope = user?.role !== 'manager' || visibility === 'public' || departmentId
  const canImport = readyEntries.length > 0 && readyEntries.every((entry) => entry.metadata?.title?.trim()) && canUseScope
  const modelSelectionLocked = entries.some((entry) => (
    entry.analysis || ['analyzing', 'ready', 'abandoned', 'importing', 'success', 'import_failed'].includes(entry.status)
  ))

  useEffect(() => {
    if (!isOpen) return undefined

    let cancelled = false
    setLlmConfigsLoading(true)
    setLlmConfigsError('')
    api.get('/api/llm-configs/brief')
      .then((response) => {
        if (cancelled) return
        const configs = Array.isArray(response.data) ? response.data : []
        setLlmConfigs(configs)
        const preferred = configs.find((config) => config.is_default) || configs[0]
        setLlmConfigId(preferred ? String(preferred.id) : '')
      })
      .catch((error) => {
        if (cancelled) return
        setLlmConfigs([])
        setLlmConfigId('')
        setLlmConfigsError(errorMessage(error, 'LLM 配置加载失败，将使用自动选择或离线规则'))
      })
      .finally(() => {
        if (!cancelled) setLlmConfigsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  const progress = useMemo(() => {
    if (analyzing) return `${entries.filter((entry) => ['ready', 'failed'].includes(entry.status)).length}/${entries.length} 已识别`
    if (importing) return `${successCount + failedCount}/${entries.length} 已处理`
    return ''
  }, [analyzing, importing, entries, successCount, failedCount])

  const replaceEntries = (updater) => {
    const current = entriesRef.current
    const next = typeof updater === 'function' ? updater(current) : updater
    entriesRef.current = next
    setEntries(next)
  }

  const updateEntry = (id, updater) => {
    replaceEntries((current) => current.map((entry) => (
      entry.id === id ? { ...entry, ...(typeof updater === 'function' ? updater(entry) : updater) } : entry
    )))
  }

  const reset = () => {
    analyzeAbortRef.current?.abort()
    analyzeAbortRef.current = null
    abortRequestedRef.current = false
    replaceEntries([])
    setIgnoredCount(0)
    setVisibility('public')
    setDepartmentId('')
    setLlmConfigId('')
    setLlmConfigsError('')
    setAnnouncement('')
    if (directoryInputRef.current) directoryInputRef.current.value = ''
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    if (busy) return
    reset()
    onClose()
  }

  const handleFiles = (event) => {
    const selected = Array.from(event.target.files || [])
    const pdfFiles = selected.filter((file) => file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')
    setIgnoredCount(selected.length - pdfFiles.length)
    replaceEntries(pdfFiles.map((file, index) => ({
      id: `${file.webkitRelativePath || file.name}-${file.size}-${file.lastModified}-${index}`,
      file,
      relativePath: file.webkitRelativePath || file.name,
      status: file.size > MAX_FILE_SIZE ? 'failed' : 'queued',
      error: file.size > MAX_FILE_SIZE ? '文件超过 100 MB 上限' : null,
      include: file.size <= MAX_FILE_SIZE,
      expanded: false,
      analysis: null,
      metadata: null,
      result: null,
    })))
    setAnnouncement(`已选择 ${pdfFiles.length} 个 PDF，忽略 ${selected.length - pdfFiles.length} 个非 PDF 文件。`)
  }

  const openFilePicker = (input) => {
    if (!input) return
    input.value = ''
    input.click()
  }

  const analyzeEntry = async (entry, signal) => {
    updateEntry(entry.id, { status: 'analyzing', error: null })
    const form = new FormData()
    form.append('file', entry.file)
    const scope = requestScope(user, visibility, departmentId)
    if (scope.visibility) form.append('visibility', scope.visibility)
    if (scope.department_id) form.append('department_id', String(scope.department_id))
    if (llmConfigId) form.append('llm_config_id', llmConfigId)
    try {
      const response = await api.post('/api/papers/import/pdf/analyze', form, { timeout: 180000, signal })
      updateEntry(entry.id, {
        status: 'ready',
        analysis: response.data,
        metadata: response.data.metadata,
        include: true,
      })
      return 'ready'
    } catch (error) {
      if (signal?.aborted || error?.code === 'ERR_CANCELED') {
        updateEntry(entry.id, {
          status: 'queued',
          error: null,
          include: true,
        })
        return 'aborted'
      }
      updateEntry(entry.id, {
        status: 'failed',
        error: errorMessage(error, '论文识别失败'),
        include: false,
      })
      return 'failed'
    }
  }

  const analyzeAll = async () => {
    if (!canUseScope) return
    const controller = new AbortController()
    analyzeAbortRef.current = controller
    abortRequestedRef.current = false
    setAnalyzing(true)
    let completed = 0
    const queue = entriesRef.current.filter((item) => item.status === 'queued')
    for (const entry of queue) {
      if (abortRequestedRef.current) break
      const outcome = await analyzeEntry(entry, controller.signal)
      if (outcome === 'aborted' || abortRequestedRef.current) break
      completed += 1
      setAnnouncement(`已完成 ${completed}/${queue.length} 篇论文识别。`)
    }
    if (analyzeAbortRef.current === controller) analyzeAbortRef.current = null
    setAnalyzing(false)
    if (abortRequestedRef.current) {
      const abandoned = entriesRef.current.filter((entry) => entry.status === 'queued').length
      replaceEntries((current) => current.map((entry) => (
        entry.status === 'queued'
          ? { ...entry, status: 'abandoned', include: false, error: null }
          : entry
      )))
      const recognized = entriesRef.current.filter((entry) => entry.status === 'ready' && entry.include).length
      setAnnouncement(`已中止识别，可确认导入 ${recognized} 篇，已放弃 ${abandoned} 篇未完成论文。`)
      return
    }
    setAnnouncement('论文识别完成，请复核字段后导入。')
  }

  const retryAnalyze = async (entry) => {
    const controller = new AbortController()
    analyzeAbortRef.current = controller
    abortRequestedRef.current = false
    setAnalyzing(true)
    const outcome = await analyzeEntry(entry, controller.signal)
    if (analyzeAbortRef.current === controller) analyzeAbortRef.current = null
    setAnalyzing(false)
    if (outcome === 'aborted') setAnnouncement('已中止识别，该论文可稍后重试。')
  }

  const abortAnalysis = () => {
    abortRequestedRef.current = true
    setAnnouncement('正在中止识别…')
    analyzeAbortRef.current?.abort()
  }

  const commitEntry = async (entry) => {
    updateEntry(entry.id, { status: 'importing', error: null })
    try {
      const currentEntry = entriesRef.current.find((item) => item.id === entry.id) || entry
      if (!currentEntry.analysis?.content_hash || !currentEntry.metadata?.title?.trim()) {
        throw new Error('识别结果不完整，请重新识别后再导入')
      }
      const form = new FormData()
      form.append('file', currentEntry.file)
      form.append('metadata_json', JSON.stringify(currentEntry.metadata))
      form.append('expected_content_hash', currentEntry.analysis.content_hash)
      const scope = requestScope(user, visibility, departmentId)
      if (scope.visibility) form.append('visibility', scope.visibility)
      if (scope.department_id) form.append('department_id', String(scope.department_id))
      const response = await api.post('/api/papers/import/pdf/commit', form, { timeout: 120000 })
      updateEntry(entry.id, { status: 'success', result: response.data })
      return true
    } catch (error) {
      updateEntry(entry.id, {
        status: 'import_failed',
        error: errorMessage(error, 'PDF 入库失败'),
      })
      return false
    }
  }

  const importAll = async () => {
    setImporting(true)
    let successes = 0
    let failures = 0
    const queue = entriesRef.current.filter((entry) => (
      entry.include
      && ['ready', 'import_failed'].includes(entry.status)
      && entry.metadata?.title?.trim()
    ))
    for (const entry of queue) {
      if (await commitEntry(entry)) successes += 1
      else failures += 1
      setAnnouncement(`已导入 ${successes} 篇，失败 ${failures} 篇。`)
    }
    setImporting(false)
    if (successes > 0) await onImported()
    addToast?.({
      type: failures ? 'warning' : 'success',
      message: failures ? `已导入 ${successes} 篇，${failures} 篇失败，可在弹窗中重试` : `已成功导入 ${successes} 篇论文`,
    })
  }

  const retryCommit = async (entry) => {
    setImporting(true)
    const succeeded = await commitEntry(entry)
    setImporting(false)
    if (succeeded) await onImported()
  }

  const actions = (
    <>
      <Button variant="ghost" disabled={busy} onClick={handleClose}>{successCount > 0 ? '关闭' : '取消'}</Button>
      {analyzing && (
        <Button variant="secondary" onClick={abortAnalysis}>中止识别</Button>
      )}
      {!analyzing && entries.some((entry) => entry.status === 'queued') && (
        <Button loading={analyzing} disabled={busy || llmConfigsLoading || entries.length === 0 || !canUseScope} onClick={analyzeAll}>开始识别</Button>
      )}
      {!analyzing && !entries.some((entry) => entry.status === 'queued') && canImport && (
        <Button loading={importing} disabled={busy} onClick={importAll}>确认导入 {readyEntries.length} 篇</Button>
      )}
    </>
  )

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="批量导入 PDF" size="3xl" actions={actions}>
      <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
        <div className="rounded-2xl border p-4 surface-divider" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">选择目录或单独选择 PDF 文件</p>
              <p className="mt-1 text-xs text-secondary">可递归导入目录中的全部 PDF，也可按需多选若干文件；识别与 OCR 均在本机完成。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => openFilePicker(directoryInputRef.current)}>
                选择目录
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => openFilePicker(fileInputRef.current)}>
                选择 PDF 文件
              </Button>
            </div>
            <input
              ref={directoryInputRef}
              className="sr-only"
              type="file"
              accept=".pdf,application/pdf"
              multiple
              webkitdirectory=""
              directory=""
              onChange={handleFiles}
              aria-label="选择包含 PDF 论文的目录"
            />
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handleFiles}
              aria-label="选择一个或多个 PDF 论文文件"
            />
          </div>
          {entries.length > 0 && (
            <p className="mt-3 text-xs text-secondary">已选择 {entries.length} 个 PDF{ignoredCount ? `，忽略 ${ignoredCount} 个非 PDF 文件` : ''}</p>
          )}
        </div>

        <div className="rounded-2xl border p-4 surface-divider" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <Select
            label="本次识别模型"
            value={llmConfigId}
            onChange={setLlmConfigId}
            disabled={busy || llmConfigsLoading || modelSelectionLocked}
            options={[
              { value: '', label: llmConfigsLoading ? '正在加载可用模型…' : '自动选择可用模型' },
              ...llmConfigs.map((config) => ({
                value: String(config.id),
                label: `${config.label}${config.is_default ? '（默认）' : ''}${config.is_local ? ' · 本地' : ''}`,
              })),
            ]}
          />
          <p className={`mt-2 text-xs ${llmConfigsError ? 'text-danger' : 'text-secondary'}`} role={llmConfigsError ? 'alert' : undefined}>
            {llmConfigsError || (modelSelectionLocked
              ? '识别已开始，本批次将继续使用已选模型。'
              : '该选择只影响本次 PDF 元数据识别，不会修改系统默认模型。')}
          </p>
        </div>

        {user?.role === 'manager' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="入库范围"
              value={visibility}
              onChange={setVisibility}
              disabled={busy || entries.some((entry) => entry.analysis)}
              options={[{ value: 'public', label: '公共数据库' }, { value: 'department', label: '部门私有数据库' }]}
            />
            {visibility === 'department' && (
              <Select
                label="所属部门"
                value={departmentId}
                onChange={setDepartmentId}
                disabled={busy || entries.some((entry) => entry.analysis)}
                options={[{ value: '', label: '请选择部门' }, ...departments.filter((department) => department.status === 'active').map((department) => ({ value: String(department.id), label: department.name }))]}
              />
            )}
          </div>
        ) : (
          <p className="text-xs text-secondary">识别完成的论文将保存到你的部门私有数据库。</p>
        )}

        {progress && (
          <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-secondary)' }} aria-label={progress}>
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${entries.length ? ((successCount + failedCount + entries.filter((entry) => entry.status === 'ready').length) / entries.length) * 100 : 0}%` }}
            />
          </div>
        )}

        <div className="sr-only" aria-live="polite">{announcement}</div>

        {abandonedCount > 0 && (
          <div
            className="rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--warning)', backgroundColor: 'color-mix(in srgb, var(--warning) 10%, transparent)' }}
            role="status"
          >
            识别已中止：可确认导入 {readyEntries.length} 篇，已放弃 {abandonedCount} 篇未完成论文。
          </div>
        )}

        <div className="space-y-3">
          {entries.map((entry) => {
            const duplicate = entry.analysis?.duplicate
            return (
              <article key={entry.id} className="rounded-2xl border p-4 surface-divider">
                <div className="flex flex-wrap items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 cursor-pointer"
                    checked={entry.include}
                    disabled={!['ready', 'import_failed'].includes(entry.status) || busy}
                    onChange={(event) => updateEntry(entry.id, { include: event.target.checked })}
                    aria-label={`导入 ${entry.relativePath}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={entry.relativePath}>{entry.relativePath}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-secondary">
                      <Badge variant={entry.status === 'success' ? 'success' : entry.error ? 'danger' : 'neutral'}>{STATUS_LABELS[entry.status]}</Badge>
                      {entry.analysis && <Badge variant="neutral">{LANGUAGE_LABELS[entry.analysis.language]}</Badge>}
                      <span>{(entry.file.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  </div>
                  {['ready', 'import_failed', 'success'].includes(entry.status) && (
                    <Button variant="ghost" size="sm" onClick={() => updateEntry(entry.id, { expanded: !entry.expanded })}>
                      {entry.expanded ? '收起字段' : '复核字段'}
                    </Button>
                  )}
                  {entry.status === 'failed' && <Button variant="secondary" size="sm" disabled={busy} onClick={() => retryAnalyze(entry)}>重试识别</Button>}
                  {entry.status === 'import_failed' && <Button variant="secondary" size="sm" disabled={busy} onClick={() => retryCommit(entry)}>重试入库</Button>}
                </div>

                {entry.error && <p className="mt-2 text-xs text-danger" role="alert">{entry.error}</p>}
                {duplicate && (
                  <div className="mt-2 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--warning)', backgroundColor: 'color-mix(in srgb, var(--warning) 10%, transparent)' }}>
                    将通过{MATCH_LABELS[duplicate.match_by] || duplicate.match_by}补全已有论文“{duplicate.title}”并挂载 PDF。
                    {duplicate.conflicts?.length > 0 && ` 保留已有非空字段：${duplicate.conflicts.join('、')}。`}
                  </div>
                )}
                {entry.analysis?.warnings?.map((warning, index) => (
                  <p key={`${entry.id}-warning-${index}`} className="mt-2 text-xs text-secondary">{warning}</p>
                ))}
                {entry.status === 'success' && (
                  <>
                    <p className="mt-2 text-xs text-success">
                      {entry.result?.action === 'created' ? '已新建论文并保存 PDF。' : entry.result?.action === 'enriched' ? '已补全论文并保存 PDF。' : '论文和 PDF 已存在，无需重复保存。'}
                    </p>
                    {entry.result?.warnings?.map((warning, index) => (
                      <p key={`${entry.id}-commit-warning-${index}`} className="mt-1 text-xs text-secondary">{warning}</p>
                    ))}
                  </>
                )}
                {entry.expanded && entry.metadata && (
                  <MetadataEditor entry={entry} onChange={(metadata) => updateEntry(entry.id, { metadata })} />
                )}
              </article>
            )
          })}
          {entries.length === 0 && (
            <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-secondary surface-divider">
              请选择一个包含中文或英文 PDF 论文的目录
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
