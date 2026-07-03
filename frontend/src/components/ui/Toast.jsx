// Usage:
// Place <ToastContainer /> once near the root of your app (e.g. in App.jsx).
// Toasts are triggered via useToast hook — see useToast.js for details.

import { useToastStore } from './useToast'
import AppIcon from './AppIcon'

const typeConfig = {
  success: {
    icon: (
      <AppIcon name="completed" size={16} className="shrink-0 text-[var(--success)]" />
    ),
    bar: 'bg-[var(--success)]',
  },
  error: {
    icon: (
      <AppIcon name="close" size={16} className="shrink-0 text-[var(--danger)]" />
    ),
    bar: 'bg-[var(--danger)]',
  },
  warning: {
    icon: (
      <AppIcon name="queued" size={16} className="shrink-0 text-[var(--warning)]" />
    ),
    bar: 'bg-[var(--warning)]',
  },
  info: {
    icon: (
      <AppIcon name="assistant" size={16} className="shrink-0 text-accent" />
    ),
    bar: 'bg-accent',
  },
}

function Toast({ id, type, message }) {
  const removeToast = useToastStore((s) => s.removeToast)
  const config = typeConfig[type] ?? typeConfig.info

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        'glass-panel glass-premium panel-outline flex items-start gap-3 rounded-2xl border border-[var(--glass-stroke)]',
        'px-4 py-3 text-sm text-[var(--text-primary)]',
        'w-80 max-w-full overflow-hidden',
      ].join(' ')}
    >
      {/* Left accent bar */}
      <div className={['w-1 self-stretch rounded-full shrink-0', config.bar].join(' ')} aria-hidden="true" />
      {config.icon}
      <p className="flex-1 leading-snug">{message}</p>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 rounded-xl p-1 text-[var(--text-secondary)] hover:bg-primary/50 hover:text-[var(--text-primary)] transition-colors"
        aria-label="Dismiss notification"
      >
        <AppIcon name="close" size={14} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  )
}
