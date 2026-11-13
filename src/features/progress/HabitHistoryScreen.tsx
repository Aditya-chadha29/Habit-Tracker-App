import { useMemo, useState } from 'react'
import { Link, useQueryState, type RouteProps } from '../../app/router'
import { db } from '../../data/db'
import { toggleHabit } from '../../data/habitRepo'
import type { DateStr, Habit, HabitVersion } from '../../data/types'
import { completedBy } from '../../engine/completion'
import { addDays, addMonths, clockHHMM, formatFullDate, formatMediumDate, formatMonthTitle, formatShortDate, WEEKDAY_SHORT, weekdayIndex, weekStartOf } from '../../engine/dates'
import { describeAmount, describeFrequency, describeSource } from '../../engine/describe'
import { rangeEnding } from '../../engine/insights'
import { isEditable } from '../../engine/lock'
import type { Period } from '../../engine/periods'
import { dayStatus, statusLabel } from '../../engine/status'
import { consistency, isPeriodJudged, streakOf, weekdayRates } from '../../engine/streaks'
import { targetProgress } from '../../engine/targets'
import { currentVersion, isDueOn, isRetired, nameOn, versionOn } from '../../engine/timeline'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'
import { Button, IconButton } from '../../ui/Button'
import { CalendarLegend, CalendarMonth } from '../../ui/CalendarMonth'
import { Card, SectionTitle } from '../../ui/Card'
import { BarChart } from '../../ui/Charts'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/icons'
import { MetricCard } from '../../ui/Metric'
import { Page } from '../../ui/Page'
import { ProgressBar } from '../../ui/Progress'
import { useToast } from '../../ui/Toast'

const NEED = 'Need more history'

/** What changed between two chapters of a habit, in words. */
function describeChange(previous: HabitVersion | null, next: HabitVersion, areaLabel: (id: string) => string): string {
  if (!previous) return `Started · ${describeFrequency(next)}${next.target && next.day.kind !== 'flexible' ? ` · target ${next.target.count} per ${next.target.per}` : ''}`
  const parts: string[] = []
  if (previous.active && !next.active) parts.push('Retired')
  if (!previous.active && next.active) parts.push('Restored')
  if (previous.name !== next.name) parts.push(`Renamed to ${next.name}`)
  if (JSON.stringify(previous.day) !== JSON.stringify(next.day) || JSON.stringify(previous.target) !== JSON.stringify(next.target)) {
    parts.push(`Now ${describeFrequency(next).toLowerCase()}${next.target && next.day.kind !== 'flexible' ? `, target ${next.target.count} per ${next.target.per}` : ''}`)
  }
  if (previous.area !== next.area) parts.push(`Moved to ${areaLabel(next.area)}`)
  if (previous.group !== next.group && next.group) parts.push(`Group: ${next.group}`)
  if (previous.sources.join() !== next.sources.join()) parts.push(`Completed by: ${next.sources.map((source) => describeSource(source).toLowerCase()).join(', ')}`)
  return parts.join(' · ') || 'Details changed'
}

function DayPanel({ habit, date }: { habit: Habit; date: DateStr }) {
  const { today, index, settings, write } = useCore()
  const toast = useToast()
  const { data: entry } = useKeyedLiveQuery(`${habit.id}|${date}`, async () => (await db.entries.where('[habit_id+date]').equals([habit.id!, date]).first()) ?? null)
  const status = dayStatus(habit, date, today, index)
  const version = versionOn(habit, date)
  const via = completedBy(habit, date, index)
  const editable = isEditable(date, today, settings.edit_window_days)
  const tickable = !!version?.active && version.sources.includes('manual')
  const done = via !== null

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold text-ink">{formatFullDate(date)}</h3>
        <span className={done ? 'text-[13px] font-medium text-ok' : status === 'missed' ? 'text-[13px] font-medium text-risk' : 'text-[13px] font-medium text-ink-3'}>
          {statusLabel(status, habit.polarity)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        {[
          ['Called', nameOn(habit, date)],
          ['Scheduled', version && version.active ? describeFrequency(version) : 'Not tracked that day'],
          ['Completed', via ? describeSource(via) : ''],
          ['Amount', entry && typeof entry.value === 'number' ? `${entry.value} ${habit.measure.unit}`.trim() : ''],
          ['Time', entry?.time ?? ''],
          ['Note', entry?.note ?? ''],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-3">{label}</dt>
              <dd className="text-ink">{value}</dd>
            </div>
          ))}
      </dl>
      {date > today ? null : !editable ? (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <Icon name="lock" size={13} />
          Older than {settings.edit_window_days} days: this day is part of the record and cannot be changed.
        </p>
      ) : !tickable ? (
        <p className="text-[12.5px] text-ink-3">{version?.active ? 'This habit is completed by logging a session, not by ticking it.' : 'The habit was not being tracked on this day.'}</p>
      ) : done && via !== 'manual' ? (
        <p className="text-[12.5px] text-ink-3">Completed by a logged session.</p>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            toggleHabit(habit.id!, date, write, { time: date === today ? clockHHMM(new Date()) : null }).catch((error: unknown) =>
              toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' }),
            )
          }
        >
          {done ? 'Mark as not done' : 'Mark as done'}
        </Button>
      )}
    </Card>
  )
}

/**
 * One habit's whole history: its streak and consistency, a calendar of every day, the last
 * twelve weeks, how each weekday compares, and the dated changes made to it along the way.
 */
export default function HabitHistoryScreen({ params }: RouteProps) {
  const habitId = Number(params.id)
  const { today, weekStart, areas, habits, index } = useCore()
  const habit = habits.find((candidate) => candidate.id === habitId)
  const [rawMonth, setMonth] = useQueryState('m', today.slice(0, 7))
  const [selected, setSelected] = useState<DateStr | null>(null)
  const month: DateStr = /^\d{4}-\d{2}$/.test(rawMonth) && rawMonth <= today.slice(0, 7) ? `${rawMonth}-01` : `${today.slice(0, 7)}-01`

  const weeks = useMemo(() => {
    if (!habit) return []
    const current = weekStartOf(today, weekStart)
    return Array.from({ length: 12 }, (_, i) => {
      const start = addDays(current, -7 * (11 - i))
      const period: Period = { per: 'week', start, end: addDays(start, 6) }
      const progress = targetProgress(habit, period, today, index)
      if (progress && progress.flexible) return { x: start, y: progress.done, met: progress.state === 'met', judged: progress.state === 'met' || progress.state === 'missed' }
      let done = 0
      for (let date = start; date <= period.end && date <= today; date = addDays(date, 1)) {
        if (isDueOn(habit, date) && completedBy(habit, date, index) !== null) done += 1
      }
      return { x: start, y: done, met: false, judged: false }
    })
  }, [habit, today, weekStart, index])

  if (!habit) {
    return (
      <Page title="Habit" back="/progress">
        <EmptyState title="That habit does not exist." />
      </Page>
    )
  }

  const byPeriod = isPeriodJudged(habit, today)
  const streak = streakOf(habit, today, index, weekStart)
  const thirty = rangeEnding(today, 30)
  const ninety = rangeEnding(today, 90)
  const c30 = consistency(habit, thirty.from, thirty.to, today, index)
  const c90 = consistency(habit, ninety.from, ninety.to, today, index)
  const rate = (c: { rate: number | null; due: number }) => (c.rate !== null && c.due >= 7 ? `${Math.round(c.rate * 100)}` : null)
  const judgedWeeks = weeks.filter((week) => week.judged)
  const metWeeks = judgedWeeks.filter((week) => week.met).length
  const rates = weekdayRates(habit, habit.created_on, today, today, index, weekdayIndex)
  const current = currentVersion(habit)
  const areaLabel = (id: string) => areas.find((area) => area.id === id)?.label ?? id
  const amount = describeAmount(habit)
  const doneLabel = habit.polarity === 'abstain' ? 'Held' : 'Done'
  const missedLabel = habit.polarity === 'abstain' ? 'Broken' : 'Missed'
  const thisMonth = `${today.slice(0, 7)}-01`

  return (
    <Page
      title={habit.name}
      subtitle={[describeFrequency(current), amount, isRetired(habit) ? `retired ${formatShortDate(current.from)}` : ''].filter(Boolean).join(' · ')}
      back="/progress"
      width="wide"
      actions={
        <Link to={`/habits/${habit.id}`} className="inline-flex h-9 items-center rounded-control px-3 text-[13px] font-medium text-cream underline underline-offset-2 hover:bg-surface-2">
          Edit
        </Link>
      }
    >
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Current streak" value={streak.current} unit={streak.unit} />
            <MetricCard label="Longest streak" value={streak.longest} unit={streak.unit} />
            {byPeriod ? (
              <MetricCard
                label="Weeks at target · last 12"
                value={judgedWeeks.length ? `${metWeeks} / ${judgedWeeks.length}` : '—'}
                hint={judgedWeeks.length ? undefined : NEED}
                className="col-span-2"
              />
            ) : (
              <>
                <MetricCard label="30-day consistency" value={rate(c30) ?? '—'} unit={rate(c30) ? '%' : undefined} hint={rate(c30) ? `${c30.done} of ${c30.due}` : NEED} />
                <MetricCard label="90-day consistency" value={rate(c90) ?? '—'} unit={rate(c90) ? '%' : undefined} hint={rate(c90) ? `${c90.done} of ${c90.due}` : NEED} />
              </>
            )}
          </div>

          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-1">
              <IconButton icon="chevron-left" label="Previous month" onClick={() => setMonth(addMonths(month, -1).slice(0, 7))} />
              <h2 className="min-w-0 flex-1 text-center text-[15px] font-semibold text-ink">{formatMonthTitle(month)}</h2>
              <IconButton icon="chevron-right" label="Next month" disabled={month >= thisMonth} onClick={() => setMonth(addMonths(month, 1).slice(0, 7))} />
            </div>
            <CalendarMonth
              month={month}
              weekStart={weekStart}
              today={today}
              statusOf={(date) => dayStatus(habit, date, today, index)}
              selected={selected}
              onSelect={setSelected}
              doneLabel={doneLabel}
              missedLabel={missedLabel}
            />
            <CalendarLegend doneLabel={doneLabel} missedLabel={missedLabel} />
          </Card>
          {selected ? <DayPanel habit={habit} date={selected} /> : <p className="px-1 text-[12.5px] text-ink-3">Tap a day to see what happened on it.</p>}
        </div>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <Card>
            <h2 className="eyebrow">{byPeriod ? 'Times done per week' : 'Due days done per week'} · last 12 weeks</h2>
            {weeks.filter((week) => week.y > 0).length >= 2 ? (
              <div className="mt-3">
                <BarChart
                  bars={weeks.map((week) => ({ x: week.x, y: week.y, tone: week.judged ? (week.met ? ('ok' as const) : ('risk' as const)) : ('accent' as const) }))}
                  xFormat={formatShortDate}
                  height={150}
                  label={`${habit.name}: times done in each of the last twelve weeks`}
                />
              </div>
            ) : (
              <p className="mt-2 text-[13.5px] text-ink-3">{NEED}.</p>
            )}
          </Card>

          {!byPeriod && rates.some((entry) => entry.due >= 2) && (
            <section className="flex flex-col gap-2">
              <SectionTitle>By weekday · all time</SectionTitle>
              <Card className="flex flex-col gap-2.5">
                {rates.map((entry, weekday) =>
                  entry.due === 0 ? null : (
                    <div key={weekday} className="flex items-center gap-3">
                      <span className="w-9 shrink-0 text-[12.5px] text-ink-3">{WEEKDAY_SHORT[weekday]}</span>
                      <ProgressBar value={entry.done} max={entry.due} label={`${WEEKDAY_SHORT[weekday]}: ${entry.done} of ${entry.due}`} className="flex-1" />
                      <span className="tnum w-20 shrink-0 text-right text-[12.5px] text-ink-2">
                        {entry.due >= 2 ? `${Math.round((entry.rate ?? 0) * 100)}%` : '—'} <span className="text-ink-3">· {entry.done}/{entry.due}</span>
                      </span>
                    </div>
                  ),
                )}
              </Card>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <SectionTitle>Changes</SectionTitle>
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {habit.versions
                .map((version, i) => ({ version, previous: i > 0 ? habit.versions[i - 1] : null }))
                .reverse()
                .map(({ version, previous }) => (
                  <div key={version.from} className="px-4 py-2.5">
                    <p className="text-[12.5px] text-ink-3">{formatMediumDate(version.from)} {version.from.slice(0, 4)}</p>
                    <p className="mt-0.5 text-[14px] text-ink">{describeChange(previous, version, areaLabel)}</p>
                  </div>
                ))}
            </Card>
            <p className="px-1 text-[12.5px] text-ink-3">Each change applies from its date. Earlier days keep the record they had.</p>
          </section>
        </div>
      </div>
    </Page>
  )
}
