import { useMemo, useState } from 'react'
import Model, { type IExerciseData, type Muscle } from 'react-body-highlighter'
import { db } from '../../data/db'
import type { Exercise, MuscleGroup, SetLog } from '../../data/types'
import { addDays, formatShortDate, relativeDayLabel, weekStartOf } from '../../engine/dates'
import { muscleWeek, type MuscleWeekRow } from '../../engine/history'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { IconButton } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { cx } from '../../ui/cx'
import { MUSCLE_LABEL } from './labels'

const NO_SETS: SetLog[] = []
const NO_EXERCISES: Exercise[] = []

/** Our muscle groups on the drawing's muscles. */
const ON_BODY: Record<Exclude<MuscleGroup, 'cardio'>, Muscle[]> = {
  chest: ['chest'],
  back: ['upper-back', 'lower-back'],
  traps: ['trapezius'],
  shoulders: ['front-deltoids', 'back-deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  calves: ['calves'],
  core: ['abs', 'obliques'],
}
const GROUPS = Object.keys(ON_BODY) as (keyof typeof ON_BODY)[]
/** How many muscles the list shows before "Show all". */
const SHOWN = 6

/** The three strengths of shading. The set count is always printed too. */
const SHADES = [
  'color-mix(in srgb, var(--color-accent) 35%, var(--color-surface-3))',
  'color-mix(in srgb, var(--color-accent) 65%, var(--color-surface-3))',
  'var(--color-accent)',
]
const level = (sets: number): number => (sets <= 0 ? 0 : sets < 5 ? 1 : sets < 10 ? 2 : 3)

/** Half sets appear because an exercise counts for half on the muscles that only assist it. */
const showSets = (sets: number): string => String(Math.round(sets * 10) / 10)

/** The front and back drawing alone, shaded from a list of muscle rows. */
export function BodyFigures({ rows, onPick, width = 124 }: { rows: readonly MuscleWeekRow[]; onPick?: (group: keyof typeof ON_BODY) => void; width?: number }) {
  const setsOf = (group: MuscleGroup) => rows.find((row) => row.muscle === group)?.sets ?? 0
  const data: IExerciseData[] = GROUPS.filter((group) => setsOf(group) > 0).map((group) => ({ name: group, muscles: ON_BODY[group], frequency: level(setsOf(group)) }))
  const pick = (stat: { muscle?: Muscle }) => {
    const group = GROUPS.find((candidate) => stat.muscle && ON_BODY[candidate].includes(stat.muscle))
    if (group) onPick?.(group)
  }
  return (
    <div className="flex items-start gap-2">
      {(['anterior', 'posterior'] as const).map((type) => (
        <div key={type} className="min-w-0 flex-1" aria-hidden="true">
          <Model data={data} type={type} onClick={pick} bodyColor="var(--color-surface-3)" highlightedColors={SHADES} style={{ width: '100%', maxWidth: width, margin: '0 auto' }} />
        </div>
      ))}
    </div>
  )
}

/**
 * The body: which muscles the hard sets of a week went to, front and back. Tapping a muscle says
 * what is behind its shade. Read from the logged sets; nothing here is stored.
 */
export function BodyCard() {
  const { today, weekStart } = useCore()
  const sets = useLive(() => db.set_logs.toArray(), [], NO_SETS)
  const exercises = useLive(() => db.exercises.toArray(), [], NO_EXERCISES)
  const byId = useMemo(() => new Map(exercises.map((exercise) => [exercise.id!, exercise])), [exercises])
  const thisWeek = weekStartOf(today, weekStart)
  const [start, setStart] = useState(thisWeek)
  const [picked, setPicked] = useState<keyof typeof ON_BODY | null>(null)
  const [showAll, setShowAll] = useState(false)
  const end = addDays(start, 6)

  const rows = useMemo(() => muscleWeek(sets, byId, start, end > today ? today : end), [sets, byId, start, end, today])
  const of = (muscle: MuscleGroup): MuscleWeekRow | undefined => rows.find((row) => row.muscle === muscle)
  const trained = GROUPS.filter((group) => (of(group)?.sets ?? 0) > 0).sort((a, b) => of(b)!.sets - of(a)!.sets)
  const missing = GROUPS.filter((group) => !trained.includes(group))
  const toggle = (group: keyof typeof ON_BODY) => setPicked((current) => (current === group ? null : group))
  const detail = picked ? of(picked) : undefined
  const listed = showAll ? trained : trained.slice(0, SHOWN)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <h2 className="eyebrow min-w-0 flex-1 truncate">{start === thisWeek ? 'This week' : `${formatShortDate(start)} – ${formatShortDate(end)}`}</h2>
        <IconButton icon="chevron-left" label="Week before" onClick={() => setStart(addDays(start, -7))} />
        <IconButton icon="chevron-right" label="Week after" disabled={start >= thisWeek} onClick={() => setStart(addDays(start, 7))} />
      </div>
      <div className="flex items-start gap-3">
        <div className="w-[176px] shrink-0">
          <BodyFigures rows={rows} onPick={toggle} width={84} />
        </div>
        <div className="min-w-0 flex-1">
          {trained.length === 0 ? (
            <p className="pt-1 text-[13.5px] leading-relaxed text-ink-3">No sets logged in this week.</p>
          ) : (
            <ul className="flex flex-col">
              {listed.map((group) => (
                <li key={group}>
                  <button
                    type="button"
                    onClick={() => toggle(group)}
                    aria-pressed={picked === group}
                    className={cx('flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 text-[13.5px]', picked === group ? 'font-semibold text-accent-ink' : 'text-ink')}
                  >
                    <span className="truncate">{MUSCLE_LABEL[group]}</span>
                    <span className="tnum font-medium">{showSets(of(group)!.sets)}</span>
                  </button>
                </li>
              ))}
              {trained.length > SHOWN && (
                <li>
                  <button type="button" onClick={() => setShowAll(!showAll)} className="min-h-11 w-full cursor-pointer text-left text-[13px] text-ink-2 underline underline-offset-2">
                    {showAll ? 'Show fewer' : `Show all ${trained.length}`}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {picked && (
        <div className="rounded-control bg-surface-2 px-3 py-2.5 text-[13.5px] leading-relaxed">
          <p className="font-medium text-ink">
            {MUSCLE_LABEL[picked]}: {showSets(detail?.sets ?? 0)} sets
          </p>
          {detail && detail.exercises.length > 0 && <p className="text-ink-2">{detail.exercises.join(', ')}</p>}
          <p className="text-ink-3">{lastTrainedLine(sets, byId, picked, today)}</p>
        </div>
      )}

      {missing.length > 0 && trained.length > 0 && <p className="text-[12.5px] leading-relaxed text-ink-3">No sets: {missing.map((group) => MUSCLE_LABEL[group]).join(', ')}.</p>}
    </Card>
  )
}

function lastTrainedLine(sets: readonly SetLog[], byId: ReadonlyMap<number, Exercise>, muscle: MuscleGroup, today: string): string {
  const last = muscleWeek(sets, byId, '0000-01-01', today).find((row) => row.muscle === muscle)?.last
  return last ? `Last trained: ${relativeDayLabel(last, today).toLowerCase()}` : 'Not trained yet'
}
