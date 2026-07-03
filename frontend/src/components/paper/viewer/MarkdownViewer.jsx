import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'
import api from '../../../api'

export default function MarkdownViewer({ paperId, fileId }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api
      .get(`/api/papers/${paperId}/files/${fileId}/content`, { responseType: 'text' })
      .then((res) => {
        setContent(typeof res.data === 'string' ? res.data : String(res.data))
      })
      .catch((err) => {
        setError('Markdown 加载失败')
        console.error(err)
      })
      .finally(() => setLoading(false))
  }, [paperId, fileId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          加载中...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm text-red-500">{error}</span>
      </div>
    )
  }

  return (
    <div className="markdown-viewer prose prose-sm max-w-none px-6 py-4">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
    </div>
  )
}
