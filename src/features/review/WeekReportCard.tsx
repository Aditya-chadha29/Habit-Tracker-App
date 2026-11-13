import { useMemo, useState } from 'react'
import { Link } from '../../app/router'
import { REASON_LABEL } from '../../components/MissReason'
import { db } from '../../data/db'
import type { DateStr, Entry, Exercise, Meal, MuscleGroup, Session, SetLog, WeightEntry } from '../../data/types'
import { addDays, weekStartOf } from '../../engine/dates'
import { formatRange, minDate } from '../../engine/dates'
import { consistency } from '../../engine/streaks'
import { currentVersion } from '../../engine/timeline'
import { weekReport, weekSummaryText, type ReportRow } from '../../engine/weekReport'
import { Button } from '../../ui/Button'
import { useToast } from '../../ui/Toast'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { MUSCLE_LABEL } from '../train/labels'

const NO_SETS: SetLog[] = []
const NO_SESSIONS: Session[] = []
const NO_EXERCISES: Exercise[] = []
const NO_MEALS: Meal[] = []
const NO_WEIGHTS: WeightEntry[] = []
const NO_ENTRIES: Entry[] = []
const MUSCLES: MuscleGroup[] = ['chest', 'back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'core']

function Rows({ title, rows }: { title: string; rows: ReportRow[] }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-3">
        <h3 className="eyebrow min-w-0 flex-1">{title}</h3>
        <span className="w-[72px] text-right text-[11.5px] text-ink-3">This week</span>
        <span className="w-[72px] text-right text-[11.5px] text-ink-3">Week before</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="flex min-h-7 items-baseline gap-3 text-[13.5px]">
          <span className="min-w-0 flex-1 truncate text-ink-2">{row.label}</span>
          <span className="tnum w-[72px] text-right font-medium text-ink">{row.value}</span>
          <span className="tnum w-[72px] text-right text-ink-3">{row.before}</span>
        </div>
      ))}
    </div>
  )
}

/** The week's gym and diet in plain figures, beside the week before. Worked out on this device. */
export function WeekReportCard({ start }: { start: DateStr }) {
  const { today, habits, index, settings, weekStart } = useCore()
  const sets = useLive(() => db.set_logs.toArray(), [], NO_SETS)
  const sessions = useLive(() => db.sessions.toArray(), [], NO_SESSIONS)
  const exercises = useLive(() => db.exercises.toArray(), [], NO_EXERCISES)
  const meals = useLive(() => db.meals.toArray(), [], NO_MEALS)
  const weights = useLive(() => db.weight_entries.toArray(), [], NO_WEIGHTS)
  // Only the ticks that carry a reason: a few rows, read without a cursor.
  const reasoned = useLive(async () => (await db.entries.where('date').between(start, addDays(start, 6), true, true).toArray()).filter((entry) => entry.reason), [start], NO_ENTRIES)
  const toast = useToast()
  const [manual, setManual] = useState<string | null>(null)
  const isThisWeek = start === weekStartOf(today, weekStart)
  const weighedThisWeek = weights.some((row) => row.date >= start && row.date <= addDays(start, 6))
  const report = useMemo(
    () =>
      weekReport({
        start, today, habits, index, sessions, sets, meals, weights, entries: reasoned,
        exercisesById: new Map(exercises.map((exercise) => [exercise.id!, exercise])),
        muscleNames: MUSCLES,
        unit: settings.weight_unit,
      }),
    [start, today, habits, index, sessions, sets, meals, weights, exercises, settings.weight_unit, reasoned],
  )
  const copy = () => {
    const end = minDate(addDays(start, 6), today)
    const rows = habits
      .map((habit) => ({ name: currentVersion(habit).name, ...consistency(habit, start, end, today, index) }))
      .filter((row) => row.due > 0)
    const text = weekSummaryText(`Week of ${formatRange(start, addDays(start, 6))}`, report, rows)
    const fallback = () => setManual(text)
    if (!navigator.clipboard?.writeText) return fallback()
    navigator.clipboard.writeText(text).then(() => toast.show('Summary copied.', { tone: 'ok' }), fallback)
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Gym and diet</SectionTitle>
      <Card className="flex flex-col gap-4">
        <Rows title="Gym" rows={report.gym} />
        {report.newBests.length > 0 && <p className="text-[13px] leading-relaxed text-ink-2">New bests: {report.newBests.join(', ')}.</p>}
        <p className="text-[13px] leading-relaxed text-ink-2">
          {report.untrained.length ? `No sets: ${report.untrained.map((muscle) => MUSCLE_LABEL[muscle as MuscleGroup]).join(', ')}.` : 'Every muscle group has sets.'}
        </p>
{isThisWeek && !weighedThisWeek && (
          <p className="text-[13px] leading-relaxed text-ink-2">
            No weight logged this week.{' '}
            <Link to="/progress/weight" className="inline-flex min-h-11 items-center font-medium text-cream underline underline-offset-2">
              Log weight
            </Link>
          </p>
        )}
        <Rows title="Diet" rows={report.diet} />
        {report.reasons.length > 0 && (
          <p className="text-[13px] leading-relaxed text-ink-2">
            Misses with a reason: {report.reasons.map((row) => `${REASON_LABEL[row.reason].toLowerCase()} ${row.count}`).join(', ')}.
          </p>
        )}
        <Button variant="secondary" icon="copy" onClick={copy} className="self-start">
          Copy summary
        </Button>
        {manual !== null && (
          <label className="flex flex-col gap-1.5 text-[12.5px] text-ink-3">
            Copying was not allowed here. Select the text and copy it by hand.
            <textarea readOnly value={manual} rows={8} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-control bg-surface-2 p-3 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]" />
          </label>
        )}
      </Card>
    </section>
  )
}
