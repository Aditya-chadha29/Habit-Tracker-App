import type { ReactNode } from 'react'
import { percent, type Tally } from '../engine/score'
import { Card } from '../ui/Card'
import type { Tone } from '../ui/Chip'
import { cx } from '../ui/cx'
import { Icon } from '../ui/icons'
import { ProgressRing } from '../ui/Progress'

interface ScoreRingProps {
  title: string
  tally: Tally
  /** "so far", "recorded". */
  caption: string
  tone?: Tone
  /** Something to sit under the count, such as a link. */
  footer?: ReactNode
  /** A short card: small ring beside the count, so six of them fit one phone screen. */
  compact?: boolean
  /** With compact: a step larger, for the two scores that lead the screen. */
  lead?: boolean
  /** With compact: for a pillar that is one thing a day. A tick and a word, not a count of one. */
  single?: boolean
}

/**
 * A score as a ring with its count beside it — never a bare percentage, so the arithmetic
 * ("14 of 22") is always in view. Nothing due reads as "—", not 0%.
 *
 * Two of these sit side by side on a phone, so the narrow layout stacks the ring over the count;
 * with more room the count moves beside the ring.
 */
export function ScoreRing({ title, tally, caption, tone = 'accent', footer, compact = false, lead = false, single = false }: ScoreRingProps) {
  const value = percent(tally)
  if (compact && single) {
    const done = tally.due > 0 && tally.done >= tally.due
    const state = tally.due === 0 ? 'Not due' : done ? 'Done' : 'Pending'
    return (
      <Card padded={false} className="flex items-center gap-3 p-3.5">
        <span
          role="img"
          aria-label={`${title}: ${state}`}
          className={cx('flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full', done ? 'bg-ok text-ground' : 'shadow-[inset_0_0_0_7px_var(--color-surface-3)]')}
        >
          {done && <Icon name="check" size={28} className="stroke-[3]" />}
        </span>
        <div className="min-w-0">
          <h2 className="eyebrow truncate">{title}</h2>
          <p className={cx('mt-0.5 text-[17px] leading-tight font-semibold tracking-tight', done ? 'text-ok' : 'text-ink')}>{state}</p>
          <p className="mt-0.5 text-[12px] text-ink-3">today</p>
        </div>
      </Card>
    )
  }
  if (compact) {
    return (
      <Card padded={false} className={lead ? 'flex flex-col items-center gap-2.5 p-3.5 text-center' : 'flex items-center gap-3 p-3.5'}>
        <ProgressRing
          value={tally.due ? tally.done / tally.due : null}
          size={lead ? 78 : 62}
          stroke={lead ? 8 : 7}
          tone={tone}
          label={value === null ? `${title}: nothing due` : `${title}: ${value} percent, ${tally.done} of ${tally.due}`}
        >
          <span className={lead ? 'tnum text-[19px] leading-none font-semibold text-ink' : 'tnum text-[15px] leading-none font-semibold text-ink'}>{value === null ? '—' : value}
            {value !== null && <span className={lead ? 'ml-px text-[11px] font-medium text-ink-3' : 'ml-px text-[9.5px] font-medium text-ink-3'}>%</span>}
          </span>
        </ProgressRing>
        <div className="min-w-0">
          <h2 className="eyebrow truncate">{title}</h2>
          <p className={lead ? 'tnum mt-1 text-[20px] leading-tight font-semibold tracking-tight whitespace-nowrap text-ink' : 'tnum mt-0.5 text-[17px] leading-tight font-semibold tracking-tight whitespace-nowrap text-ink'}>
            {tally.done} <span className="text-ink-3">/</span> {tally.due}
          </p>
          <p className="truncate text-[11.5px] text-ink-3">{caption}</p>
        </div>
      </Card>
    )
  }
  return (
    <Card className="flex flex-col items-center gap-3 text-center sm:flex-row sm:gap-4 sm:text-left">
      <ProgressRing
        value={tally.due ? tally.done / tally.due : null}
        size={88}
        stroke={8}
        tone={tone}
        label={value === null ? `${title}: nothing due` : `${title}: ${value} percent, ${tally.done} of ${tally.due}`}
      >
        <span className="tnum text-[22px] leading-none font-semibold tracking-tight text-ink">
          {value === null ? '—' : value}
          {value !== null && <span className="text-[12px] font-medium text-ink-3">%</span>}
        </span>
      </ProgressRing>
      <div className="min-w-0">
        <h2 className="eyebrow">{title}</h2>
        <p className="tnum mt-1 text-[19px] leading-tight font-semibold tracking-tight text-ink">
          {tally.done} <span className="text-ink-3">/</span> {tally.due}
          <span className="ml-1.5 text-[12.5px] font-normal tracking-normal text-ink-3">{caption}</span>
        </p>
        {footer}
      </div>
    </Card>
  )
}
