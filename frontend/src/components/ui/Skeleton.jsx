// Usage:
// Single bar:   <Skeleton className="h-4 w-48" />
// Multiple lines: <Skeleton lines={3} />
// Custom block: <Skeleton className="h-24 w-full rounded-lg" />

export default function Skeleton({ className = '', lines }) {
  if (lines && lines > 1) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={[
              'animate-pulse rounded-2xl bg-[linear-gradient(90deg,transparent,rgba(var(--accent-rgb),0.12),transparent)] bg-[length:180%_100%]',
              // Last line slightly shorter for a natural look
              i === lines - 1 ? 'h-3 w-3/4' : 'h-3 w-full',
            ].join(' ')}
            aria-hidden="true"
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={['animate-pulse rounded-2xl bg-[linear-gradient(90deg,rgba(var(--accent-rgb),0.08),rgba(255,255,255,0.16),rgba(var(--accent-rgb),0.08))] bg-[length:180%_100%]', className].join(' ')}
      aria-hidden="true"
    />
  )
}
