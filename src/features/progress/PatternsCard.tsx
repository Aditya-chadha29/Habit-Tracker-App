import { useMemo } from 'react'
import { addDays, dateRange } from '../../engine/dates'
import { patternLines } from '../../engine/patterns'
import { useCore } from '../../state/core'
import { Card, SectionTitle } from '../../ui/Card'

/** How many days back the patterns look. */
const PATTERN_DAYS = 90

/** A few fixed pairs of habits, in counts. Shown only when there are enough days behind them. */
export function PatternsCard() {
  const { today, habits, index } = useCore()
  const lines = useMemo(() => patternLines(habits, dateRange(addDays(today, -PATTERN_DAYS), addDays(today, -2)), index), [habits, today, index])
  if (lines.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Patterns · last {PATTERN_DAYS} days</SectionTitle>
      <Card className="flex flex-col gap-2.5">
        {lines.map((line) => (
          <p key={line.key} className="text-[13.5px] leading-relaxed text-ink-2">
            {line.text}
          </p>
        ))}
        <p className="text-[12px] text-ink-3">Counts from the record. They show what happened together, not why.</p>
      </Card>
    </section>
  )
}
