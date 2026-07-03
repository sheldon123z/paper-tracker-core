import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import api from '../../../api'

export default function XlsxViewer({ paperId, fileId }) {
  const [sheets, setSheets] = useState([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    const baseUrl = api.defaults.baseURL || ''
    fetch(`${baseUrl}/api/papers/${paperId}/files/${fileId}/content`)
      .then((res) => {
        if (!res.ok) throw new Error('加载失败')
        return res.arrayBuffer()
      })
      .then((buffer) => {
        const workbook = XLSX.read(buffer, { type: 'array' })
        const parsed = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name]
          const data = XLSX.utils.sheet_to_json(sheet, { header: 1 })
          return { name, data }
        })
        setSheets(parsed)
        setActiveSheet(0)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Excel parse failed', err)
        setError(err.message || '解析失败')
        setLoading(false)
      })
  }, [paperId, fileId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Excel 文件加载中...</span>
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

  const currentSheet = sheets[activeSheet]

  return (
    <div className="flex flex-col h-full">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div
          className="flex items-center gap-1 px-3 py-1.5 border-b overflow-x-auto flex-shrink-0"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
        >
          {sheets.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSheet(i)}
              className="px-3 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors"
              style={{
                backgroundColor: i === activeSheet ? 'var(--accent-light)' : 'transparent',
                color: i === activeSheet ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {currentSheet && currentSheet.data.length > 0 ? (
          <table
            className="w-full border-collapse text-sm"
            style={{ minWidth: 'max-content' }}
          >
            <thead>
              <tr>
                <th
                  className="px-2 py-1.5 border text-center font-medium sticky top-0"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    width: 40,
                  }}
                >
                  #
                </th>
                {(currentSheet.data[0] || []).map((_, ci) => (
                  <th
                    key={ci}
                    className="px-3 py-1.5 border text-left font-medium sticky top-0"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {String.fromCharCode(65 + (ci % 26))}
                    {ci >= 26 ? String.fromCharCode(65 + Math.floor(ci / 26) - 1) : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentSheet.data.map((row, ri) => (
                <tr key={ri}>
                  <td
                    className="px-2 py-1 border text-center"
                    style={{
                      borderColor: 'var(--border)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      fontSize: 11,
                    }}
                  >
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-1 border"
                      style={{
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cell != null ? String(cell) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center py-12">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              工作表为空
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
