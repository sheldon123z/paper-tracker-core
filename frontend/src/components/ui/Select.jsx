// Usage:
// <Select
//   label="Sort by"
//   options={[{ value: 'date', label: 'Date' }, { value: 'title', label: 'Title' }]}
//   value={sortBy}
//   onChange={setSortBy}
// />

import { useId } from 'react'
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import AppIcon from './AppIcon'

export default function Select({
  label,
  options = [],
  value,
  onChange,
  className = '',
  id,
  error,
  required = false,
  disabled = false,
}) {
  const generatedId = useId()
  const selectId = id || generatedId
  const selected = options.find((o) => o.value === value) ?? options[0] ?? null

  return (
    <div className={['flex flex-col gap-1', className].join(' ')}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <div className="relative">
          <ListboxButton
            id={selectId}
            aria-required={required || undefined}
            aria-invalid={!!error}
            aria-describedby={error ? `${selectId}-error` : undefined}
            className={[
              'input-surface w-full flex items-center justify-between rounded-2xl border px-4 py-2.5 text-sm',
              'text-[var(--text-primary)] hover:border-strong outline-none transition-colors duration-150',
              'focus:border-accent focus:ring-2 focus:ring-[var(--ring)]',
              error ? 'border-danger focus:border-danger focus:ring-danger/30' : '',
            ].join(' ')}
          >
            <span>{selected?.label ?? 'Select...'}</span>
            <AppIcon name="chevron-down" size={14} className="text-[var(--text-secondary)] shrink-0" />
          </ListboxButton>

          <ListboxOptions
            className={[
              'glass-panel glass-premium absolute z-50 mt-2 w-full rounded-2xl border border-[var(--glass-stroke)] py-1 outline-none',
            ].join(' ')}
          >
            {options.map((option) => (
              <ListboxOption
                key={option.value}
                value={option.value}
                className={({ focus, selected: isSelected }) =>
                  [
                    'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer',
                    focus ? 'bg-secondary text-[var(--text-primary)]' : 'text-[var(--text-primary)]',
                    isSelected ? 'font-medium' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
              >
                {({ selected: isSelected }) => (
                  <>
                    <span className="flex-1">{option.label}</span>
                    {isSelected && (
                      <AppIcon name="check" size={14} className="text-accent shrink-0" />
                    )}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
      {error && (
        <p id={`${selectId}-error`} className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
