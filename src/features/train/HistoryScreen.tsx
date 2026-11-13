import { useMemo } from 'react'
import { Link } from '../../app/router'
import { db } from '../../data/db'
import type { DateStr, Session, SetLog } from '../../data/types'
import { addDays, formatMediumDate, formatRange, formatShortDate, weekStartOf } from '../../engine/dates'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { BarChart } from '../../ui/Charts'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/icons'
import { MetricCard } from '../../ui/Metric'
import { Page } from '../../ui/Page'
import { CardioCard, TrainingCalendar } from './HistoryExtras'
import { useExercises } from './hooks'
import { TrainingInsights } from './TrainingInsights'
import { sessionSummary } from './TrainScreen'

const NONE: Session[] = []
const NO_SETS: SetLog[] = []

/** Every workout ever logged, week by week, with how many there were. */
export default function HistoryScreen() {
  const { today, weekStart } = useCore()
  const all = useLive(() => db.sessions.orderBy('date').toArray().then((rows) => rows.reverse()), [], NONE)
  const finished = useMemo(() => all.filter((session) => session.ended_at !== null), [all])
  const sets = useLive(() => db.set_logs.toArray(), [], NO_SETS)
  const { byId } = useExercises()

  const thisWeek = weekStartOf(today, weekStart)
  const weeks = useMemo(() => {
    const groups = new Map<DateStr, Session[]>()
    for (const session of finished) {
      const start = weekStartOf(session.date, weekStart)
      const list = groups.get(start)
      if (list) list.push(session)
      else groups.set(start, [session])
    }
    return [...groups.entries()]
  }, [finished, weekStart])

  const bars = useMemo(() => {
    const counts = new Map(weeks.map(([start, sessions]) => [start, new Set(sessions.map((s) => s.date)).size]))
    return Array.from({ length: 12 }, (_, i) => {
      const start = addDays(thisWeek, -7 * (11 - i))
      return { x: start, y: counts.get(start) ?? 0 }
    })
  }, [weeks, thisWeek])

  const monthPrefix = today.slice(0, 7)
  const daysThisWeek = new Set(finished.filter((s) => s.date >= thisWeek).map((s) => s.date)).size
  const daysThisMonth = new Set(finished.filter((s) => s.date.startsWith(monthPrefix)).map((s) => s.date)).size
  const weeksWithData = bars.filter((bar) => bar.y > 0).length

  return (
    <Page title="Training history" subtitle={`${finished.length} ${finished.length === 1 ? 'session' : 'sessions'} logged`} back="/train" width="default">
      {finished.length === 0 ? (
        <EmptyState icon="history" title="No sessions logged yet." body="A finished workout appears here." />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="This week" value={daysThisWeek} unit={daysThisWeek === 1 ? 'day' : 'days'} hint="days trained" />
            <MetricCard label="This month" value={daysThisMonth} unit={daysThisMonth === 1 ? 'day' : 'days'} hint="days trained" />
          </div>

          <Card>
            <h2 className="eyebrow">Days trained per week · last 12 weeks</h2>
            {weeksWithData >= 2 ? (
              <div className="mt-3">
                <BarChart bars={bars} yMax={7} xFormat={formatShortDate} label="Days trained in each of the last twelve weeks" />
              </div>
            ) : (
              <p className="mt-2 text-[13.5px] text-ink-3">Need more history. This appears once two weeks have a session in them.</p>
            )}
          </Card>

          <TrainingCalendar sessions={finished} />
          <CardioCard sets={sets} byId={byId} sessions={finished} />

          <TrainingInsights />

          {weeks.map(([start, sessions]) => (
            <section key={start} className="flex flex-col gap-2">
              <SectionTitle>
                {start === thisWeek ? 'This week' : formatRange(start, addDays(start, 6))} · {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
              </SectionTitle>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {sessions.map((session) => (
                  <Link
                    key={session.id}
                    to={`/train/session/${session.id}`}
                    className="flex min-h-[56px] items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] text-ink">{session.title}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                        {formatMediumDate(session.date)}
                        {sessionSummary(session) && ` · ${sessionSummary(session)}`}
                      </span>
                    </span>
                    {(session.kinds ?? []).map((kind) => (
                      <Chip key={kind} tone={kind === 'cardio' ? 'learning' : 'exercise'}>
                        {kind === 'cardio' ? 'Cardio' : 'Strength'}
                      </Chip>
                    ))}
                    <Icon name="chevron-right" size={17} className="shrink-0 text-ink-3" />
                  </Link>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </Page>
  )
}
