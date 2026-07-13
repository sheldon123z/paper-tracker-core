import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { renderToStaticMarkup } from 'react-dom/server'
import { getWorkflowTemplate } from './templates'
import AppIcon from '../ui/AppIcon'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function stringify(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => stringify(item)).join('\n')
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function pickPrimaryReport(agentState) {
  return (
    agentState?.final_report ||
    agentState?.comparison_report ||
    agentState?.gap_report ||
    agentState?.submission_plan ||
    agentState?.trend_data ||
    agentState?.literature_draft ||
    ''
  )
}

function getExportBaseName(template, topic) {
  const baseName = template?.id || 'workflow'
  const safeTopic = topic ? topic.slice(0, 20).replace(/[\\/:*?"<>|]/g, '_') : 'report'
  return `${baseName}_${safeTopic}`
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function reportToHtml(markdown) {
  return renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>,
  )
}

export default function CompletionPanel({ agentState, templateId, onNewWorkflow }) {
  const template = getWorkflowTemplate(templateId || agentState?.template_id)
  const topic = agentState?.research_topic ?? ''
  const searchResults = asArray(agentState?.search_results)
  const selectedPapers = asArray(agentState?.selected_papers)
  const paperAnalyses = asArray(agentState?.paper_analyses)
  const recommendations = asArray(agentState?.recommendations)
  const primaryReport = useMemo(() => stringify(pickPrimaryReport(agentState)), [agentState])
  const [copied, setCopied] = useState(false)
  const [renderMode, setRenderMode] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef(null)

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportMenuOpen) return
    function handleClick(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportMenuOpen])

  function handleCopy() {
    if (!primaryReport) return
    navigator.clipboard.writeText(primaryReport).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleExportMarkdown() {
    if (!primaryReport) return
    const filename = getExportBaseName(template, topic) + '.md'
    downloadBlob(new Blob([primaryReport], { type: 'text/markdown;charset=utf-8' }), filename)
    setExportMenuOpen(false)
  }

  function handleExportWord() {
    if (!primaryReport) return
    const html = reportToHtml(primaryReport)
    const fullHtml = [
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"',
      '      xmlns:w="urn:schemas-microsoft-com:office:word"',
      '      xmlns="http://www.w3.org/TR/REC-html40">',
      '<head><meta charset="utf-8">',
      '<style>',
      'body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; line-height: 1.8; color: #1a1a1a; }',
      'h1 { font-size: 22pt; font-weight: bold; margin-top: 18pt; }',
      'h2 { font-size: 16pt; font-weight: bold; margin-top: 14pt; }',
      'h3 { font-size: 13pt; font-weight: bold; margin-top: 12pt; }',
      'p { font-size: 11pt; margin: 6pt 0; }',
      'li { font-size: 11pt; margin: 3pt 0; }',
      'code { font-family: Consolas, monospace; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; }',
      'pre { background: #f5f5f5; padding: 10px; border-radius: 6px; font-size: 10pt; }',
      'table { border-collapse: collapse; width: 100%; }',
      'th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }',
      'th { background: #f0f0f0; font-weight: bold; }',
      'blockquote { border-left: 3px solid #4f46e5; padding-left: 12px; color: #555; }',
      '</style>',
      '</head><body>',
      html,
      '</body></html>',
    ].join('\n')
    const filename = getExportBaseName(template, topic) + '.doc'
    downloadBlob(new Blob(['\ufeff' + fullHtml], { type: 'application/msword' }), filename)
    setExportMenuOpen(false)
  }

  function handleExportPdf() {
    if (!primaryReport) return
    const html = reportToHtml(primaryReport)
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write([
      '<!DOCTYPE html><html><head><meta charset="utf-8">',
      `<title>${getExportBaseName(template, topic)}</title>`,
      '<style>',
      'body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; line-height: 1.8; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px; }',
      'h1 { font-size: 24px; font-weight: bold; margin-top: 24px; }',
      'h2 { font-size: 20px; font-weight: bold; margin-top: 20px; }',
      'h3 { font-size: 16px; font-weight: bold; margin-top: 16px; }',
      'p { margin: 8px 0; }',
      'code { font-family: Consolas, monospace; background: #f5f5f5; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }',
      'pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }',
      'table { border-collapse: collapse; width: 100%; margin: 12px 0; }',
      'th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }',
      'th { background: #f0f0f0; font-weight: bold; }',
      'blockquote { border-left: 3px solid #4f46e5; padding-left: 12px; color: #555; margin: 12px 0; }',
      '@media print { body { padding: 0; } }',
      '</style>',
      '</head><body>',
      html,
      '</body></html>',
    ].join('\n'))
    printWindow.document.close()
    setTimeout(() => printWindow.print(), 300)
    setExportMenuOpen(false)
  }

  return (
    <div style={{ padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Success banner */}
      <div className="wf-completion-banner wf-fade-up">
        <div className="wf-completion-check">
          <span style={{ filter: 'brightness(0) invert(1)' }}>&#10003;</span>
        </div>
        <h2 style={{ fontSize: 21, fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
          {template?.name || '工作流'}已完成
        </h2>
        {topic && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            研究主题：{topic}
          </p>
        )}
        <div style={{ display: 'flex', gap: 28, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {searchResults.length > 0 && <StatBadge value={searchResults.length} label="检索结果" color="#3b82f6" />}
          {selectedPapers.length > 0 && <StatBadge value={selectedPapers.length} label="已选论文" color="#0ea5e9" />}
          {paperAnalyses.length > 0 && <StatBadge value={paperAnalyses.length} label="分析条目" color="#8b5cf6" />}
          {recommendations.length > 0 && <StatBadge value={recommendations.length} label="行动建议" color="#14b8a6" />}
          {primaryReport && <StatBadge value="1" label={template?.resultLabel || '最终报告'} color="#10b981" />}
        </div>
      </div>

      {/* Primary report */}
      {primaryReport ? (
        <div className="wf-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="wf-section-header">
            <div className="wf-section-icon" style={{ background: 'rgba(16,185,129,0.1)' }}><AppIcon name="file" size={14} /></div>
            <h3 className="wf-section-title">{template?.resultLabel || '最终报告'}</h3>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {/* Copy */}
            <button
              className={`wf-action-btn ${copied ? 'wf-action-btn--active' : ''}`}
              onClick={handleCopy}
            >
              <span>{copied ? <AppIcon name="check" size={14} /> : <AppIcon name="copy" size={14} />}</span>
              <span>{copied ? '已复制' : '复制内容'}</span>
            </button>

            {/* Render toggle */}
            <button
              className={`wf-action-btn ${renderMode ? 'wf-action-btn--active' : ''}`}
              onClick={() => setRenderMode((v) => !v)}
            >
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {renderMode ? (
                    <>
                      <path d="M17 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
                      <path d="M9 7h6M9 11h6M9 15h4" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </span>
              <span>{renderMode ? '源码' : '渲染'}</span>
            </button>

            {/* Export dropdown */}
            <div ref={exportMenuRef} style={{ position: 'relative' }}>
              <button
                className="wf-action-btn"
                onClick={() => setExportMenuOpen((v) => !v)}
              >
                <span><AppIcon name="download" size={14} /></span>
                <span>导出</span>
                <span style={{ marginLeft: 2 }}><AppIcon name="chevron-down" size={12} /></span>
              </button>
              {exportMenuOpen && (
                <div className="wf-export-dropdown">
                  <button className="wf-export-dropdown-item" onClick={handleExportMarkdown}>
                    <span className="wf-export-dropdown-icon">MD</span>
                    <span>Markdown (.md)</span>
                  </button>
                  <button className="wf-export-dropdown-item" onClick={handleExportWord}>
                    <span className="wf-export-dropdown-icon" style={{ color: '#2b579a' }}>W</span>
                    <span>Word (.doc)</span>
                  </button>
                  <button className="wf-export-dropdown-item" onClick={handleExportPdf}>
                    <span className="wf-export-dropdown-icon" style={{ color: '#d32f2f' }}>P</span>
                    <span>PDF (打印)</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Report content */}
          {renderMode ? (
            <div className="wf-rich-text markdown-viewer wf-report-markdown" style={{ maxHeight: 480 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {primaryReport}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="wf-rich-text" style={{ maxHeight: 480, wordBreak: 'break-word' }}>
              {primaryReport}
            </div>
          )}
        </div>
      ) : (
        <div className="wf-fade-up" style={{
          padding: '24px 18px', borderRadius: 12, border: '1px solid var(--border)',
          background: 'var(--bg-primary)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13,
        }}>
          工作流已完成，最终输出可在右侧聊天面板继续追问或补充整理。
        </div>
      )}

      <div className="wf-fade-up" style={{ paddingTop: 8, animationDelay: '200ms' }}>
        <button className="wf-new-workflow-btn" onClick={onNewWorkflow}>
          <span><AppIcon name="plus" size={14} /></span>
          <span>新建工作流</span>
        </button>
      </div>
    </div>
  )
}

function StatBadge({ value, label, color }) {
  return (
    <div className="wf-stat-badge">
      <span className="wf-stat-value" style={{ color }}>{value}</span>
      <span className="wf-stat-label">{label}</span>
    </div>
  )
}
