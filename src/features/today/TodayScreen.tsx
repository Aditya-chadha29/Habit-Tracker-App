import { useMemo } from 'react'
import { useQueryState } from '../../app/router'
import { DayNav } from '../../components/DayNav'
import { HabitGroup, NoteRow } from '../../components/HabitGroup'
import { HabitRow } from '../../components/HabitRow'
import { MealRow } from '../../components/MealRow'
import { setManyDone } from '../../data/habitRepo'
import type { DateStr } from '../../data/types'
import { clockHHMM, isValidDateStr } from '../../engine/dates'
import { describeTarget } from '../../engine/describe'
import { firstEditableDate } from '../../engine/lock'
import { periodOf } from '../../engine/periods'
import { dayScore, percent } from '../../engine/score'
import { targetProgress } from '../../engine/targets'
import { useCore } from '../../state/core'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Page } from '../../ui/Page'
import { ProgressBar } from '../../ui/Progress'
import { Segmented } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'
import { buildDayView, type DaySection } from './sections'
import { useDayRoutines } from './useDayRoutines'

const PARTS = [
  { id: 'all', label: 'All' },
  { id: 'morning', label: 'Morning' },
  { id: 'day', label: 'Day' },
  { id: 'evening', label: 'Evening' },
] as const

type PartId = (typeof PARTS)[number]['id']

/**
 * Today answers "what happened today?" and is built for doing: every habit due today, grouped
 * into the day's routines and pillars, each one tap away from done. Meals are logged in place.
 * It can step back through the days that are still open to correction.
 */
export default function TodayScreen() {
  const { today, settings, weekStart, areas, habits, index, write } = useCore()
  const routines = useDayRoutines()
  const toast = useToast()
  const [rawDate, setDate] = useQueryState('d', today)
  const [rawPart, setPart] = useQueryState('part', 'all')

  const first = firstEditableDate(today, settings.edit_window_days)
  const date: DateStr = isValidDateStr(rawDate) && rawDate >= first && rawDate <= today ? rawDate : today
  const part: PartId = PARTS.some((p) => p.id === rawPart) ? (rawPart as PartId) : 'all'
  const isToday = date === today

  const score = useMemo(() => dayScore(habits, date, index), [habits, date, index])
  const view = useMemo(() => buildDayView(habits, routines, areas, date, index), [habits, routines, areas, date, index])
  const week = useMemo(() => periodOf('week', date, weekStart), [date, weekStart])
  const sections = part === 'all' ? view.sections : view.sections.filter((section) => section.part === part)
  const showFlexible = (part === 'all' || part === 'day') && view.flexible.length > 0
  const pct = percent(score)

  const completeSection = async (section: DaySection) => {
    try {
      const changed = await setManyDone(section.openTickable, date, true, write, isToday ? clockHHMM(new Date()) : null)
      if (!changed.length) return
      toast.show(`${section.title}: ${changed.length} marked done.`, {
        action: { label: 'Undo', onClick: () => void setManyDone(changed, date, false, write) },
      })
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })
    }
  }

  return (
    <Page
      title="Today"
      subtitle={isToday ? 'Everything due today' : 'A day that can still be corrected'}
      back="/"
      tabs={<Segmented options={PARTS} value={part} onChange={setPart} label="Part of the day" block />}
    >
      <div className="flex flex-col gap-5">
        <DayNav date={date} onChange={setDate} />

        <Card>
          <div className="flex items-baseline gap-2">
            <span className="tnum text-[32px] leading-none font-semibold tracking-tight text-ink">
              {score.done} <span className="text-ink-3">/</span> {score.due}
            </span>
            <span className="text-[13px] text-ink-3">{isToday ? 'so far' : 'recorded'}</span>
            {pct !== null && <span className="tnum ml-auto text-[14px] font-medium text-ink-2">{pct}%</span>}
          </div>
          <ProgressBar value={score.done} max={Math.max(1, score.due)} tone="accent" label={`${score.done} of ${score.due} done`} className="mt-3" />
        </Card>

        {sections.length === 0 && !showFlexible && (
          <EmptyState
            icon="check"
            title={part === 'all' ? 'Nothing is due on this day.' : 'Nothing in this part of the day.'}
            body={part === 'all' ? 'Habits are added and scheduled in Habits.' : undefined}
          />
        )}

        <div className="flex flex-col gap-5 lg:block lg:columns-2 lg:gap-6 [&>*]:lg:mb-6 [&>*]:lg:break-inside-avoid">
          {sections.map((section) => (
            <HabitGroup
              key={section.key}
              title={section.title}
              tally={section.tally}
              action={
                section.routineId !== null && section.openTickable.length > 1 ? (
                  <Button variant="ghost" size="sm" onClick={() => completeSection(section)}>
                    Mark all done
                  </Button>
                ) : undefined
              }
            >
              {section.rows.map((row) =>
                row.type === 'note' ? (
                  <NoteRow key={row.key} label={row.label} lead={row.lead} hint={row.hint} />
                ) : row.item.habit.kind === 'meal' ? (
                  <MealRow key={row.item.habit.id} habit={row.item.habit} date={date} lead={row.lead} />
                ) : (
                  <HabitRow key={row.item.habit.id} habit={row.item.habit} date={date} lead={row.lead} hint={row.hint} />
                ),
              )}
            </HabitGroup>
          ))}

          {showFlexible && (
            <HabitGroup title="No particular day" note="Done when you choose. These are judged by the week or month, never by the day.">
              {view.flexible.map((item) => {
                const progress = targetProgress(item.habit, item.version.target?.per === 'month' ? periodOf('month', date, weekStart) : week, today, index)
                return (
                  <HabitRow
                    key={item.habit.id}
                    habit={item.habit}
                    date={date}
                    quiet
                    sub={
                      progress
                        ? `${progress.done} of ${progress.target} this ${progress.period.per} · ${describeTarget(progress)}`
                        : 'As needed'
                    }
                  />
                )
              })}
            </HabitGroup>
          )}
        </div>
      </div>
    </Page>
  )
}
