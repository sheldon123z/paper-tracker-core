import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, useToast } from '../../ui'
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
  const [contextMenu, setContextMenu] = useState(null)
  const fileInputRef = useRef(null)
  const contextMenuRef = useRef(null)
  const { addToast } = useToast()
  const setPdfSelection = useStore((s) => s.setPdfSelection)
  const setPdfActiveFileId = useStore((s) => s.setPdfActiveFileId)

  useEffect(() => {
    if (initialFileId) setActiveFileId(initialFileId)
  }, [initialFileId])

  useEffect(() => {
    if (!contextMenu) return undefined

    const closeMenu = (event) => {
      if (!contextMenuRef.current?.contains(event.target)) setContextMenu(null)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

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

  const baseUrl = api.defaults.baseURL || ''

  const openContextMenu = useCallback((event, file) => {
    event.preventDefault()
    setActiveFileId(file.id)
    const menuWidth = 168
    const menuHeight = 88
    setContextMenu({
      file,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    })
  }, [])

  const openKeyboardContextMenu = useCallback((event, file) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    const rect = event.currentTarget.getBoundingClientRect()
    openContextMenu({
      preventDefault: () => event.preventDefault(),
      clientX: rect.left + Math.min(rect.width, 24),
      clientY: rect.bottom,
    }, file)
  }, [openContextMenu])

  const handleDownload = useCallback(async (file) => {
    setContextMenu(null)
    try {
      const response = await api.get(
        `/api/papers/${paperId}/files/${file.id}/download`,
        { responseType: 'blob' },
      )
      const objectUrl = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = file.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('Download failed', err)
      addToast({ type: 'error', message: 'PDF 下载失败' })
    }
  }, [addToast, paperId])

  const handleDelete = useCallback(async (file) => {
    setContextMenu(null)
    if (!window.confirm(`确定删除“${file.filename}”吗？此操作无法撤销。`)) return
    try {
      await api.delete(`/api/papers/${paperId}/files/${file.id}`)
      onFilesChange((current) => current.filter((item) => item.id !== file.id))
      if (activeFileId === file.id) setActiveFileId(null)
      addToast({ type: 'success', message: 'PDF 已删除' })
    } catch (err) {
      console.error('Delete failed', err)
      addToast({ type: 'error', message: err.response?.data?.detail || 'PDF 删除失败' })
    }
  }, [activeFileId, addToast, onFilesChange, paperId])

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
              onContextMenu={f.file_type === 'pdf' ? (event) => openContextMenu(event, f) : undefined}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setActiveFileId(f.id)
                }
                if (f.file_type === 'pdf') openKeyboardContextMenu(event, f)
              }}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
              title={f.file_type === 'pdf' ? '右键可下载或删除' : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer"
              style={{
                backgroundColor: isActive ? 'var(--accent-light)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <span>{FILE_TYPE_LABELS[f.file_type] || f.file_type}</span>
              <span className="opacity-60 max-w-[120px] truncate">{f.filename}</span>
              <span className="opacity-40">{formatSize(f.file_size)}</span>
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

      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label={`${contextMenu.file.filename} 文件操作`}
          className="fixed z-50 min-w-[168px] rounded-lg border p-1 shadow-xl"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => handleDownload(contextMenu.file)}
          >
            下载
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 dark:hover:bg-red-950/30"
            onClick={() => handleDelete(contextMenu.file)}
          >
            删除
          </button>
        </div>
      )}
    </div>
  )
}
