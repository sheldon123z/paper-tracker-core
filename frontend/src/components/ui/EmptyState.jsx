// Usage:
// <EmptyState
//   icon={<BookOpenIcon className="h-8 w-8" />}
//   title="No papers yet"
//   description="Add RSS feeds to get started."
//   action={<Button onClick={handleAdd}>Add Feed</Button>}
// />

export default function EmptyState({ icon, title, description, action, className = '' }) {
  return (
    <div
      className={[
        'glass-panel glass-medium panel-outline flex flex-col items-center justify-center gap-3 rounded-shell py-16 px-6 text-center',
        className,
      ].join(' ')}
    >
      {icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-glass bg-primary/35 text-[var(--accent)] shadow-glass">
          {icon}
        </div>
      )}
      {title && (
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      )}
      {description && (
        <p className="text-xs text-[var(--text-secondary)] max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
