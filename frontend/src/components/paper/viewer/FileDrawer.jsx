import { useCallback, useRef, useState } from 'react'
import { Drawer, Button } from '../../ui'
import PdfViewer from './PdfViewer'
import MarkdownViewer from './MarkdownViewer'
import api from '../../../api'

const FILE_TYPE_LABELS = {
  pdf: 'PDF',
  markdown: 'Markdown',
  text: '文本',
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileDrawer({ isOpen, onClose, paperId, files, onFilesChange }) {
  const [activeFileId, setActiveFileId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Determine which file to show
  const activeFile = files.find((f) => f.id === activeFileId) ||
    files.find((f) => f.file_type === 'pdf') ||
    files[0] ||
    null

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
        alert(err.response?.data?.detail || '上传失败')
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [paperId, onFilesChange],
  )

  const handleDelete = useCallback(
    async (fileId) => {
      if (!confirm('确定删除此文件?')) return
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

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="文档预览" width="60vw">
      <div className="flex flex-col h-full">
        {/* File tabs + upload */}
        <div
          className="flex items-center gap-2 px-4 py-2 border-b flex-shrink-0 overflow-x-auto"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          {files.map((f) => (
            <div
              key={f.id}
              onClick={() => setActiveFileId(f.id)}
              role="tab"
              tabIndex={0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer"
              style={{
                backgroundColor:
                  (activeFile?.id === f.id) ? 'var(--accent-light)' : 'transparent',
                color:
                  (activeFile?.id === f.id) ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <span>{FILE_TYPE_LABELS[f.file_type] || f.file_type}</span>
              <span className="opacity-60 max-w-[120px] truncate">{f.filename}</span>
              <span className="opacity-40">{formatSize(f.file_size)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(f.id)
                }}
                className="ml-1 opacity-40 hover:opacity-100 hover:text-red-500"
                title="删除文件"
              >
                x
              </button>
            </div>
          ))}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.txt,.markdown,.text"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? '上传中...' : '+ 上传文件'}
          </Button>
        </div>

        {/* Viewer area */}
        <div className="flex-1 overflow-y-auto">
          {!activeFile && files.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                暂无文件，点击上方按钮上传 PDF 或 Markdown
              </p>
              <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                上传文件
              </Button>
            </div>
          )}
          {activeFile?.file_type === 'pdf' && (
            <PdfViewer
              fileUrl={`${baseUrl}/api/papers/${paperId}/files/${activeFile.id}/content`}
            />
          )}
          {activeFile && activeFile.file_type !== 'pdf' && (
            <MarkdownViewer paperId={paperId} fileId={activeFile.id} />
          )}
        </div>
      </div>
    </Drawer>
  )
}
