import parseToolResult from './parseToolResult'
import { PALETTES } from './cardStyles'
import { CardShell, CardHeader, SkeletonLoader } from './CardPrimitives'
import AppIcon from '../../ui/AppIcon'

/**
 * Rich card renderer for get_paper_notes.
 * Index card-styled notes with expandable content.
 * Fixes data shape: backend returns flat array, not { papers: [...] }.
 */
export default function PaperNotesRenderer({ label, status, result }) {
  if (status !== 'complete') {
    return <SkeletonLoader palette={PALETTES.notes} lines={4} />
  }

  const { data } = parseToolResult(result)
  if (!data) {
    return <SkeletonLoader palette={PALETTES.notes} lines={3} />
  }

  // Support both flat array and nested { papers: [...] } shapes
  const papers = Array.isArray(data) ? data : (Array.isArray(data.papers) ? data.papers : [])
  const totalWithNotes = data.total_with_notes ?? papers.length

  return (
    <CardShell>
      <CardHeader palette={PALETTES.notes} icon={<AppIcon name="copy" size={15} />} title={label}
        badge={`${totalWithNotes} 篇有笔记`} />

      {papers.length === 0 ? (
        <div style={{ padding: '20px 16px', color: 'var(--text-secondary)', textAlign: 'center', fontSize: 12 }}>
          暂无论文笔记
        </div>
      ) : (
        <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {papers.map((p, i) => {
            const notesPreview = (p.notes || '').slice(0, 100)
            const notesLen = p.notes_length ?? (p.notes || '').length

            return (
              <details key={p.id || i} style={{
                borderRadius: 8, border: '1px solid var(--border)',
                overflow: 'hidden', backgroundColor: 'var(--bg-primary)',
              }}>
                <summary style={{
                  padding: '10px 12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  userSelect: 'none', listStyle: 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.title || '未知标题'}
                    </div>
                    {notesPreview && (
                      <div style={{
                        marginTop: 4, fontSize: 11, color: 'var(--text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {notesPreview}{(p.notes || '').length > 100 ? '...' : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    {notesLen > 0 && (
                      <span style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 4,
                        backgroundColor: PALETTES.notes.accentLight, color: PALETTES.notes.accent,
                        fontWeight: 600,
                      }}>
                        {notesLen} 字
                      </span>
                    )}
                  </div>
                </summary>

                <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px' }}>
                  {/* Full notes */}
                  {p.notes && (
                    <div style={{
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6,
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 6, padding: '10px 12px',
                      borderLeft: `3px solid ${PALETTES.notes.accent}`,
                      maxHeight: 200, overflow: 'auto',
                    }}>
                      {p.notes}
                    </div>
                  )}

                  {/* AI summary */}
                  {p.ai_summary && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4,
                      }}>
                        <span style={{
                          fontSize: 9, padding: '1px 6px', borderRadius: 4,
                          background: PALETTES.search.gradient, color: '#fff', fontWeight: 600,
                        }}>AI</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>智能摘要</span>
                      </div>
                      <div style={{
                        padding: '10px 12px', borderRadius: 6,
                        backgroundColor: PALETTES.search.accentLight,
                        borderLeft: `3px solid ${PALETTES.search.accent}`,
                        fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6,
                      }}>
                        {p.ai_summary}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </CardShell>
  )
}
