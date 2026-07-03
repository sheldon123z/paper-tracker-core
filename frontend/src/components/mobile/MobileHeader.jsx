export default function MobileHeader({ title, onBack }) {
  return (
    <div
      className="mobile-header"
      style={{
        height: 'calc(44px + env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        paddingLeft: '8px',
        paddingRight: '16px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-primary)',
        flexShrink: 0,
      }}
    >
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--accent)',
          flexShrink: 0,
          borderRadius: '8px',
        }}
        aria-label="返回"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          color: 'var(--text-primary)',
          fontSize: '15px',
          fontWeight: 600,
          letterSpacing: '0.01em',
        }}
      >
        {title || '论文详情'}
      </span>
    </div>
  )
}
