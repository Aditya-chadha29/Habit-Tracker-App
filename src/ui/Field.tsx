import {
  createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
  type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx'
import { Icon } from './icons'
import { formatNumber, parseNumber, stepValue } from './numbers'

interface FieldIds {
  id: string
  describedBy: string | undefined
  invalid: boolean
}

const FieldContext = createContext<FieldIds | null>(null)

const CONTROL =
  'w-full rounded-control bg-surface-2 px-3 text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-shadow duration-100 focus:shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)] disabled:cursor-not-allowed disabled:opacity-60'
const INVALID = 'shadow-[inset_0_0_0_1.5px_var(--color-risk)] focus:shadow-[inset_0_0_0_1.5px_var(--color-risk)]'

interface FieldProps {
  label: string
  hint?: string
  /** Shown instead of the hint, and announced. */
  error?: string
  /** Set only when the control inside is not a TextInput, TextArea or Select and has its own id. */
  htmlFor?: string
  children: ReactNode
  className?: string
}

/**
 * A labelled form row. A TextInput, TextArea or Select placed inside is wired to the label and
 * to the hint or error automatically; nothing else has to be passed.
 */
export function Field({ label, hint, error, htmlFor, children, className }: FieldProps) {
  const generated = useId()
  const id = htmlFor ?? generated
  const noteId = `${generated}-note`
  const note = error || hint
  return (
    <FieldContext.Provider value={{ id, describedBy: note ? noteId : undefined, invalid: !!error }}>
      <div className={cx('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-[12.5px] font-medium text-ink-2">
          {label}
        </label>
        {children}
        {note && (
          <p id={noteId} role={error ? 'alert' : undefined} className={cx('text-[12.5px] leading-snug', error ? 'text-risk' : 'text-ink-3')}>
            {note}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export function TextInput({ invalid, className, id, type = 'text', ...rest }: TextInputProps) {
  const field = useContext(FieldContext)
  return (
    <input
      id={id ?? field?.id}
      type={type}
      aria-describedby={field?.describedBy}
      aria-invalid={invalid || field?.invalid || undefined}
      className={cx(CONTROL, 'h-11', (invalid || field?.invalid) && INVALID, className)}
      {...rest}
    />
  )
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow with the text instead of scrolling inside a fixed box. */
  autoGrow?: boolean
  invalid?: boolean
}

export function TextArea({ autoGrow = false, invalid, className, id, rows = 3, onInput, ...rest }: TextAreaProps) {
  const field = useContext(FieldContext)
  const ref = useRef<HTMLTextAreaElement>(null)

  const fit = () => {
    const element = ref.current
    if (!element || !autoGrow) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight + 2}px`
  }
  // Sized on mount and whenever the content is replaced from outside (a loaded entry).
  useLayoutEffect(fit)

  return (
    <textarea
      ref={ref}
      id={id ?? field?.id}
      rows={rows}
      aria-describedby={field?.describedBy}
      aria-invalid={invalid || field?.invalid || undefined}
      onInput={(event) => {
        fit()
        onInput?.(event)
      }}
      className={cx(CONTROL, 'py-2.5 leading-relaxed', autoGrow ? 'resize-none overflow-hidden' : 'resize-y', (invalid || field?.invalid) && INVALID, className)}
      {...rest}
    />
  )
}

export function Select({ className, id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const field = useContext(FieldContext)
  return (
    <span className="relative block">
      <select
        id={id ?? field?.id}
        aria-describedby={field?.describedBy}
        className={cx(CONTROL, 'h-11 cursor-pointer appearance-none pr-9', className)}
        {...rest}
      >
        {children}
      </select>
      <Icon name="chevron-down" size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" />
    </span>
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-11 w-[52px] shrink-0 cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={cx('relative h-[26px] w-[46px] rounded-full transition-colors duration-150', checked ? 'bg-accent' : 'bg-surface-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)]')}>
        <span
          className={cx(
            'absolute top-[3px] left-[3px] h-5 w-5 rounded-full transition-transform duration-150',
            checked ? 'translate-x-5 bg-on-accent' : 'bg-ink-2',
          )}
        />
      </span>
    </button>
  )
}

interface StepperProps {
  value: number | null
  onChange: (next: number) => void
  step?: number
  min?: number
  max?: number
  /** What the number is, for screen readers ("Weight in kilograms"). */
  label: string
  unit?: string
  format?: (value: number) => string
  /** lg is for workout logging: 52px buttons that can be hit with a tired thumb. */
  size?: 'md' | 'lg'
  className?: string
}

/**
 * Minus, value, plus. Tapping the value turns it into a field for typing an exact number;
 * holding a button repeats it. Built so that a set can be logged without the keyboard.
 */
export function Stepper({ value, onChange, step = 1, min = 0, max = 100000, label, unit, format = formatNumber, size = 'md', className }: StepperProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const latest = useRef(value ?? min)
  const repeat = useRef<number | null>(null)
  latest.current = value ?? min

  const stop = () => {
    if (repeat.current !== null) window.clearInterval(repeat.current)
    repeat.current = null
  }
  useEffect(() => stop, [])

  const nudge = (direction: 1 | -1) => onChange(stepValue(latest.current, step, direction, min, max))

  const hold = (direction: 1 | -1) => {
    stop()
    let waited = 0
    // The first repeat waits a moment so that a plain tap is always exactly one step.
    repeat.current = window.setInterval(() => {
      waited += 1
      if (waited > 4) nudge(direction)
    }, 90)
  }

  const commit = () => {
    const parsed = parseNumber(draft)
    if (parsed !== null) onChange(Math.min(max, Math.max(min, parsed)))
    setEditing(false)
  }

  const side = size === 'lg' ? 'h-13 w-13' : 'h-11 w-11'
  const button = cx(
    'flex shrink-0 cursor-pointer items-center justify-center rounded-control bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] transition-colors duration-100 select-none active:bg-surface-3 disabled:opacity-40',
    side,
  )

  return (
    <div role="group" aria-label={label} className={cx('flex items-center gap-1.5', className)}>
      <button
        type="button"
        aria-label={`Less: ${label}`}
        className={button}
        disabled={latest.current <= min}
        onClick={() => nudge(-1)}
        onPointerDown={() => hold(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
      >
        <Icon name="minus" size={18} />
      </button>
      {editing ? (
        <input
          autoFocus
          inputMode="decimal"
          aria-label={label}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
            if (event.key === 'Escape') setEditing(false)
          }}
          className={cx('tnum min-w-0 flex-1 rounded-control bg-surface-2 text-center font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)] outline-none', size === 'lg' ? 'h-13 text-[20px]' : 'h-11 text-[16px]')}
        />
      ) : (
        <button
          type="button"
          aria-label={`${label}: ${value === null ? 'not set' : format(value)}${unit ? ` ${unit}` : ''}. Tap to type a value.`}
          onClick={() => {
            setDraft(value === null ? '' : format(value))
            setEditing(true)
          }}
          className={cx('tnum min-w-0 flex-1 cursor-text rounded-control text-center font-semibold text-ink', size === 'lg' ? 'h-13 text-[20px]' : 'h-11 text-[16px]')}
        >
          {value === null ? '—' : format(value)}
          {unit && value !== null && <span className="ml-1 text-[12px] font-medium text-ink-3">{unit}</span>}
        </button>
      )}
      <button
        type="button"
        aria-label={`More: ${label}`}
        className={button}
        disabled={latest.current >= max}
        onClick={() => nudge(1)}
        onPointerDown={() => hold(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface WeekdayPickerProps {
  /** 0 = Monday … 6 = Sunday. */
  value: number[]
  onChange: (days: number[]) => void
  label: string
}

export function WeekdayPicker({ value, onChange, label }: WeekdayPickerProps) {
  const toggle = (day: number) => {
    const next = value.includes(day) ? value.filter((d) => d !== day) : [...value, day]
    onChange(next.sort((a, b) => a - b))
  }
  return (
    <div role="group" aria-label={label} className="flex gap-1.5">
      {DAY_INITIALS.map((initial, day) => {
        const on = value.includes(day)
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            aria-label={DAY_NAMES[day]}
            onClick={() => toggle(day)}
            className={cx(
              'h-11 min-w-0 flex-1 cursor-pointer rounded-control text-[13.5px] font-medium transition-colors duration-100',
              on ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-surface-3',
            )}
          >
            {initial}
          </button>
        )
      })}
    </div>
  )
}
