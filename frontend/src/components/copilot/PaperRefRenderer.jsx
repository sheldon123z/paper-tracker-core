import { useNavigate } from 'react-router-dom'
import useStore from '../../store'

/**
 * Renders <paper-ref id="42">Title</paper-ref> as a clickable inline chip.
 * Used via CopilotChat's markdownTagRenderers prop.
 */
function PaperRefRenderer({ id, children }) {
  const navigate = useNavigate()
  const openTab = useStore((s) => s.openTab)

  const paperId = parseInt(id, 10)
  if (!Number.isFinite(paperId)) {
    return <span>{children}</span>
  }

  const handleClick = () => {
    openTab({ id: paperId, title: typeof children === 'string' ? children : `Paper #${paperId}` })
    navigate('/papers')
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="copilot-paper-ref"
      title={`跳转到论文 #${paperId}`}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
      <span>{children}</span>
    </button>
  )
}

export const MARKDOWN_TAG_RENDERERS = {
  'paper-ref': PaperRefRenderer,
}

export default PaperRefRenderer
