/**
 * Reusable card primitive components for rich tool renderers.
 * All components use inline styles + CSS variables for dark mode compatibility.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../../../store'
import AppIcon from '../../ui/AppIcon'
import { CARD_SHELL, CARD_HEADER, CARD_BODY, getCategoryColor, getRelevanceColor } from './cardStyles'

// ---------------------------------------------------------------------------
// CardShell — outer wrapper with rounded corners, shadow, border
// ---------------------------------------------------------------------------
export function CardShell({ children, style, className = '' }) {
  return <div className={`copilot-tool-card-shell ${className}`.trim()} style={{ ...CARD_SHELL, ...style }}>{children}</div>
}

// ---------------------------------------------------------------------------
// CardHeader — gradient header with icon, title, and optional right badge
// ---------------------------------------------------------------------------
export function CardHeader({ palette, icon, title, badge, children }) {
  return (
    <div className="copilot-tool-card-header" style={{ ...CARD_HEADER, background: palette.gradient }}>
      <span style={{
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: palette.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
        fontSize: 14, flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </span>
      {badge != null && (
        <span style={{
          backgroundColor: 'rgba(255,255,255,0.25)',
          padding: '2px 10px', borderRadius: 12,
          fontSize: 11, fontWeight: 600, flexShrink: 0,
        }}>
          {badge}
        </span>
      )}
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PaperMiniCard — compact paper representation for lists
// ---------------------------------------------------------------------------
export function PaperMiniCard({ paper, showAbstract = false, variant = 'compact' }) {
  const catColor = getCategoryColor(paper.category)
  const authorSource = Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || '')
  const firstAuthor = authorSource.split(/[;,]/)[0].trim()
  const authorDisplay = firstAuthor ? (authorSource.includes(';') || authorSource.includes(',') ? `${firstAuthor} et al.` : firstAuthor) : ''
  const isFeatured = variant === 'featured'
  const tags = typeof paper.tags === 'string' ? paper.tags.split(',') : paper.tags

  // Navigation: click title to open paper in tab system
  const navigate = useNavigate()
  const openTab = useStore((s) => s.openTab)
  const handleTitleClick = (e) => {
    e.stopPropagation()
    if (paper.id) {
      openTab(paper)
      navigate('/papers')
    }
  }

  return (
    <article
      className={`copilot-paper-card copilot-paper-card--${variant}`}
      style={{ '--paper-accent': catColor }}
    >
      {/* Left accent bar */}
      <div className="copilot-paper-card__rail" />

      {/* Content */}
      <div className="copilot-paper-card__content">
        {/* Title row — clickable to open paper detail */}
        <div
          onClick={paper.id ? handleTitleClick : undefined}
          className={`copilot-paper-card__title ${paper.id ? 'is-link' : ''}`}
          title={paper.id ? '点击查看论文详情' : undefined}
        >
          {paper.title || 'Untitled'}
        </div>

        {/* Author + metadata row */}
        <div className="copilot-paper-card__meta">
          {authorDisplay && (
            <span>{authorDisplay}</span>
          )}
          {paper.published_date && (
            <span>
              {paper.published_date.slice(0, 10)}
            </span>
          )}
          {paper.source && (
            <span className="copilot-paper-card__source">
              {paper.source}
            </span>
          )}
        </div>

        {/* Tags row */}
        {tags && tags.length > 0 && (
          <div className="copilot-paper-card__tags">
            {tags.slice(0, isFeatured ? 4 : 3).map((tag, i) => (
              <TagPill key={i} name={typeof tag === 'string' ? tag.trim() : tag.name} color={typeof tag === 'object' ? tag.color : null} />
            ))}
          </div>
        )}

        {/* Abstract preview */}
        {showAbstract && paper.abstract && paper.abstract !== 'N/A' && (
          <div className={`copilot-paper-card__abstract ${isFeatured ? 'is-featured' : ''}`}>
            {paper.abstract}
          </div>
        )}
      </div>

      {/* Right side — relevance + status */}
      <div className={`copilot-paper-card__aside ${isFeatured ? 'is-featured' : ''}`}>
        {paper.relevance != null && (
          <RelevanceBadge score={paper.relevance} size={isFeatured ? 46 : 40} />
        )}
        <div className="copilot-paper-card__status">
          {paper.is_favorited && <AppIcon name="star" size={12} className="text-[#f59e0b]" />}
          {paper.is_read && <AppIcon name="check" size={11} className="text-[#22c55e]" />}
        </div>
        {paper.category && (
          <span className="copilot-paper-card__category">
            {paper.category}
          </span>
        )}
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// RelevanceBadge — circular score indicator (SVG ring)
// ---------------------------------------------------------------------------
export function RelevanceBadge({ score, size = 36 }) {
  if (score == null) return null
  const color = getRelevanceColor(score)
  const r = (size - 6) / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.min(score / 10, 1)
  const offset = circumference * (1 - pct)

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.3, fontWeight: 700, color,
      }}>
        {typeof score === 'number' ? score.toFixed(1) : score}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MetricCard — single stat with icon, value, label
// ---------------------------------------------------------------------------
export function MetricCard({ icon, value, label, color = 'var(--accent)' }) {
  return (
    <div style={{
      textAlign: 'center', padding: '10px 8px', borderRadius: 8,
      background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%), var(--glass-card-subtle)',
      border: '1px solid var(--glass-stroke)',
    }}>
      {icon && <div style={{ fontSize: 16, marginBottom: 4 }}>{icon}</div>}
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TagPill — colored tag capsule
// ---------------------------------------------------------------------------
export function TagPill({ name, color, size = 'sm' }) {
  const bgColor = color ? color + '20' : 'var(--accent-light)'
  const textColor = color || 'var(--accent)'
  const isSmall = size === 'sm'

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: isSmall ? '1px 8px' : '2px 10px',
      borderRadius: 12,
      backgroundColor: bgColor, color: textColor,
      fontSize: isSmall ? 10 : 11, fontWeight: 500,
      whiteSpace: 'nowrap',
    }}>
      {color && <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />}
      {name}
    </span>
  )
}

// ---------------------------------------------------------------------------
// SkeletonLoader — animated shimmer placeholder
// ---------------------------------------------------------------------------
export function SkeletonLoader({ palette, lines = 3, showHeader = true }) {
  return (
    <CardShell>
      {showHeader && (
        <div style={{ ...CARD_HEADER, background: palette.gradient, opacity: 0.7 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          <div style={{ width: '40%', height: 14, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.3)' }} />
        </div>
      )}
      <div style={{ ...CARD_BODY }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} style={{
            height: i === 0 ? 14 : 10,
            width: i === lines - 1 ? '60%' : `${85 + Math.random() * 15}%`,
            borderRadius: 4,
            backgroundColor: 'var(--border)',
            marginBottom: 8,
            animation: 'shimmer 1.5s ease-in-out infinite',
            opacity: 0.5,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </CardShell>
  )
}

// ---------------------------------------------------------------------------
// ExpandableList — show N items with "展开全部" toggle
// ---------------------------------------------------------------------------
export function ExpandableList({ items, renderItem, initialCount = 5, totalLabel = '篇' }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, initialCount)
  const hasMore = items.length > initialCount

  return (
    <>
      <div className="copilot-expandable-list">
        {visible.map(renderItem)}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="copilot-expandable-list__toggle"
        >
          {expanded ? '收起' : `展开全部 (${items.length} ${totalLabel})`}
        </button>
      )}
    </>
  )
}
