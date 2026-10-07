import type { DateStr } from '../data/types'
import { addDays, formatDayTitle, relativeDayLabel } from '../engine/dates'
import { firstEditableDate } from '../engine/lock'
import { useCore } from '../state/core'
import { IconButton } from '../ui/Button'

interface DayNavProps {
  date: DateStr
  onChange: (date: DateStr) => void
}

/**
 * Steps between the days that can still be corrected. It stops at the edge of the correction
 * window on purpose: older days are the record, and are read in Progress and Review.
 */
export function DayNav({ date, onChange }: DayNavProps) {
  const { today, settings } = useCore()
  const first = firstEditableDate(today, settings.edit_window_days)
  const atStart = date <= first
  const atEnd = date >= today
  return (
    <div className="flex items-center gap-1">
      <IconButton icon="chevron-left" label="Previous day" disabled={atStart} onClick={() => onChange(addDays(date, -1))} />
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-[15px] font-semibold text-ink">{formatDayTitle(date)}</p>
        <p className="text-[12px] text-ink-3">
          {relativeDayLabel(date, today)}
          {atStart && !atEnd ? ' · earliest day that can be changed' : ''}
        </p>
      </div>
      <IconButton icon="chevron-right" label="Next day" disabled={atEnd} onClick={() => onChange(addDays(date, 1))} />
    </div>
  )
}
