import { useMemo } from 'react'
import { db } from '../../data/db'
import type { DateStr, Exercise, Meal, MuscleGroup, Session, SetLog, WeightEntry } from '../../data/types'
import { weekReport, type ReportRow } from '../../engine/weekReport'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { MUSCLE_LABEL } from '../train/labels'

const NO_SETS: SetLog[] = []
const NO_SESSIONS: Session[] = []
const NO_EXERCISES: Exercise[] = []
const NO_MEALS: Meal[] = []
const NO_WEIGHTS: WeightEntry[] = []
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
  const { today, habits, index, settings } = useCore()
  const sets = useLive(() => db.set_logs.toArray(), [], NO_SETS)
  const sessions = useLive(() => db.sessions.toArray(), [], NO_SESSIONS)
  const exercises = useLive(() => db.exercises.toArray(), [], NO_EXERCISES)
  const meals = useLive(() => db.meals.toArray(), [], NO_MEALS)
  const weights = useLive(() => db.weight_entries.toArray(), [], NO_WEIGHTS)
  const report = useMemo(
    () =>
      weekReport({
        start, today, habits, index, sessions, sets, meals, weights,
        exercisesById: new Map(exercises.map((exercise) => [exercise.id!, exercise])),
        muscleNames: MUSCLES,
        unit: settings.weight_unit,
      }),
    [start, today, habits, index, sessions, sets, meals, weights, exercises, settings.weight_unit],
  )
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Gym and diet</SectionTitle>
      <Card className="flex flex-col gap-4">
        <Rows title="Gym" rows={report.gym} />
        {report.newBests.length > 0 && <p className="text-[13px] leading-relaxed text-ink-2">New bests: {report.newBests.join(', ')}.</p>}
        <p className="text-[13px] leading-relaxed text-ink-2">
          {report.untrained.length ? `No sets: ${report.untrained.map((muscle) => MUSCLE_LABEL[muscle as MuscleGroup]).join(', ')}.` : 'Every muscle group has sets.'}
        </p>
        <Rows title="Diet" rows={report.diet} />
      </Card>
    </section>
  )
}
