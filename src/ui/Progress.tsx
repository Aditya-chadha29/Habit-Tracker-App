import type { ReactNode } from 'react'
import { toneSolid, toneStroke, type Tone } from './Chip'
import { cx } from './cx'

interface ProgressRingProps {
  /** 0–1, or null when there is nothing to measure — drawn as a dashed track, not as zero. */
  value: number | null
  size?: number
  stroke?: number
  tone?: Tone
  /** The whole reading in words, for screen readers. */
  label: string
  /** Shown in the middle. */
  children?: ReactNode
  className?: string
}

export function ProgressRing({ value, size = 72, stroke = 7, tone = 'accent', label, children, className }: ProgressRingProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = value === null ? 0 : Math.min(1, Math.max(0, value))
  return (
    <div role="img" aria-label={label} className={cx('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-3"
          strokeDasharray={value === null ? '3 6' : undefined}
        />
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={cx(toneStroke(tone), 'transition-[stroke-dashoffset] duration-300')}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  )
}

interface ProgressBarProps {
  value: number
  max: number
  tone?: Tone
  label: string
  /** Pixels; 8 by default. */
  height?: number
  className?: string
}

export function ProgressBar({ value, max, tone = 'accent', label, height = 8, className }: ProgressBarProps) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className={cx('w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
    >
      <div className={cx('h-full rounded-full transition-[width] duration-300 ease-out', toneSolid(tone))} style={{ width: `${fraction * 100}%` }} />
    </div>
  )
}
