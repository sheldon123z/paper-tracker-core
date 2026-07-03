/**
 * Shared card design system — gradient palettes and style constants.
 * Used by all rich tool card renderers.
 */

// --- Gradient palettes for research-themed cards ---
export const PALETTES = {
  search: {
    gradient: 'linear-gradient(135deg, rgba(47,123,255,0.92) 0%, rgba(99,209,255,0.92) 100%)',
    accent: '#63d1ff',
    accentLight: 'rgba(99,209,255,0.14)',
    iconBg: 'rgba(255,255,255,0.14)',
  },
  stats: {
    gradient: 'linear-gradient(135deg, rgba(17,153,142,0.9) 0%, rgba(98,245,194,0.85) 100%)',
    accent: '#62f5c2',
    accentLight: 'rgba(98,245,194,0.14)',
    iconBg: 'rgba(255,255,255,0.14)',
  },
  compare: {
    gradient: 'linear-gradient(135deg, rgba(123,108,255,0.9) 0%, rgba(47,123,255,0.88) 100%)',
    accent: '#7b6cff',
    accentLight: 'rgba(123,108,255,0.14)',
    iconBg: 'rgba(255,255,255,0.14)',
  },
  timeline: {
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
    accent: '#8B5CF6',
    accentLight: 'rgba(139,92,246,0.12)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  tags: {
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
    accent: '#06b6d4',
    accentLight: 'rgba(6,182,212,0.12)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  trends: {
    gradient: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
    accent: '#f97316',
    accentLight: 'rgba(249,115,22,0.12)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  highlights: {
    gradient: 'linear-gradient(135deg, #eab308 0%, #f59e0b 100%)',
    accent: '#eab308',
    accentLight: 'rgba(234,179,8,0.12)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  activity: {
    gradient: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
    accent: '#a855f7',
    accentLight: 'rgba(168,85,247,0.12)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  notes: {
    gradient: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
    accent: '#64748b',
    accentLight: 'rgba(100,116,139,0.12)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  favorites: {
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    accent: '#f59e0b',
    accentLight: 'rgba(245,158,11,0.12)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  duplicates: {
    gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    accent: '#ef4444',
    accentLight: 'rgba(239,68,68,0.12)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
  feeds: {
    gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    accent: '#22c55e',
    accentLight: 'rgba(34,197,94,0.12)',
    iconBg: 'rgba(255,255,255,0.2)',
  },
}

// --- Shared style constants ---
export const CARD_SHELL = {
  borderRadius: 20,
  overflow: 'hidden',
  border: '1px solid var(--glass-stroke)',
  boxShadow: 'var(--glass-shadow-edge), var(--shadow-premium)',
  background: 'var(--glass-card-premium)',
  backdropFilter: 'blur(var(--glass-blur-premium)) saturate(170%)',
  WebkitBackdropFilter: 'blur(var(--glass-blur-premium)) saturate(170%)',
  margin: '8px 0',
}

export const CARD_HEADER = {
  padding: '14px 16px',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
}

export const CARD_BODY = {
  padding: '14px 16px',
}

// --- Category color mapping ---
const CATEGORY_COLORS = {
  'cs.AI': '#667eea',
  'cs.CL': '#06b6d4',
  'cs.CV': '#8B5CF6',
  'cs.LG': '#11998e',
  'cs.ML': '#f97316',
  'cs.NE': '#f5576c',
  'cs.IR': '#eab308',
  'cs.RO': '#a855f7',
  'cs.SE': '#22c55e',
  'stat.ML': '#64748b',
}

export function getCategoryColor(category) {
  if (!category) return '#94a3b8'
  return CATEGORY_COLORS[category] || stringToColor(category)
}

function stringToColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 55%, 55%)`
}

// --- Relevance color helpers ---
export function getRelevanceColor(score) {
  if (score == null) return '#94a3b8'
  if (score >= 7) return '#22c55e'
  if (score >= 4) return '#f59e0b'
  return '#ef4444'
}
