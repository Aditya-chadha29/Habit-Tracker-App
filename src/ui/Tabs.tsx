import type { KeyboardEvent } from 'react'
import { cx } from './cx'

export interface TabOption<T extends string = string> {
  id: T
  label: string
  /** A small count shown after the label. */
  count?: number
}

interface SegmentedProps<T extends string> {
  options: readonly TabOption<T>[]
  value: T
  onChange: (id: T) => void
  /** What the choice is about, for screen readers. */
  label: string
  size?: 'sm' | 'md'
  /** Stretch across the container and share the width equally. */
  block?: boolean
  className?: string
}

/**
 * A row of mutually exclusive choices: the tabs of a screen, a range, a filter. The selected one
 * is a filled pill. When the options do not fit it scrolls inside itself; the page never does.
 */
export function Segmented<T extends string>({ options, value, onChange, label, size = 'md', block = false, className }: SegmentedProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const current = options.findIndex((option) => option.id === value)
    const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
    onChange(options[next].id)
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx(
        'flex gap-1 overflow-x-auto rounded-control bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        block ? 'w-full' : 'w-fit max-w-full',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.id)}
            className={cx(
              'cursor-pointer rounded-[7px] px-3.5 font-medium whitespace-nowrap transition-colors duration-100',
              size === 'md' ? 'h-9 text-[13.5px]' : 'h-7 text-[12.5px]',
              block && 'min-w-0 flex-1',
              selected ? 'bg-accent text-on-accent' : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={cx('tnum ml-1.5 text-[11.5px]', selected ? 'text-on-accent/80' : 'text-ink-3')}>{option.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
