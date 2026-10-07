import { useMemo } from 'react'
import { Link } from '../../app/router'
import { db } from '../../data/db'
import type { Exercise, SetLog } from '../../data/types'
import { formatMediumDate, formatShortDate } from '../../engine/dates'
import { muscleBalance, personalBests, weeklyVolume } from '../../engine/history'
import { formatSet } from '../../engine/training'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { BarChart } from '../../ui/Charts'
import { cx } from '../../ui/cx'
import { MUSCLE_LABEL } from './labels'

const NO_SETS: SetLog[] = []
const NO_EXERCISES: Exercise[] = []
const WINDOW_DAYS = 30

/**
 * "Am I training consistently and getting stronger?" in three plain views: what was lifted each
 * week, which muscles the work went to, and the best set of each exercise. All of it is read from
 * the logged sets; nothing here is stored.
 */
export function TrainingInsights() {
  const { today, weekStart } = useCore()
  const sets = useLive(() => db.set_logs.toArray(), [], NO_SETS)
  const exercises = useLive(() => db.exercises.toArray(), [], NO_EXERCISES)
  const byId = useMemo(() => new Map(exercises.map((exercise) => [exercise.id!, exercise])), [exercises])

  const volume = useMemo(() => weeklyVolume(sets, today, weekStart, 12), [sets, today, weekStart])
  const balance = useMemo(() => muscleBalance(sets, byId, today, WINDOW_DAYS), [sets, byId, today])
  const bests = useMemo(() => personalBests(sets, byId), [sets, byId])
  const weeksLifted = volume.filter((week) => week.y > 0).length
  const most = balance.reduce((max, row) => Math.max(max, row.sets, row.previous), 0)

  if (!sets.some((set) => set.done)) return null

  return (
    <>
      <Card>
        <h2 className="eyebrow">Weight lifted per week (kg) · last 12 weeks</h2>
        {weeksLifted >= 2 ? (
          <div className="mt-3">
            <BarChart bars={volume} xFormat={formatShortDate} yFormat={(value) => value.toLocaleString('en-IN')} label="Kilograms lifted in each of the last twelve weeks" />
          </div>
        ) : (
          <p className="mt-2 text-[13.5px] text-ink-3">Need more history. This appears once two weeks have sets with a weight in them.</p>
        )}
      </Card>

      {balance.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Hard sets by muscle · last {WINDOW_DAYS} days</SectionTitle>
          <Card className="flex flex-col gap-3">
            {balance.map((row) => {
              const change = row.sets - row.previous
              return (
                <div key={row.muscle} className="flex items-center gap-3">
                  <span className="w-[92px] shrink-0 truncate text-[13.5px] text-ink">{MUSCLE_LABEL[row.muscle]}</span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <span className="block h-full rounded-full bg-exercise" style={{ width: `${most ? Math.round((row.sets / most) * 100) : 0}%` }} />
                  </span>
                  <span className="tnum w-8 shrink-0 text-right text-[13.5px] font-medium text-ink">{row.sets}</span>
                  <span className={cx('tnum w-[70px] shrink-0 text-right text-[12px]', change === 0 ? 'text-ink-3' : 'text-ink-2')}>
                    {row.previous === 0 && row.sets > 0 ? 'none before' : change === 0 ? 'same' : `${change > 0 ? '+' : '−'}${Math.abs(change)} vs before`}
                  </span>
                </div>
              )
            })}
            <p className="text-[12px] leading-relaxed text-ink-3">A hard set is a work set taken to within four reps of failure, or with no effort recorded. Compared with the {WINDOW_DAYS} days before.</p>
          </Card>
        </section>
      )}

      {bests.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionTitle>Best sets · {bests.length}</SectionTitle>
          <Card padded={false} className="divide-y divide-line overflow-hidden">
            {bests.slice(0, 12).map((best) => (
              <Link
                key={best.exercise.id}
                to={`/train/exercise/${best.exercise.id}`}
                className="flex min-h-[52px] items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] text-ink">{best.exercise.name}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{formatMediumDate(best.set.date)}</span>
                </span>
                <span className="tnum shrink-0 text-right">
                  <span className="block text-[14px] font-medium text-ink">{formatSet(best.set)}</span>
                  <span className="block text-[12px] text-ink-3">about {Math.round(best.estimate)} kg for one</span>
                </span>
              </Link>
            ))}
          </Card>
        </section>
      )}
    </>
  )
}
