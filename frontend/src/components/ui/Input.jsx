import { useId } from 'react'

// Usage:
// <Input label="Search" placeholder="Enter query..." value={q} onChange={e => setQ(e.target.value)} />
// <Input label="Email" type="email" error="Invalid email address" value={email} onChange={...} />

export default function Input({
  label,
  error,
  type = 'text',
  placeholder,
  value,
  onChange,
  className = '',
  id,
  ...rest
}) {
  const generatedId = useId()
  const inputId = id || (label ? generatedId : undefined)

  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-secondary uppercase tracking-wider"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        className={[
          'input-surface w-full rounded-2xl border px-4 py-2.5 text-sm',
          'text-primary placeholder:text-tertiary outline-none transition-all duration-200 shadow-sm',
          'hover:border-strong hover:bg-elevated/70',
          'focus:border-accent focus:ring-2 focus:ring-accent/25 focus:bg-elevated/80',
          error ? 'border-danger focus:border-danger focus:ring-danger/30' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {error && (
        <p
          id={inputId ? `${inputId}-error` : undefined}
          className="text-xs text-danger font-medium"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
