import { useMemo, useState } from 'react'
import { Link, navigate } from '../../app/router'
import { TargetRow } from '../../components/TargetRow'
import { db } from '../../data/db'
import type { DateStr, RoutineItem, Session, SessionKind } from '../../data/types'
import { quickLogSession, startSession } from '../../data/workoutRepo'
import { addDays, formatDayTitle, formatMediumDate, relativeDayLabel } from '../../engine/dates'
import { firstEditableDate } from '../../engine/lock'
import { periodOf } from '../../engine/periods'
import { targetProgress } from '../../engine/targets'
import { currentVersion, isRetired } from '../../engine/timeline'
import { sessionMinutes } from '../../engine/training'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Button, IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Select, Stepper, TextInput } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { Modal } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'
import { BodyCard } from './BodyCard'
import { useExercises, useRoutines, useTodaysWorkout } from './hooks'

const NO_ITEMS: RoutineItem[] = []

const KIND_OPTIONS = [
  { id: 'strength', label: 'Strength' },
  { id: 'cardio', label: 'Cardio' },
] as const

export function sessionSummary(session: Session): string {
  const minutes = sessionMinutes(session)
  const parts: string[] = []
  if (minutes !== null) parts.push(`${minutes} min`)
  if (session.distance_km) parts.push(`${session.distance_km} km`)
  if (session.quick) parts.push('logged without sets')
  return parts.join(' · ')
}

function QuickLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { today, settings, write } = useCore()
  const toast = useToast()
  const [kind, setKind] = useState<SessionKind>('strength')
  const [minutes, setMinutes] = useState(30)
  const [distance, setDistance] = useState('')
  const [what, setWhat] = useState('')
  const [date, setDate] = useState<DateStr>(today)
  const [note, setNote] = useState('')
  const first = firstEditableDate(today, settings.edit_window_days)
  const days: DateStr[] = []
  for (let d = today; d >= first; d = addDays(d, -1)) days.push(d)

  const save = async () => {
    try {
      await quickLogSession({ date, kind, minutes, notes: note, title: what, distance_km: Number(distance) || null }, write, Date.now())
      toast.show(`${kind === 'cardio' ? 'Cardio' : 'Strength'} session logged for ${relativeDayLabel(date, today).toLowerCase()}.`, { tone: 'ok' })
      onClose()
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log a session without sets"
      size="sm"
      footer={
        <Button variant="primary" block onClick={save}>
          Log session
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13.5px] leading-relaxed text-ink-3">For a cardio day, or a workout done away from the phone. It counts as a training session like any other.</p>
        <Segmented options={KIND_OPTIONS} value={kind} onChange={setKind} label="Kind of session" block />
        <Field label="Day">
          <Select value={date} onChange={(event) => setDate(event.target.value)}>
            {days.map((day) => (
              <option key={day} value={day}>
                {relativeDayLabel(day, today)} · {formatMediumDate(day)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Minutes" hint="Optional. Set to 0 to leave it out.">
          <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={5} min={0} max={600} unit="min" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === 'cardio' ? 'Type' : 'What'} hint="Optional.">
            <TextInput value={what} onChange={(event) => setWhat(event.target.value)} maxLength={40} placeholder={kind === 'cardio' ? 'Walk, jog, cycle' : 'Chest + Triceps'} />
          </Field>
          {kind === 'cardio' && (
            <Field label="Distance (km)" hint="Optional.">
              <TextInput inputMode="decimal" value={distance} onChange={(event) => setDistance(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="3.5" />
            </Field>
          )}
        </div>
        <Field label="Note" hint="Optional.">
          <TextInput value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * Train opens on starting: today's routine with the one filled button, then an empty workout, the
 * body map, and the other routines as rows. History and the set-up of routines, exercises and the
 * programme are one tap away in the header.
 */
export default function TrainScreen() {
  const { today, weekStart, habits, index, write } = useCore()
  const toast = useToast()
  const allRoutines = useRoutines()
  const workout = useTodaysWorkout()
  const { byId } = useExercises()
  const items = useLive(() => db.routine_items.toArray(), [], NO_ITEMS)
  const [quick, setQuick] = useState(false)

  const week = useMemo(() => periodOf('week', today, weekStart), [today, weekStart])
  const gym = habits.find((habit) => !isRetired(habit) && currentVersion(habit).sources.includes('workout'))
  const progress = gym ? targetProgress(gym, week, today, index) : null
  const stale = workout.open && workout.open.date < today ? workout.open : null
  const inProgress = workout.open && workout.open.date === today ? workout.open : null
  const current = stale ?? inProgress
  const scheduledIds = workout.scheduled.map((routine) => routine.id)
  const active = allRoutines.filter((routine) => !routine.retired_on)
  // The routine the programme has for today leads the screen; every other routine is a row below.
  const todays = active.find((routine) => scheduledIds.includes(routine.id)) ?? null
  const others = active.filter((routine) => routine.id !== todays?.id)
  const exercisesOf = (routineId: number): string =>
    items
      .filter((item) => item.routine_id === routineId)
      .sort((a, b) => a.position - b.position)
      .map((item) => byId.get(item.exercise_id)?.name)
      .filter(Boolean)
      .join(', ')

  const start = async (routineId: number | null) => {
    try {
      const id = await startSession(routineId, today, write, Date.now())
      navigate(`/train/session/${id}`)
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'The workout could not be started.', { tone: 'risk' })
    }
  }

  return (
    <Page
      title="Train"
      subtitle={formatDayTitle(today)}
      width="narrow"
      actions={
        <>
          <IconButton icon="history" label="Training history" onClick={() => navigate('/train/history')} />
          <IconButton icon="sliders" label="Routines, exercises and programme" onClick={() => navigate('/train/setup')} />
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {current && (
          <Card className="flex items-center gap-3 shadow-[inset_0_0_0_1.5px_var(--color-accent)]">
            <Icon name={stale ? 'alert-circle' : 'play'} size={20} className={stale ? 'shrink-0 text-warn' : 'shrink-0 text-accent-ink'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium text-ink">{stale ? `Unfinished workout from ${formatMediumDate(stale.date)}` : 'Workout in progress'}</p>
              <p className="truncate text-[12.5px] text-ink-3">{current.title}</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => navigate(`/train/session/${current.id}`)}>
              {stale ? 'Open' : 'Resume'}
            </Button>
          </Card>
        )}

        {workout.finished.length > 0 && (
          <ul className="flex flex-col gap-1.5 px-1">
            {workout.finished.map((session) => (
              <li key={session.id}>
                <Link to={`/train/session/${session.id}`} className="flex items-center gap-2 text-[13.5px] text-ok">
                  <Icon name="check-circle" size={16} />
                  <span className="min-w-0 truncate">
                    Logged today: {session.title}
                    {sessionSummary(session) && <span className="text-ink-3"> · {sessionSummary(session)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {todays && (
          <Card className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Today</p>
                <h2 className="mt-1 truncate text-[17px] font-semibold text-ink">{todays.name}</h2>
                <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-3">{exercisesOf(todays.id!) || 'No exercises in this routine yet.'}</p>
              </div>
              <IconButton icon="edit" label={`Edit ${todays.name}`} onClick={() => navigate(`/train/setup/routine/${todays.id}`)} />
            </div>
            <Button variant={current ? 'secondary' : 'primary'} size="lg" block disabled={!!workout.open} onClick={() => start(todays.id!)}>
              Start routine
            </Button>
          </Card>
        )}

        <Button variant="secondary" size="lg" icon="plus" block disabled={!!workout.open} onClick={() => start(null)}>
          Start empty workout
        </Button>

        <BodyCard />

        <section className="flex flex-col gap-2">
          <SectionTitle
            action={
              <Link to="/train/setup/routine/new" className="font-medium">
                New routine
              </Link>
            }
          >
            {todays ? 'Other routines' : 'Routines'} · {others.length}
          </SectionTitle>
          {active.length === 0 ? (
            <EmptyState
              icon="train"
              title="No routines yet."
              body="A routine is a list of exercises you repeat: Push, Pull, Legs. Make one, then start it from here."
              action={
                <Button variant="secondary" icon="plus" onClick={() => navigate('/train/setup/routine/new')}>
                  New routine
                </Button>
              }
            />
          ) : (
            others.length > 0 && (
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {others.map((routine) => (
                  <div key={routine.id} className="flex items-center gap-1 py-1.5 pl-4 pr-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-[14.5px] font-medium text-ink">{routine.name}</h2>
                      <p className="truncate text-[12.5px] text-ink-3">{exercisesOf(routine.id!) || 'No exercises yet.'}</p>
                    </div>
                    <IconButton icon="edit" label={`Edit ${routine.name}`} onClick={() => navigate(`/train/setup/routine/${routine.id}`)} />
                    <Button variant="secondary" disabled={!!workout.open} aria-label={`Start ${routine.name}`} onClick={() => start(routine.id!)}>
                      Start
                    </Button>
                  </div>
                ))}
              </Card>
            )
          )}
        </section>

        {gym && progress && (
          <section className="flex flex-col gap-2">
            <SectionTitle>This week</SectionTitle>
            <Card padded={false} className="overflow-hidden">
              <TargetRow habit={gym} progress={progress} />
            </Card>
          </section>
        )}

        <Button variant="ghost" onClick={() => setQuick(true)} className="self-center">
          Log a session without sets
        </Button>
      </div>

      <QuickLog open={quick} onClose={() => setQuick(false)} />
    </Page>
  )
}
