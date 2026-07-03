// Usage:
// <Button variant="primary" size="md" onClick={handleClick}>Save</Button>
// <Button variant="danger" loading={isDeleting}>Delete</Button>
// <Button variant="ghost" size="sm">Cancel</Button>

const variantClasses = {
  primary:
    'border border-white/10 bg-[linear-gradient(135deg,rgba(var(--accent-rgb),0.95),rgba(var(--accent-rgb),0.72))] text-white shadow-glass hover:-translate-y-0.5 hover:shadow-premium focus-visible:ring-2 focus-visible:ring-accent/50',
  secondary:
    'glass-subtle text-primary border border-glass hover:border-strong hover:bg-elevated/70 shadow-sm focus-visible:ring-2 focus-visible:ring-accent/40',
  danger:
    'border border-white/10 bg-[linear-gradient(135deg,rgba(213,79,95,0.95),rgba(213,79,95,0.72))] text-white shadow-glass hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-danger/40',
  ghost:
    'bg-transparent text-secondary hover:bg-primary/60 hover:text-primary focus-visible:ring-2 focus-visible:ring-accent/40',
}

const sizeClasses = {
  sm: 'px-3.5 py-2 text-xs gap-1.5 rounded-xl',
  md: 'px-4.5 py-2.5 text-sm gap-2 rounded-2xl',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  children,
  className = '',
  type = 'button',
}) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center font-medium transition-all duration-200 outline-none active:scale-[0.985] backdrop-blur-xl',
        variantClasses[variant] || variantClasses.primary,
        sizeClasses[size] || sizeClasses.md,
        isDisabled ? 'opacity-50 cursor-not-allowed active:scale-100' : 'cursor-pointer',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
