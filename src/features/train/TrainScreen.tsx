import { useMemo, useState } from 'react'
import { Link, navigate } from '../../app/router'
import { TargetRow } from '../../components/TargetRow'
import type { DateStr, Session, SessionKind } from '../../data/types'
import { quickLogSession, startSession } from '../../data/workoutRepo'
import { addDays, formatDayTitle, formatMediumDate, relativeDayLabel, weekDates, weekdayIndex, WEEKDAY_SHORT } from '../../engine/dates'
import { firstEditableDate } from '../../engine/lock'
import { periodOf } from '../../engine/periods'
import { targetProgress } from '../../engine/targets'
import { currentVersion, isRetired } from '../../engine/timeline'
import { sessionMinutes } from '../../engine/training'
import { useCore } from '../../state/core'
import { Button, IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Select, Stepper, TextInput } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { Modal } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'
import { useRoutines, useRoutineSizes, useSessionsBetween, useTodaysWorkout } from './hooks'

const KIND_OPTIONS = [
  { id: 'strength', label: 'Strength' },
  { id: 'cardio', label: 'Cardio' },
] as const

export function sessionSummary(session: Session): string {
  const minutes = sessionMinutes(session)
  const parts: string[] = []
  if (minutes !== null) parts.push(`${minutes} min`)
  if (session.quick) parts.push('logged without sets')
  return parts.join(' · ')
}

function QuickLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { today, settings, write } = useCore()
  const toast = useToast()
  const [kind, setKind] = useState<SessionKind>('strength')
  const [minutes, setMinutes] = useState(30)
  const [date, setDate] = useState<DateStr>(today)
  const [note, setNote] = useState('')
  const first = firstEditableDate(today, settings.edit_window_days)
  const days: DateStr[] = []
  for (let d = today; d >= first; d = addDays(d, -1)) days.push(d)

  const save = async () => {
    try {
      await quickLogSession({ date, kind, minutes, notes: note }, write, Date.now())
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
        <Field label="Note" hint="Optional.">
          <TextInput value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * Train answers "what should I train?": today's workout from the weekly programme, one tap from
 * starting, with the week around it. The programme is a suggestion — any routine can be started
 * on any day.
 */
export default function TrainScreen() {
  const { today, weekStart, habits, index, write } = useCore()
  const toast = useToast()
  const allRoutines = useRoutines()
  const sizes = useRoutineSizes()
  const workout = useTodaysWorkout()
  const [choosing, setChoosing] = useState(false)
  const [quick, setQuick] = useState(false)

  const routines = useMemo(() => allRoutines.filter((routine) => !routine.retired_on), [allRoutines])
  const week = useMemo(() => periodOf('week', today, weekStart), [today, weekStart])
  const sessions = useSessionsBetween(addDays(week.start, -28), today)
  const finished = sessions.filter((session) => session.ended_at !== null)
  const gym = habits.find((habit) => !isRetired(habit) && currentVersion(habit).sources.includes('workout'))
  const progress = gym ? targetProgress(gym, week, today, index) : null
  const stale = workout.open && workout.open.date < today ? workout.open : null
  const inProgress = workout.open && workout.open.date === today ? workout.open : null

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
      width="wide"
      actions={
        <>
          <IconButton icon="history" label="Training history" onClick={() => navigate('/train/history')} />
          <IconButton icon="sliders" label="Routines, exercises and programme" onClick={() => navigate('/train/setup')} />
        </>
      }
    >
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-5 lg:col-span-7">
          {stale && (
            <Card className="flex items-center gap-3">
              <Icon name="alert-circle" size={20} className="shrink-0 text-warn" />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium text-ink">Unfinished workout from {formatMediumDate(stale.date)}</p>
                <p className="text-[12.5px] text-ink-3">{stale.title}. Finish it or discard it before starting another.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate(`/train/session/${stale.id}`)}>
                Open
              </Button>
            </Card>
          )}

          <Card className="flex flex-col gap-4">
            <div>
              <p className="eyebrow">{inProgress ? 'In progress' : 'Today’s workout'}</p>
              <h2 className="mt-1 text-[24px] leading-tight font-semibold tracking-tight text-ink">
                {inProgress ? inProgress.title : workout.scheduled.length ? workout.scheduled.map((routine) => routine.name).join(' + ') : 'Nothing scheduled'}
              </h2>
              <p className="mt-1 text-[13px] text-ink-3">
                {inProgress
                  ? 'Started earlier today.'
                  : workout.scheduled.length
                    ? `${workout.scheduled.reduce((total, routine) => total + (sizes.get(routine.id!) ?? 0), 0)} exercises · from the weekly programme`
                    : 'The programme has no workout for today. Any routine can still be started.'}
              </p>
            </div>
            {workout.finished.length > 0 && (
              <ul className="flex flex-col gap-1.5">
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
            {inProgress ? (
              <Button variant="primary" size="lg" icon="play" block onClick={() => navigate(`/train/session/${inProgress.id}`)}>
                Resume workout
              </Button>
            ) : workout.scheduled.length ? (
              workout.scheduled.map((routine) => (
                <Button key={routine.id} variant="primary" size="lg" icon="play" block disabled={!!stale} onClick={() => start(routine.id!)}>
                  Start {workout.scheduled.length > 1 ? routine.name : 'workout'}
                </Button>
              ))
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={!!workout.open} onClick={() => setChoosing(true)}>
                Another routine
              </Button>
              <Button variant="secondary" onClick={() => setQuick(true)}>
                Log without sets
              </Button>
            </div>
          </Card>

          <section className="flex flex-col gap-2">
            <SectionTitle
              action={
                <Link to="/train/history" className="font-medium">
                  All history
                </Link>
              }
            >
              Recent sessions
            </SectionTitle>
            {finished.length === 0 ? (
              <EmptyState icon="train" title="No sessions logged yet." body="Start today’s workout, or log one without sets." />
            ) : (
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {finished.slice(0, 6).map((session) => (
                  <Link
                    key={session.id}
                    to={`/train/session/${session.id}`}
                    className="flex min-h-[56px] items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] text-ink">{session.title}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                        {relativeDayLabel(session.date, today)}
                        {sessionSummary(session) && ` · ${sessionSummary(session)}`}
                      </span>
                    </span>
                    {(session.kinds ?? []).map((kind) => (
                      <Chip key={kind} tone={kind === 'cardio' ? 'learning' : 'exercise'}>
                        {kind === 'cardio' ? 'Cardio' : 'Strength'}
                      </Chip>
                    ))}
                    <Icon name="chevron-right" size={17} className="shrink-0 text-ink-3" />
                  </Link>
                ))}
              </Card>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5 lg:col-span-5">
          {gym && progress && (
            <section className="flex flex-col gap-2">
              <SectionTitle>Weekly target</SectionTitle>
              <Card padded={false} className="overflow-hidden">
                <TargetRow habit={gym} progress={progress} />
              </Card>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <SectionTitle
              action={
                <Link to="/train/setup?tab=programme" className="font-medium">
                  Edit programme
                </Link>
              }
            >
              This week
            </SectionTitle>
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {weekDates(week.start).map((date) => {
                const weekday = weekdayIndex(date)
                const planned = routines.filter((routine) => (routine.weekdays ?? []).includes(weekday))
                const done = finished.filter((session) => session.date === date)
                const isToday = date === today
                return (
                  <div key={date} className={cx('flex min-h-[52px] items-center gap-3 px-4 py-2', isToday && 'bg-accent/8')}>
                    <span className={cx('w-9 shrink-0 text-[12.5px] font-medium', isToday ? 'text-accent-ink' : 'text-ink-3')}>{WEEKDAY_SHORT[weekday]}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block truncate text-[14px]', planned.length ? 'text-ink' : 'text-ink-3')}>
                        {planned.length ? planned.map((routine) => routine.name).join(' + ') : 'Rest / unscheduled'}
                      </span>
                      {done.length > 0 && <span className="block truncate text-[12px] text-ink-3">Logged: {done.map((session) => session.title).join(', ')}</span>}
                    </span>
                    {done.length > 0 ? (
                      <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-ok">
                        <Icon name="check-circle" size={16} />
                        Done
                      </span>
                    ) : date < today ? (
                      <span className="shrink-0 text-[12px] text-ink-3">No session</span>
                    ) : isToday ? (
                      <span className="shrink-0 text-[12px] font-medium text-accent-ink">Today</span>
                    ) : null}
                  </div>
                )
              })}
            </Card>
          </section>
        </div>
      </div>

      <Modal open={choosing} onClose={() => setChoosing(false)} title="Start a routine" size="sm">
        <ul className="divide-y divide-line overflow-hidden rounded-control bg-surface-2">
          {routines.map((routine) => (
            <li key={routine.id}>
              <button
                type="button"
                onClick={() => {
                  setChoosing(false)
                  void start(routine.id!)
                }}
                className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-3 text-left transition-colors duration-100 hover:bg-surface-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] text-ink">{routine.name}</span>
                  <span className="block text-[12.5px] text-ink-3">
                    {sizes.get(routine.id!) ?? 0} exercises
                    {(routine.weekdays ?? []).length > 0 && ` · ${(routine.weekdays ?? []).map((day) => WEEKDAY_SHORT[day]).join(', ')}`}
                  </span>
                </span>
                <Icon name="play" size={16} className="shrink-0 text-ink-3" />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setChoosing(false)
                void start(null)
              }}
              className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-3 text-left transition-colors duration-100 hover:bg-surface-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] text-ink">Free session</span>
                <span className="block text-[12.5px] text-ink-3">No routine. Add exercises as you go.</span>
              </span>
              <Icon name="play" size={16} className="shrink-0 text-ink-3" />
            </button>
          </li>
        </ul>
      </Modal>
      <QuickLog open={quick} onClose={() => setQuick(false)} />
    </Page>
  )
}
