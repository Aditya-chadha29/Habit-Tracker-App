import { useEffect, useRef, useState } from 'react'
import { cx } from './cx'
import { Icon } from './icons'

interface TickProps {
  checked: boolean
  onChange?: (next: boolean) => void
  /** What is being ticked, for screen readers. Pass '' only for a purely decorative tick. */
  label: string
  size?: 'md' | 'lg'
  tone?: 'ok' | 'accent'
  disabled?: boolean
  /** Draws the state without being a control: for a row that is itself the button, a habit that
   *  sessions complete, or a locked day. */
  readOnly?: boolean
  className?: string
}

/**
 * The app's checkbox. A 24px box (30px at lg) inside a 44px hit area. It settles with a small
 * pop at the moment it becomes checked, and at no other time.
 */
export function Tick({ checked, onChange, label, size = 'md', tone = 'ok', disabled = false, readOnly = false, className }: TickProps) {
  const previous = useRef(checked)
  const [popping, setPopping] = useState(false)

  useEffect(() => {
    if (checked && !previous.current) {
      setPopping(true)
      const timer = window.setTimeout(() => setPopping(false), 220)
      previous.current = checked
      return () => window.clearTimeout(timer)
    }
    previous.current = checked
  }, [checked])

  const box = (
    <span
      className={cx(
        'flex items-center justify-center rounded-[7px] transition-colors duration-100',
        size === 'lg' ? 'h-[30px] w-[30px]' : 'h-6 w-6',
        checked
          ? tone === 'accent'
            ? 'bg-accent text-on-accent'
            : 'bg-ok text-ground'
          : 'bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]',
        popping && 'animate-tick-pop',
      )}
    >
      {checked && <Icon name="check" size={size === 'lg' ? 18 : 15} className="stroke-[3]" />}
    </span>
  )

  if (readOnly) {
    return (
      <span
        role={label ? 'img' : undefined}
        aria-label={label ? `${label}: ${checked ? 'done' : 'not done'}` : undefined}
        aria-hidden={label ? undefined : true}
        className={cx('inline-flex h-11 w-9 items-center justify-center', disabled && 'opacity-50', className)}
      >
        {box}
      </span>
    )
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cx(
        'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {box}
    </button>
  )
}
