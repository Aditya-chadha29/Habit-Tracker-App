import { useCore } from '../../state/core'
import { useMemo, useState } from 'react'
import type { RouteProps } from '../../app/router'
import { db } from '../../data/db'
import { doubleWeightsBefore } from '../../data/workoutRepo'
import { Button } from '../../ui/Button'
import { ConfirmationDialog } from '../../ui/Overlay'
import { useToast } from '../../ui/Toast'
import type { SetLog } from '../../data/types'
import { formatMediumDate, formatShortDate } from '../../engine/dates'
import { bestSet, e1rm, formatSet, formatSetLine, groupSetsByDate, isWorkSet, volumeLoad, weightIn } from '../../engine/training'
import { useKeyedLiveQuery } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { LineChart } from '../../ui/Charts'
import { EmptyState } from '../../ui/EmptyState'
import { MetricCard } from '../../ui/Metric'
import { Page } from '../../ui/Page'
import { formatNumber } from '../../ui/numbers'
import { useExercises } from './hooks'
import { EQUIPMENT_LABEL, MUSCLE_LABEL } from './labels'

const MIN_SESSIONS_FOR_CHART = 3

/**
 * One exercise over time: the question is simply "am I getting stronger at this?". The chart is
 * held back until there are enough sessions for a line to mean anything.
 */
export default function ExerciseScreen({ params }: RouteProps) {
  const { settings, today } = useCore()
  const unit = settings.weight_unit
  const toast = useToast()
  const [before, setBefore] = useState('')
  const [confirming, setConfirming] = useState(false)
  const exerciseId = Number(params.id)
  const { byId } = useExercises()
  const exercise = byId.get(exerciseId)
  const { data, loaded } = useKeyedLiveQuery(exerciseId, (id) => db.set_logs.where('exercise_id').equals(id).toArray())
  const done = useMemo(() => (data ?? []).filter(isWorkSet), [data])
  const days = useMemo(() => groupSetsByDate(done), [done])
  const weighted = exercise?.kind === 'weight_reps' || exercise?.kind === 'weighted_bodyweight'

  const points = useMemo(() => {
    return [...days].reverse().map((day) => {
      const top = bestSet(day.sets)
      const estimate = top ? e1rm(top.weight_kg, top.reps, top.rir) : null
      return { x: day.date, y: estimate === null ? (top?.weight_kg ?? null) : Math.round(estimate * 10) / 10 }
    })
  }, [days])

  if (loaded && !exercise) {
    return (
      <Page title="Exercise" back="/train">
        <EmptyState title="That exercise does not exist." />
      </Page>
    )
  }

  const best = bestSet(done)
  const bestEstimate = done.reduce<number | null>((max, set: SetLog) => {
    const estimate = e1rm(set.weight_kg, set.reps, set.rir)
    return estimate !== null && (max === null || estimate > max) ? estimate : max
  }, null)
  const latest = days[0]
  const affected = before ? (data ?? []).filter((set) => set.date < before && !!set.weight_kg).length : 0
  const double = () => {
    setConfirming(false)
    doubleWeightsBefore(exerciseId, before, today, Date.now())
      .then((count) => {
        setBefore('')
        toast.show(`${count} ${count === 1 ? 'set' : 'sets'} doubled.`, { tone: 'ok' })
      })
      .catch(() => toast.show('The sets could not be changed.', { tone: 'risk' }))
  }

  return (
    <Page
      title={exercise?.name ?? 'Exercise'}
      subtitle={exercise ? `${MUSCLE_LABEL[exercise.primary_muscle]} · ${EQUIPMENT_LABEL[exercise.equipment]}` : undefined}
      back="/train"
      width="default"
    >
      {!loaded ? null : days.length === 0 ? (
        <EmptyState icon="train" title="Not performed yet." body="Its history appears here after the first logged set." />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Last workout" value={latest ? formatSet(bestSet(latest.sets) ?? latest.sets[0], unit) : '—'} hint={latest ? formatMediumDate(latest.date) : undefined} />
            <MetricCard label="Best set" value={best ? formatSet(best, unit) : '—'} hint={best ? formatMediumDate(best.date) : undefined} />
            {weighted && (
              <MetricCard
                label="Best estimated 1RM"
                value={bestEstimate === null ? '—' : formatNumber(bestEstimate, 1)}
                unit={bestEstimate === null ? undefined : 'kg'}
                hint={bestEstimate === null ? 'Needs a set of 12 reps or fewer' : 'Estimated from reps; not a tested maximum'}
              />
            )}
            <MetricCard label="Sessions" value={days.length} hint="with this exercise" />
          </div>

          {weighted && (
            <Card>
              <h2 className="eyebrow">Top set, estimated one-rep max (kg)</h2>
              {days.length >= MIN_SESSIONS_FOR_CHART ? (
                <div className="mt-3">
                  <LineChart
                    series={[{ label: 'Estimated 1RM', tone: 'accent', points }]}
                    xFormat={formatShortDate}
                    yFormat={(value) => formatNumber(value, 1)}
                    label={`Estimated one-rep max for ${exercise?.name} across ${days.length} sessions`}
                  />
                </div>
              ) : (
                <p className="mt-2 text-[13.5px] text-ink-3">
                  Need more history. A trend line appears after {MIN_SESSIONS_FOR_CHART} sessions; {days.length} so far.
                </p>
              )}
            </Card>
          )}

          <section className="flex flex-col gap-2">
            <SectionTitle>Sessions</SectionTitle>
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {days.slice(0, 30).map((day) => (
                <div key={day.date} className="px-4 py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[13.5px] font-medium text-ink">{formatMediumDate(day.date)}</span>
                    {weighted && <span className="tnum ml-auto text-[12px] text-ink-3">{Math.round(weightIn(volumeLoad(day.sets), unit)).toLocaleString('en-IN')} {unit} volume</span>}
                  </div>
                  <p className="tnum mt-1 text-[14px] leading-relaxed text-ink-2">{formatSetLine(day.sets, unit)}</p>
                </div>
              ))}
            </Card>
            {days.length > 30 && <p className="px-1 text-[12.5px] text-ink-3">Showing the 30 most recent of {days.length} sessions.</p>}
          </section>

          {exercise?.equipment === 'dumbbell' && (
            <section className="flex flex-col gap-2">
              <SectionTitle>Correct old entries</SectionTitle>
              <Card className="flex flex-col gap-3">
                <p className="text-[13.5px] leading-relaxed text-ink-2">
                  Dumbbell weights are logged as both dumbbells together. If earlier sets were logged as one dumbbell, they can be doubled, for sets before a date you choose. A copy of the record is taken first.
                </p>
                <label className="flex flex-col gap-1.5 text-[12.5px] text-ink-3">
                  Double the sets logged before
                  <input type="date" value={before} max={today} onChange={(event) => setBefore(event.target.value)} className="h-11 rounded-control bg-surface-2 px-3 text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]" />
                </label>
                <Button variant="secondary" disabled={!before || affected === 0} onClick={() => setConfirming(true)} className="self-start">
                  {before ? `Double ${affected} ${affected === 1 ? 'set' : 'sets'}` : 'Choose a date'}
                </Button>
              </Card>
            </section>
          )}
        </div>
      )}
      <ConfirmationDialog
        open={confirming}
        title={`Double ${affected} ${affected === 1 ? 'set' : 'sets'}?`}
        body={`Every set of ${exercise?.name ?? 'this exercise'} logged before ${before} will have its weight doubled. Do this once only: doing it again doubles them again.`}
        confirmLabel="Double"
        onCancel={() => setConfirming(false)}
        onConfirm={double}
      />
    </Page>
  )
}
