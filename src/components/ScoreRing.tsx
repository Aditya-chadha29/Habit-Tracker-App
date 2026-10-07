import type { ReactNode } from 'react'
import { percent, type Tally } from '../engine/score'
import { Card } from '../ui/Card'
import type { Tone } from '../ui/Chip'
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
}

/**
 * A score as a ring with its count beside it — never a bare percentage, so the arithmetic
 * ("14 of 22") is always in view. Nothing due reads as "—", not 0%.
 *
 * Two of these sit side by side on a phone, so the narrow layout stacks the ring over the count;
 * with more room the count moves beside the ring.
 */
export function ScoreRing({ title, tally, caption, tone = 'accent', footer, compact = false }: ScoreRingProps) {
  const value = percent(tally)
  if (compact) {
    return (
      <Card padded={false} className="flex items-center gap-3 p-3.5">
        <ProgressRing
          value={tally.due ? tally.done / tally.due : null}
          size={62}
          stroke={7}
          tone={tone}
          label={value === null ? `${title}: nothing due` : `${title}: ${value} percent, ${tally.done} of ${tally.due}`}
        >
          <span className="tnum text-[15px] leading-none font-semibold text-ink">{value === null ? '—' : value}</span>
        </ProgressRing>
        <div className="min-w-0">
          <h2 className="eyebrow truncate">{title}</h2>
          <p className="tnum mt-0.5 text-[17px] leading-tight font-semibold tracking-tight whitespace-nowrap text-ink">
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
