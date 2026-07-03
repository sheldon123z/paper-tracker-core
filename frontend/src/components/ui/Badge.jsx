// Usage:
// <Badge variant="success">Published</Badge>
// <Badge variant="warning">Pending</Badge>
// <Badge variant="danger">Rejected</Badge>
// <Badge variant="neutral">Draft</Badge>

const variantClasses = {
  success: 'bg-success-light text-success border border-success/20 shadow-sm',
  warning: 'bg-warning-light text-warning border border-warning/20 shadow-sm',
  danger: 'bg-danger-light text-danger border border-danger/20 shadow-sm',
  neutral: 'glass-subtle text-secondary border border-glass',
}

export default function Badge({ variant = 'neutral', children, className = '' }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase',
        variantClasses[variant] || variantClasses.neutral,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  )
}
