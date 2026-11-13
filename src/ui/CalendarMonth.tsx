import type { DateStr } from '../data/types'
import { addDays, daysInMonthOf, formatMediumDate, monthStartOf, weekdayIndex } from '../engine/dates'
import { cx } from './cx'
import { Icon } from './icons'

export type CellStatus = 'done' | 'missed' | 'pending' | 'not_due' | 'inactive' | 'upcoming'

const INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** The mark for a status. Shape carries the meaning; colour only reinforces it. */
function Glyph({ status }: { status: CellStatus }) {
  if (status === 'done') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ok text-ground">
        <Icon name="check" size={12} className="stroke-[3.2]" />
      </span>
    )
  }
  if (status === 'missed') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full text-risk shadow-[inset_0_0_0_1.5px_var(--color-risk)]">
        <Icon name="close" size={11} className="stroke-[3]" />
      </span>
    )
  }
  if (status === 'pending') return <span className="h-5 w-5 rounded-full border-[1.5px] border-dashed border-ink-3" />
  if (status === 'not_due') {
    return (
      <span className="flex h-5 w-5 items-center justify-center">
        <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
      </span>
    )
  }
  return <span className="h-5 w-5" />
}

interface CalendarMonthProps {
  /** Any date inside the month to draw. */
  month: DateStr
  /** 0 = Monday … 6 = Sunday. */
  weekStart: number
  today: DateStr
  statusOf: (date: DateStr) => CellStatus
  selected?: DateStr | null
  onSelect?: (date: DateStr) => void
  /** Word for a done day: "Done" by default, "Held" for an abstaining habit. */
  doneLabel?: string
  missedLabel?: string
  /** A short word to show in place of the mark (a workout's name). */
  labelOf?: (date: DateStr) => string | undefined
}

/** One month as a grid of days, each showing what happened on it. */
export function CalendarMonth({ month, weekStart, today, statusOf, selected, onSelect, doneLabel = 'Done', missedLabel = 'Missed', labelOf }: CalendarMonthProps) {
  const first = monthStartOf(month)
  const lead = (weekdayIndex(first) - weekStart + 7) % 7
  const days = Array.from({ length: daysInMonthOf(month) }, (_, i) => addDays(first, i))
  const words: Record<CellStatus, string> = {
    done: doneLabel,
    missed: missedLabel,
    pending: 'Pending',
    not_due: 'Not due',
    inactive: 'Not tracked',
    upcoming: 'Upcoming',
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1" aria-hidden="true">
        {INITIALS.map((_, i) => (
          <span key={i} className="pb-1 text-center text-[11px] font-medium text-ink-3">
            {INITIALS[(i + weekStart) % 7]}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((date) => {
          const status = statusOf(date)
          const word = labelOf?.(date)
          const dim = status === 'inactive' || status === 'upcoming'
          const content = (
            <>
              <span className={cx('tnum text-[11px] leading-none', date === today ? 'font-semibold text-accent-ink' : dim ? 'text-ink-3/60' : 'text-ink-3')}>
                {Number(date.slice(8))}
              </span>
              {word ? <span className="flex h-5 max-w-full items-center truncate px-0.5 text-[9.5px] font-semibold text-ink">{word}</span> : <Glyph status={status} />}
            </>
          )
          const shared = cx(
            'flex h-12 flex-col items-center justify-center gap-1 rounded-control',
            date === selected && 'bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)]',
            date === today && date !== selected && 'shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
          )
          const label = `${formatMediumDate(date)}: ${word ?? words[status]}`
          return onSelect ? (
            <button key={date} type="button" aria-label={label} aria-pressed={date === selected} onClick={() => onSelect(date)} className={cx(shared, 'cursor-pointer hover:bg-surface-2')}>
              {content}
            </button>
          ) : (
            <div key={date} role="img" aria-label={label} className={shared}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CalendarLegend({ doneLabel = 'Done', missedLabel = 'Missed' }: { doneLabel?: string; missedLabel?: string }) {
  const items: [CellStatus, string][] = [
    ['done', doneLabel],
    ['missed', missedLabel],
    ['pending', 'Pending'],
    ['not_due', 'Not due'],
  ]
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map(([status, word]) => (
        <li key={status} className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <Glyph status={status} />
          {word}
        </li>
      ))}
    </ul>
  )
}
