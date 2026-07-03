import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../ui'
import PdfViewer from './PdfViewer'
import MarkdownViewer from './MarkdownViewer'
import DocxViewer from './DocxViewer'
import XlsxViewer from './XlsxViewer'
import ParseButton from './ParseButton'
import api from '../../../api'
import useStore from '../../../store'

const FILE_TYPE_LABELS = {
  pdf: 'PDF',
  markdown: 'Markdown',
  text: '文本',
  docx: 'Word',
  xlsx: 'Excel',
  pptx: 'PPT',
}

const FILE_ACCEPT = '.pdf,.md,.txt,.markdown,.text,.docx,.doc,.xlsx,.xls,.pptx,.ppt'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function OfficeUnsupported({ filename }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-secondary)' }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{filename}</p>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        暂不支持在线预览此格式，请下载后使用本地应用打开
      </p>
    </div>
  )
}

export default function InlineFileViewer({ paperId, files, onFilesChange, onClose, initialFileId }) {
  const [activeFileId, setActiveFileId] = useState(initialFileId || null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const setPdfSelection = useStore((s) => s.setPdfSelection)
  const setPdfActiveFileId = useStore((s) => s.setPdfActiveFileId)

  useEffect(() => {
    if (initialFileId) setActiveFileId(initialFileId)
  }, [initialFileId])

  const activeFile = files.find((f) => f.id === activeFileId) ||
    files.find((f) => f.file_type === 'pdf') ||
    files[0] ||
    null

  // Sync active file ID to store for CopilotKit context
  useEffect(() => {
    setPdfActiveFileId(activeFile?.id || null)
  }, [activeFile?.id, setPdfActiveFileId])

  const handleUpload = useCallback(
    async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await api.post(`/api/papers/${paperId}/files`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        onFilesChange((prev) => [res.data, ...prev])
        setActiveFileId(res.data.id)
      } catch (err) {
        console.error('Upload failed', err)
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [paperId, onFilesChange],
  )

  const handleDelete = useCallback(
    async (fileId) => {
      try {
        await api.delete(`/api/papers/${paperId}/files/${fileId}`)
        onFilesChange((prev) => prev.filter((f) => f.id !== fileId))
        if (activeFileId === fileId) setActiveFileId(null)
      } catch (err) {
        console.error('Delete failed', err)
      }
    },
    [paperId, activeFileId, onFilesChange],
  )

  const baseUrl = api.defaults.baseURL || ''

  const renderViewer = () => {
    if (!activeFile) {
      if (files.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              暂无文件，点击上方按钮上传文档
            </p>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              上传文件
            </Button>
          </div>
        )
      }
      return null
    }
    switch (activeFile.file_type) {
      case 'pdf':
        return (
          <PdfViewer
            fileUrl={`${baseUrl}/api/papers/${paperId}/files/${activeFile.id}/content`}
            onSelectionChange={(text, page) => setPdfSelection(text, page)}
          />
        )
      case 'docx':
        return <DocxViewer paperId={paperId} fileId={activeFile.id} />
      case 'xlsx':
        return <XlsxViewer paperId={paperId} fileId={activeFile.id} />
      case 'pptx':
        return <OfficeUnsupported filename={activeFile.filename} />
      default:
        return <MarkdownViewer paperId={paperId} fileId={activeFile.id} />
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* File tabs + upload + close */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0 overflow-x-auto"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
      >
        {files.map((f) => {
          const isActive = activeFile?.id === f.id
          return (
            <div
              key={f.id}
              onClick={() => setActiveFileId(f.id)}
              role="tab"
              tabIndex={0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer"
              style={{
                backgroundColor: isActive ? 'var(--accent-light)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <span>{FILE_TYPE_LABELS[f.file_type] || f.file_type}</span>
              <span className="opacity-60 max-w-[120px] truncate">{f.filename}</span>
              <span className="opacity-40">{formatSize(f.file_size)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(f.id) }}
                className="ml-1 opacity-40 hover:opacity-100 hover:text-red-500"
                title="删除文件"
              >
                x
              </button>
            </div>
          )
        })}

        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          onChange={handleUpload}
          className="hidden"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '上传中...' : '+ 上传'}
        </Button>

        {(activeFile?.file_type === 'pdf' || activeFile?.file_type === 'markdown') && (
          <ParseButton
            paperId={paperId}
            fileId={activeFile.id}
            fileType={activeFile.file_type}
            parseStatus={activeFile.parse_status}
            onParseComplete={() => {
              api.get(`/api/papers/${paperId}/files`).then((res) => onFilesChange(res.data)).catch(() => {})
            }}
          />
        )}

        <button
          onClick={onClose}
          className="ml-auto flex-shrink-0 rounded-md p-1 transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-secondary)' }}
          title="关闭文档查看器"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Viewer area */}
      <div className="flex-1 overflow-y-auto">
        {renderViewer()}
      </div>
    </div>
  )
}
