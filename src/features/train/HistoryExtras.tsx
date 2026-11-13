import { useMemo, useState } from 'react'
import { navigate } from '../../app/router'
import type { DateStr, Exercise, Session, SetLog } from '../../data/types'
import { addMonths, formatMonthTitle, formatShortDate, monthStartOf } from '../../engine/dates'
import { cardioWeeks } from '../../engine/history'
import { useCore } from '../../state/core'
import { IconButton } from '../../ui/Button'
import { CalendarMonth } from '../../ui/CalendarMonth'
import { Card } from '../../ui/Card'
import { BarChart } from '../../ui/Charts'

/** Cardio: this week's minutes and distance, and twelve weeks of minutes. */
export function CardioCard({ sets, byId, sessions }: { sets: readonly SetLog[]; byId: ReadonlyMap<number, Exercise>; sessions: readonly Session[] }) {
  const { today, weekStart } = useCore()
  const weeks = useMemo(() => cardioWeeks(sets, byId, sessions, today, weekStart, 12), [sets, byId, sessions, today, weekStart])
  if (!weeks.some((week) => week.minutes > 0 || week.km > 0)) return null
  const now = weeks[weeks.length - 1]
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="eyebrow">Cardio · minutes per week</h2>
      <p className="text-[13.5px] text-ink-2">
        This week: <span className="tnum font-semibold text-ink">{now.minutes} min</span>
        {now.km > 0 && (
          <>
            {' '}
            · <span className="tnum font-semibold text-ink">{now.km} km</span>
          </>
        )}
      </p>
      <BarChart bars={weeks.map((week) => ({ x: week.x, y: week.minutes }))} xFormat={formatShortDate} label="Minutes of cardio in each of the last twelve weeks" />
    </Card>
  )
}

/** A month of training days. A day with a session carries the first word of its name. */
export function TrainingCalendar({ sessions }: { sessions: readonly Session[] }) {
  const { today, weekStart } = useCore()
  const [month, setMonth] = useState<DateStr>(monthStartOf(today))
  const byDate = useMemo(() => {
    const map = new Map<DateStr, Session>()
    for (const session of sessions) {
      if (session.ended_at === null || !(session.kinds?.length ?? 0)) continue
      if (!map.has(session.date)) map.set(session.date, session)
    }
    return map
  }, [sessions])
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <h2 className="eyebrow min-w-0 flex-1 truncate">{formatMonthTitle(month)}</h2>
        <IconButton icon="chevron-left" label="Month before" onClick={() => setMonth(addMonths(month, -1))} />
        <IconButton icon="chevron-right" label="Month after" disabled={month >= monthStartOf(today)} onClick={() => setMonth(addMonths(month, 1))} />
      </div>
      <CalendarMonth
        month={month}
        weekStart={weekStart}
        today={today}
        statusOf={(date) => (byDate.has(date) ? 'done' : date > today ? 'upcoming' : 'not_due')}
        labelOf={(date) => byDate.get(date)?.title.split(/[\s+]/)[0]}
        doneLabel="Trained"
        onSelect={(date) => {
          const session = byDate.get(date)
          if (session) navigate(`/train/session/${session.id}`)
        }}
      />
      <p className="text-[12px] text-ink-3">A day with a session shows the first word of its name. Tap it to open the session.</p>
    </Card>
  )
}
