import { useMemo } from 'react'
import { Link } from '../../app/router'
import { db } from '../../data/db'
import type { Exercise, SetLog } from '../../data/types'
import { formatMediumDate, formatShortDate } from '../../engine/dates'
import { personalBests, weeklyVolume } from '../../engine/history'
import { formatSet, weightIn } from '../../engine/training'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { BarChart } from '../../ui/Charts'

const NO_SETS: SetLog[] = []
const NO_EXERCISES: Exercise[] = []

/**
 * "Am I training consistently and getting stronger?" in three plain views: what was lifted each
 * week, which muscles the work went to, and the best set of each exercise. All of it is read from
 * the logged sets; nothing here is stored.
 */
export function TrainingInsights() {
  const { today, weekStart, settings } = useCore()
  const sets = useLive(() => db.set_logs.toArray(), [], NO_SETS)
  const exercises = useLive(() => db.exercises.toArray(), [], NO_EXERCISES)
  const byId = useMemo(() => new Map(exercises.map((exercise) => [exercise.id!, exercise])), [exercises])

  const volume = useMemo(() => weeklyVolume(sets, today, weekStart, 12), [sets, today, weekStart])
  const bests = useMemo(() => personalBests(sets, byId), [sets, byId])
  const weeksLifted = volume.filter((week) => week.y > 0).length

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
                  <span className="block text-[14px] font-medium text-ink">{formatSet(best.set, settings.weight_unit)}</span>
                  <span className="block text-[12px] text-ink-3">about {Math.round(weightIn(best.estimate, settings.weight_unit))} {settings.weight_unit} for one</span>
                </span>
              </Link>
            ))}
          </Card>
        </section>
      )}
    </>
  )
}
