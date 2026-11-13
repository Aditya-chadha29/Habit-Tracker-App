import { useMemo, useState } from 'react'
import { useQueryState } from '../../app/router'
import { DayNav } from '../../components/DayNav'
import { HabitGroup, NoteRow } from '../../components/HabitGroup'
import { HabitRow } from '../../components/HabitRow'
import { MealRow } from '../../components/MealRow'
import { setDayMark } from '../../data/dayRepo'
import { setManyDone } from '../../data/habitRepo'
import type { DateStr, DayMarkKind } from '../../data/types'
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
import { Modal } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { ProgressBar } from '../../ui/Progress'
import { useToast } from '../../ui/Toast'
import { buildDayView, type DaySection } from './sections'



/**
 * Today answers "what happened today?" and is built for doing: every habit due today, grouped
 * by pillar, each one tap away from done. Meals are logged in place.
 * It can step back through the days that are still open to correction.
 */
/** The day-routine system was removed at the user's request on 2026-10-08; Today is grouped by
 *  pillar and group only. */
const NO_ROUTINES: never[] = []

const DAY_OFF: { kind: DayMarkKind; label: string; body: string }[] = [
  { kind: 'rest', label: 'Rest', body: 'A planned day of rest.' },
  { kind: 'travel', label: 'Travel', body: 'Away from the usual routine.' },
  { kind: 'sick', label: 'Sick', body: 'Unwell.' },
]

export default function TodayScreen() {
  const { today, settings, weekStart, areas, habits, index, write, dayMarks } = useCore()
  const [choosingOff, setChoosingOff] = useState(false)
  const toast = useToast()
  const [rawDate, setDate] = useQueryState('d', today)

  const first = firstEditableDate(today, settings.edit_window_days)
  const date: DateStr = isValidDateStr(rawDate) && rawDate >= first && rawDate <= today ? rawDate : today
  const isToday = date === today

  const score = useMemo(() => dayScore(habits, date, index), [habits, date, index])
  const view = useMemo(() => buildDayView(habits, NO_ROUTINES, areas, date, index, true), [habits, areas, date, index])
  const week = useMemo(() => periodOf('week', date, weekStart), [date, weekStart])
  const sections = view.sections
  const showFlexible = view.flexible.length > 0
  const pct = percent(score)
  const off = dayMarks.get(date) ?? null
  const markOff = (kind: DayMarkKind | null) => {
    setChoosingOff(false)
    setDayMark(date, kind, write).catch((error: unknown) => toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' }))
  }

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
    >
      <div className="flex flex-col gap-5">
        <DayNav date={date} onChange={setDate} />

        {off ? (
          <Card className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-ink">Day off: {off}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Nothing is due, so nothing can be missed. Ticks still save but are not counted.</p>
            </div>
            <Button variant="secondary" onClick={() => setChoosingOff(true)}>
              Change
            </Button>
          </Card>
        ) : (
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
        )}

        {score.due > 0 && (
          <div className="flex min-h-11 items-center justify-between gap-3 px-1">
            <p className="text-[13.5px] text-ink-2">{score.due - score.done > 0 ? `${score.due - score.done} left` : isToday ? 'All done for today' : 'All done on this day'}</p>
            <button type="button" onClick={() => setChoosingOff(true)} className="min-h-11 cursor-pointer text-[13px] text-ink-2 underline underline-offset-2">
              Day off
            </button>
          </div>
        )}

        {sections.length === 0 && !showFlexible && (
          <EmptyState
            icon="check"
            title="Nothing is due on this day."
            body="Habits are added and scheduled in Habits."
          />
        )}

        <div className="flex flex-col gap-5 lg:block lg:columns-2 lg:gap-6 [&>*]:lg:mb-6 [&>*]:lg:break-inside-avoid">
          {sections.map((section) => (
            <HabitGroup
              key={section.key}
              title={section.title}
              tally={off ? undefined : section.tally}
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

      <Modal open={choosingOff} onClose={() => setChoosingOff(false)} title="Day off" size="sm">
        <div className="flex flex-col gap-2">
          <p className="pb-1 text-[13.5px] leading-relaxed text-ink-2">On a day off nothing is due, so the day is left out of every score. Weekly targets are unchanged.</p>
          {DAY_OFF.map((option) => (
            <button
              key={option.kind}
              type="button"
              aria-pressed={off === option.kind}
              onClick={() => markOff(option.kind)}
              className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-control bg-surface-2 px-4 text-left shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-surface-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium text-ink">{option.label}</span>
                <span className="block text-[12.5px] text-ink-3">{option.body}</span>
              </span>
              {off === option.kind && <span className="text-[12.5px] font-medium text-ink-2">Chosen</span>}
            </button>
          ))}
          {off && (
            <Button variant="ghost" onClick={() => markOff(null)}>
              Not a day off
            </Button>
          )}
        </div>
      </Modal>
    </Page>
  )
}
