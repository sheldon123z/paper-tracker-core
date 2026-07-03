import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import api from '../../../api'

export default function DocxViewer({ paperId, fileId }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!containerRef.current) return
    setLoading(true)
    setError(null)

    const baseUrl = api.defaults.baseURL || ''
    fetch(`${baseUrl}/api/papers/${paperId}/files/${fileId}/content`)
      .then((res) => {
        if (!res.ok) throw new Error('加载失败')
        return res.arrayBuffer()
      })
      .then((buffer) => {
        return renderAsync(buffer, containerRef.current, null, {
          className: 'docx-viewer-body',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: false,
        })
      })
      .then(() => setLoading(false))
      .catch((err) => {
        console.error('Docx render failed', err)
        setError(err.message || '渲染失败')
        setLoading(false)
      })
  }, [paperId, fileId])

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-tertiary, #f0f0f0)' }}>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Word 文档加载中...</span>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center py-12">
          <span className="text-sm text-red-500">{error}</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto docx-viewer-container"
        style={{ display: loading ? 'none' : undefined }}
      />
    </div>
  )
}
