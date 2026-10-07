import type { ReactNode } from 'react'
import { Card } from './Card'
import { toneBg, toneText, type Tone } from './Chip'
import { cx } from './cx'
import { Icon, type IconName } from './icons'

type Direction = 'up' | 'down' | 'flat'

interface TrendMarkProps {
  direction: Direction
  /** Whether this direction is the wanted one: true ok, false risk, null or omitted neutral. */
  good?: boolean | null
  /** The meaning in words — an arrow alone says nothing to a screen reader. */
  label: string
  className?: string
}

/** An arrow for "up", "down" or "steady", always with its meaning in words alongside. */
export function TrendMark({ direction, good = null, label, className }: TrendMarkProps) {
  const tone = good === true ? 'text-ok' : good === false ? 'text-risk' : 'text-ink-3'
  return (
    <span className={cx('inline-flex shrink-0 items-center', tone, className)}>
      <Icon name={direction === 'up' ? 'trend-up' : direction === 'down' ? 'trend-down' : 'minus'} size={16} />
      <span className="sr-only">{label}</span>
    </span>
  )
}

interface MetricCardProps {
  label: string
  value: ReactNode
  unit?: string
  delta?: { text: string; direction: Direction; good?: boolean | null }
  /** One quiet line: what the figure covers, or why it is not shown. */
  hint?: string
  className?: string
}

/** One figure with its name, and optionally how it has moved. */
export function MetricCard({ label, value, unit, delta, hint, className }: MetricCardProps) {
  return (
    <Card className={cx('flex flex-col gap-1.5', className)}>
      <p className="eyebrow">{label}</p>
      <p className="tnum flex items-baseline gap-1 text-[28px] leading-none font-semibold tracking-tight text-ink">
        {value}
        {unit && <span className="text-[13px] font-medium text-ink-3">{unit}</span>}
      </p>
      {delta && (
        <p className={cx('flex items-center gap-1 text-[12.5px]', delta.good === true ? 'text-ok' : delta.good === false ? 'text-risk' : 'text-ink-3')}>
          <TrendMark direction={delta.direction} good={delta.good} label={delta.direction === 'flat' ? 'steady' : delta.direction} />
          {delta.text}
        </p>
      )}
      {hint && <p className="text-[12.5px] leading-snug text-ink-3">{hint}</p>}
    </Card>
  )
}

interface InsightCardProps {
  tone?: Tone
  icon?: IconName
  children: ReactNode
}

/** One observation the data supports, stated plainly. */
export function InsightCard({ tone = 'neutral', icon = 'info', children }: InsightCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-card bg-surface p-3.5 shadow-card">
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-control', toneBg(tone), toneText(tone))}>
        <Icon name={icon} size={16} />
      </span>
      <p className="min-w-0 flex-1 pt-1 text-[13.5px] leading-relaxed text-ink">{children}</p>
    </div>
  )
}
