import type { DateStr } from '../data/types'
import { formatMediumDate, weekdayIndex } from '../engine/dates'
import { cx } from './cx'

const INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface WeekStripProps {
  days: { date: DateStr; done: number; due: number; counted: boolean }[]
  today: DateStr
  selected?: DateStr
  onSelect?: (date: DateStr) => void
}

/** A week as seven small columns: how much of each day was done. Days still to come are blank. */
export function WeekStrip({ days, today, selected, onSelect }: WeekStripProps) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((day) => {
        const fraction = day.counted && day.due > 0 ? day.done / day.due : 0
        const label = day.counted
          ? `${formatMediumDate(day.date)}: ${day.due ? `${day.done} of ${day.due}` : 'nothing due'}`
          : `${formatMediumDate(day.date)}: not yet`
        const content = (
          <>
            <span className={cx('text-[11px] font-medium', day.date === today ? 'text-accent-ink' : 'text-ink-3')}>{INITIALS[weekdayIndex(day.date)]}</span>
            <span className="flex h-10 w-2.5 items-end overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
              <span className={cx('w-full rounded-full', fraction >= 1 ? 'bg-ok' : 'bg-accent')} style={{ height: `${Math.max(fraction * 100, day.counted && day.done > 0 ? 8 : 0)}%` }} />
            </span>
            <span className={cx('tnum text-[10.5px]', day.counted ? 'text-ink-2' : 'text-ink-3/60')}>
              {day.counted ? (day.due ? `${day.done}/${day.due}` : '—') : '·'}
            </span>
          </>
        )
        const shared = cx(
          'flex flex-col items-center gap-1 rounded-control py-1.5',
          day.date === selected && 'bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)]',
        )
        return onSelect ? (
          <button key={day.date} type="button" aria-label={label} aria-pressed={day.date === selected} disabled={!day.counted} onClick={() => onSelect(day.date)} className={cx(shared, 'cursor-pointer hover:bg-surface-2 disabled:cursor-default')}>
            {content}
          </button>
        ) : (
          <div key={day.date} role="img" aria-label={label} className={shared}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
