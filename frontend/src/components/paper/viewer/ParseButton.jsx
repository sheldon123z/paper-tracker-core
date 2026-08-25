import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../ui'
import api from '../../../api'
import useStore from '../../../store'
import { RUNTIME_CAPABILITIES } from '../../../config/runtime'

const PARSE_ENGINES = [
  { id: 'mineru', label: 'MinerU' },
  { id: 'doc2x', label: 'Doc2X' },
]

export default function ParseButton({ paperId, fileId, parseStatus: initialStatus, fileType, onParseComplete }) {
  const cloudParsingAvailable = RUNTIME_CAPABILITIES.cloudDocumentParsing
  const statusPollingAvailable = fileType !== 'pdf' || cloudParsingAvailable
  const [status, setStatus] = useState(initialStatus || null)
  const [error, setError] = useState(null)
  const [polling, setPolling] = useState(
    () => statusPollingAvailable
      && (initialStatus === 'pending' || initialStatus === 'processing' || initialStatus === 'translating'),
  )
  const [engineMenuOpen, setEngineMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const menuRef = useRef(null)
  const btnRef = useRef(null)
  const selectedModelId = useStore((s) => s.selectedModelId)

  useEffect(() => {
    setStatus(initialStatus || null)
    setError(null)
    setPolling(
      statusPollingAvailable
        && (initialStatus === 'pending' || initialStatus === 'processing' || initialStatus === 'translating'),
    )
  }, [initialStatus, fileId, statusPollingAvailable])

  // Close engine menu on outside click
  useEffect(() => {
    if (!engineMenuOpen) return
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setEngineMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [engineMenuOpen])

  const triggerParse = useCallback(async (engine = 'mineru') => {
    try {
      const res = await api.post(`/api/papers/${paperId}/files/${fileId}/parse`, null, {
        params: { engine },
      })
      setStatus(res.data.parse_status)
      setError(null)
      setPolling(true)
      setEngineMenuOpen(false)
    } catch (err) {
      setError(err.response?.data?.detail || '解析请求失败')
    }
  }, [paperId, fileId])

  const triggerTranslate = useCallback(async () => {
    try {
      const res = await api.post(`/api/papers/${paperId}/files/${fileId}/translate`, null, {
        params: selectedModelId ? { config_id: selectedModelId } : {},
      })
      setStatus(res.data.parse_status)
      setError(null)
      setPolling(true)
    } catch (err) {
      setError(err.response?.data?.detail || '翻译请求失败')
    }
  }, [paperId, fileId, selectedModelId])

  // Poll status
  useEffect(() => {
    if (!polling || !statusPollingAvailable) return
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/api/papers/${paperId}/files/${fileId}/parse-status`)
        const s = res.data.parse_status
        setStatus(s)
        if (s === 'completed' || s === 'failed') {
          setPolling(false)
          if (s === 'completed') onParseComplete?.()
          if (s === 'failed') setError(res.data.parse_error || '操作失败')
        }
      } catch {
        // Ignore poll errors
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [polling, paperId, fileId, onParseComplete, statusPollingAvailable])

  // MinerU and Doc2X are cloud-backed. Keep the document viewer mounted in
  // offline builds, but do not expose or poll their parsing controls.
  if (fileType === 'pdf' && !cloudParsingAvailable) return null

  // Spinner for in-progress states
  if (status === 'pending' || status === 'processing') {
    return (
      <span
        className="text-xs px-2 py-1 rounded-md flex items-center gap-1"
        style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary, var(--bg-secondary))' }}
      >
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="15" />
        </svg>
        解析中...
      </span>
    )
  }

  if (status === 'translating') {
    return (
      <span
        className="text-xs px-2 py-1 rounded-md flex items-center gap-1"
        style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary, var(--bg-secondary))' }}
      >
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="15" />
        </svg>
        翻译中...
      </span>
    )
  }

  // PDF file: show parse button with engine dropdown
  if (fileType === 'pdf') {
    if (status === 'completed') {
      return (
        <span
          className="text-xs px-2 py-1 rounded-md"
          style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-light)' }}
        >
          已解析
        </span>
      )
    }
    return (
      <div className="flex items-center gap-1">
        <div ref={menuRef}>
          <span ref={btnRef} style={{ display: 'inline-flex' }}>
          <Button size="sm" variant="ghost" onClick={() => {
            if (!engineMenuOpen && btnRef.current) {
              const rect = btnRef.current.getBoundingClientRect()
              setMenuPos({ top: rect.bottom + 4, left: rect.left })
            }
            setEngineMenuOpen((v) => !v)
          }}>
            智能解析
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 2 }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Button>
          </span>
          {engineMenuOpen && (
            <div
              style={{
                position: 'fixed',
                top: menuPos.top,
                left: menuPos.left,
                zIndex: 9999,
                minWidth: 120,
                padding: 4,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              }}
            >
              {PARSE_ENGINES.map((eng) => (
                <button
                  key={eng.id}
                  onClick={() => triggerParse(eng.id)}
                  className="w-full text-left px-3 py-1.5 text-xs rounded transition-colors hover:bg-[var(--accent-light)]"
                  style={{ color: 'var(--text-primary)', display: 'block' }}
                >
                  {eng.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && (
          <span className="text-xs text-red-500 max-w-[120px] truncate" title={error}>
            {error}
          </span>
        )}
      </div>
    )
  }

  // Markdown file: show translate button
  if (fileType === 'markdown') {
    return (
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={triggerTranslate}>
          全文翻译
        </Button>
        {error && (
          <span className="text-xs text-red-500 max-w-[120px] truncate" title={error}>
            {error}
          </span>
        )}
      </div>
    )
  }

  return null
}
