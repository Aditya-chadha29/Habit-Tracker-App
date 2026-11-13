import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, navigate, type RouteProps } from '../../app/router'
import { db } from '../../data/db'
import type { SetLog } from '../../data/types'
import {
  addExerciseToSession, addSetRow, clearRest, deleteSession, extendRest, finishSession, lastPerformedSets,
  removeExerciseBlock, removeSetRow, setSessionNotes,
} from '../../data/workoutRepo'
import { formatMediumDate } from '../../engine/dates'
import { isEditable } from '../../engine/lock'
import { bestSet, e1rm, formatDuration, formatSet, isWorkSet, sessionMinutes, volumeLoad, weightIn } from '../../engine/training'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'
import { Button, IconButton } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { cx } from '../../ui/cx'
import { EmptyState } from '../../ui/EmptyState'
import { Field, TextArea } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { ConfirmationDialog, Modal } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { ExercisePicker } from './ExercisePicker'
import { blocksOf, useExercises, useNow } from './hooks'
import { BodyFigures } from './BodyCard'
import { muscleWeek } from '../../engine/history'
import { SetRow } from './SetRow'

/** Keeps the screen on during a workout where the browser allows it. It cannot make a locked
 *  phone ring: a web app has no way to alert in the background, and nothing here pretends to. */
function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) void lock.release()
        else setHeld(true)
      } catch {
        setHeld(false)
      }
    }
    void acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
      setHeld(false)
    }
  }, [active])
  return held
}

export default function SessionScreen({ params }: RouteProps) {
  const sessionId = Number(params.id)
  const { today, settings, write } = useCore()
  const toast = useToast()
  const { byId, list } = useExercises()
  const { data, loaded } = useKeyedLiveQuery(sessionId, async (id) => {
    const session = await db.sessions.get(id)
    if (!session) return null
    return { session, sets: await db.set_logs.where('session_id').equals(id).toArray() }
  })
  const session = data?.session ?? null
  const sets = useMemo(() => data?.sets ?? [], [data])
  const blocks = useMemo(() => blocksOf(sets), [sets])
  const exerciseIds = useMemo(() => [...new Set(blocks.map((block) => block.exerciseId))].sort((a, b) => a - b), [blocks])
  const sessionDate = session?.date ?? today
  const previous = useLiveQuery(async () => {
    const map = new Map<number, SetLog[]>()
    for (const id of exerciseIds) map.set(id, await lastPerformedSets(id, sessionDate))
    return map
  }, [exerciseIds.join(','), sessionDate])

  // The best of each exercise before this day, to tell a new best from an ordinary set, and the
  // routine's rep ranges, for the next-weight hint.
  const earlier = useLiveQuery(async () => {
    const best = new Map<number, number>()
    for (const id of exerciseIds) {
      for (const set of await db.set_logs.where('exercise_id').equals(id).toArray()) {
        if (!isWorkSet(set) || set.date >= sessionDate) continue
        const estimate = e1rm(set.weight_kg, set.reps, set.rir)
        if (estimate !== null) best.set(id, Math.max(best.get(id) ?? 0, estimate))
      }
    }
    return best
  }, [exerciseIds.join(','), sessionDate])
  const routineId = data?.session?.routine_id ?? null
  const targets = useLiveQuery(async () => (routineId ? db.routine_items.where('routine_id').equals(routineId).toArray() : []), [routineId])

  const live = !!session && session.ended_at === null
  const unit = settings.weight_unit
  const now = useNow(live)
  const awake = useWakeLock(live)
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  // Finished exercises fold to their heading; these positions were opened again by hand.
  const [reopened, setReopened] = useState<ReadonlySet<number>>(new Set())
  const [notes, setNotes] = useState('')
  const buzzed = useRef<number | null>(null)

  const restLeft =
    session?.rest_started_at && session.rest_seconds ? Math.ceil(session.rest_seconds - (now - session.rest_started_at) / 1000) : null

  useEffect(() => {
    if (restLeft === null || restLeft > 0 || !session?.rest_started_at) return
    if (buzzed.current === session.rest_started_at) return
    buzzed.current = session.rest_started_at
    navigator.vibrate?.(200)
  }, [restLeft, session?.rest_started_at])

  if (loaded && !session) {
    return (
      <Page title="Workout" back="/train">
        <EmptyState title="That session does not exist." body="It may have been discarded." />
      </Page>
    )
  }
  if (!session) return <Page title="Workout" back="/train">{null}</Page>

  const editable = live || isEditable(session.date, today, settings.edit_window_days)
  const doneSets = sets.filter(isWorkSet)
  const fail = (error: unknown) => toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })
  const elapsed = live && session.started_at ? formatDuration((now - session.started_at) / 1000) : null
  const minutes = sessionMinutes(session)

  const blockDone = (block: { sets: SetLog[] }) => block.sets.length > 0 && block.sets.every((set) => set.done)
  const toggleBlock = (position: number) =>
    setReopened((current) => {
      const next = new Set(current)
      if (!next.delete(position)) next.add(position)
      return next
    })

  const finish = async () => {
    try {
      await finishSession(sessionId, notes, write, Date.now())
      setFinishing(false)
      toast.show('Workout saved.', { tone: 'ok' })
      navigate('/train', { replace: true })
    } catch (error) {
      fail(error)
    }
  }

  const discard = async () => {
    try {
      await deleteSession(sessionId, write)
      navigate('/train', { replace: true })
    } catch (error) {
      fail(error)
    }
  }

  return (
    <Page
      title={session.title}
      subtitle={
        live
          ? `In progress${awake ? ' · screen stays on' : ''}`
          : `${formatMediumDate(session.date)}${minutes !== null ? ` · ${minutes} min` : ''}${editable ? '' : ' · locked'}`
      }
      back="/train"
      width="narrow"
      actions={
        live ? (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setNotes(session.notes)
                setFinishing(true)
              }}
            >
              Finish
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {live && restLeft !== null && (
          <Card className={cx('sticky top-0 z-10 flex items-center gap-3', restLeft > 0 ? '' : 'shadow-[inset_0_0_0_1.5px_var(--color-ok)]')}>
            <Icon name="timer" size={20} className={restLeft > 0 ? 'text-accent-ink' : 'text-ok'} />
            <div className="min-w-0 flex-1" role="timer" aria-live="off">
              <p className="tnum text-[22px] leading-none font-semibold tracking-tight text-ink">
                {restLeft > 0 ? formatDuration(restLeft) : 'Rest over'}
              </p>
              <p className="mt-1 text-[12px] text-ink-3">{restLeft > 0 ? 'Rest' : `${formatDuration(-restLeft)} ago · only shown while this screen is open`}</p>
            </div>
            {restLeft > 0 && (
              <Button variant="secondary" size="sm" onClick={() => extendRest(sessionId, 30).catch(fail)}>
                +30 s
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => clearRest(sessionId).catch(fail)}>
              {restLeft > 0 ? 'Skip' : 'Dismiss'}
            </Button>
          </Card>
        )}

        {!live && session.quick && (
          <Card className="text-[13.5px] leading-relaxed text-ink-2">
            Logged without sets{minutes !== null ? `, ${minutes} minutes` : ''}. {(session.kinds ?? []).includes('cardio') ? 'Counted as cardio.' : 'Counted as a strength session.'}
          </Card>
        )}

        {!session.quick && (live || doneSets.length > 0) && (
          <div className="grid grid-cols-3 divide-x divide-line rounded-card bg-surface py-2.5 shadow-card">
            {[
              ['Duration', live ? (elapsed ?? '—') : minutes !== null ? `${minutes} min` : '—'],
              ['Volume', `${Math.round(weightIn(volumeLoad(sets), unit)).toLocaleString('en-IN')} ${unit}`],
              ['Sets', String(doneSets.length)],
            ].map(([label, value]) => (
              <div key={label} className="px-3">
                <p className="text-[11.5px] text-ink-3">{label}</p>
                <p className={cx('tnum mt-0.5 text-[16px] font-semibold', label === 'Duration' && live ? 'text-accent-ink' : 'text-ink')}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {!session.quick && blocks.length > 0 && (
          <p className="px-1 text-[13px] text-ink-2">
            {blocks.filter(blockDone).length} of {blocks.length} exercises done
          </p>
        )}

        {blocks.length === 0 && !session.quick && (
          <EmptyState
            icon="train"
            title="No exercises in this session yet."
            action={
              editable ? (
                <Button variant="secondary" icon="plus" onClick={() => setPicking(true)}>
                  Add an exercise
                </Button>
              ) : undefined
            }
          />
        )}

        {blocks.map((block) => {
          const exercise = byId.get(block.exerciseId)
          const before = previous?.get(block.exerciseId) ?? []
          const done = block.sets.filter((set) => set.done).length
          const rest = exercise?.rest_seconds ?? settings.default_rest_seconds
          const spare = [...block.sets].reverse().find((set) => !set.done)
          // Every work set last time reached the top of the routine's rep range: time for the next step.
          const top = targets?.find((item) => item.exercise_id === block.exerciseId)?.target_reps_high ?? null
          const lastWork = before.filter((set) => set.kind === 'work' && set.weight_kg)
          const heaviest = lastWork.reduce((max, set) => Math.max(max, set.weight_kg ?? 0), 0)
          const reachedTop = live && top !== null && exercise?.kind === 'weight_reps' && lastWork.length > 0 && lastWork.every((set) => (set.reps ?? 0) >= top)
          const hint = reachedTop ? `All sets reached ${top} reps last time. Next step: ${weightIn(heaviest + (exercise?.increment_kg ?? settings.default_increment_kg), unit)} ${unit}.` : null
          const folded = live && blockDone(block) && !reopened.has(block.position)
          return (
            <Card key={block.position} padded={false} className="flex flex-col gap-2 px-2 py-3">
              <div className="flex items-start gap-2 px-1.5">
                <div className="min-w-0 flex-1">
                  <Link to={`/train/exercise/${block.exerciseId}`} className="block truncate text-[16px] font-semibold text-accent-ink">
                    {exercise?.name ?? 'Exercise'}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                    <Icon name="timer" size={13} />
                    Rest {formatDuration(rest)}
                    {exercise?.equipment === 'dumbbell' && exercise.kind !== 'time' ? ' · both dumbbells together' : ''}
                  </p>
                </div>
                <span className={cx('tnum shrink-0 pt-0.5 text-[13px] font-medium', done === block.sets.length && done > 0 ? 'text-ok' : 'text-ink-2')}>
                  {done} / {block.sets.length}
                </span>
                {live && blockDone(block) && (
                  <IconButton
                    icon={folded ? 'chevron-down' : 'chevron-up'}
                    label={`${folded ? 'Show' : 'Hide'} the sets of ${exercise?.name ?? 'this exercise'}`}
                    aria-expanded={!folded}
                    onClick={() => toggleBlock(block.position)}
                    className="-my-2"
                  />
                )}
              </div>
              {!folded && hint && <p className="px-1.5 text-[12.5px] leading-snug text-ink-2">{hint}</p>}
              {!folded && <div className="flex flex-col gap-1">
                {block.sets.map((set, i) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    exercise={exercise}
                    previous={before.length ? before[Math.min(i, before.length - 1)] : undefined}
                    restSeconds={rest}
                    editable={editable}
                    live={live}
                    heading={i === 0}
                    bestBefore={earlier?.get(block.exerciseId) ?? null}
                  />
                ))}
              </div>}
              {editable && !folded && (
                <div className="flex flex-col gap-1 px-1.5">
                  <Button variant="secondary" icon="plus" block onClick={() => addSetRow(sessionId, block.position, write).catch(fail)}>
                    Add set
                  </Button>
                  <div className="flex justify-between">
                    <Button variant="ghost" size="sm" disabled={!spare} onClick={() => spare && removeSetRow(spare.id!, write).catch(fail)}>
                      Remove a set
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeExerciseBlock(sessionId, block.position, write).catch(fail)}>
                      Remove exercise
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )
        })}

        {editable && !session.quick && blocks.length > 0 && (
          <Button variant="secondary" icon="plus" block onClick={() => setPicking(true)}>
            Add exercise
          </Button>
        )}

        {!live && (
          <Field label="Notes" hint={editable ? 'Saved when you leave the field.' : undefined}>
            <TextArea
              key={sessionId}
              autoGrow
              defaultValue={session.notes}
              disabled={!editable}
              placeholder={editable ? 'How it went' : 'No notes'}
              onBlur={(event) => {
                if (event.target.value.trim() !== session.notes) setSessionNotes(sessionId, event.target.value, write).catch(fail)
              }}
            />
          </Field>
        )}

        {editable && (
          <Button variant="ghost" onClick={() => setDiscarding(true)} className="self-center text-risk">
            {live ? 'Discard this workout' : 'Delete this session'}
          </Button>
        )}
        {!editable && (
          <p className="flex items-center justify-center gap-2 text-[12.5px] text-ink-3">
            <Icon name="lock" size={14} />
            Older than {settings.edit_window_days} days. This session is part of the record and can no longer be changed.
          </p>
        )}
      </div>

      <ExercisePicker
        open={picking}
        exercises={list}
        onClose={() => setPicking(false)}
        onPick={(exerciseId) => {
          setPicking(false)
          addExerciseToSession(sessionId, exerciseId, write).catch(fail)
        }}
      />

      <Modal
        open={finishing}
        onClose={() => setFinishing(false)}
        title="Finish workout"
        size="md"
        footer={
          <Button variant="primary" block size="lg" onClick={finish}>
            Finish workout
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {doneSets.length === 0 && !session.quick && (
            <p className="text-[13.5px] leading-relaxed text-ink-2">No sets are done, so this will not count as a training day. Discard it if it was started by mistake.</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Sets done', String(doneSets.length)],
              ['Volume', `${Math.round(weightIn(volumeLoad(sets), unit)).toLocaleString('en-IN')} ${unit}`],
              ['Time', elapsed ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-control bg-surface-2 p-3">
                <p className="eyebrow">{label}</p>
                <p className="tnum mt-1 text-[17px] font-semibold text-ink">{value}</p>
              </div>
            ))}
          </div>
          {doneSets.length > 0 && <BodyFigures rows={muscleWeek(sets, byId, session.date, session.date)} />}
          {sets.some((set) => !set.done) && (
            <p className="text-[13px] text-ink-3">
              {sets.filter((set) => !set.done).length} planned sets were not done. They will be left out of the record.
            </p>
          )}
          {blocks.some((block) => block.sets.some((set) => set.done)) && (
            <ul className="divide-y divide-line overflow-hidden rounded-control bg-surface-2">
              {blocks
                .filter((block) => block.sets.some((set) => set.done))
                .map((block) => {
                  const top = bestSet(block.sets)
                  const before = bestSet(previous?.get(block.exerciseId) ?? [])
                  return (
                    <li key={block.position} className="flex items-baseline gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{byId.get(block.exerciseId)?.name ?? 'Exercise'}</span>
                      <span className="tnum shrink-0 text-[13px] text-ink-2">
                        {top ? formatSet(top, unit) : '—'}
                        {before && <span className="text-ink-3"> · was {formatSet(before, unit)}</span>}
                      </span>
                    </li>
                  )
                })}
            </ul>
          )}
          <Field label="Notes" hint="Optional.">
            <TextArea autoGrow value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="How it went" />
          </Field>
        </div>
      </Modal>

      <ConfirmationDialog
        open={discarding}
        title={live ? 'Discard this workout?' : 'Delete this session?'}
        body={
          live
            ? 'The session and every set logged in it will be removed. This cannot be undone.'
            : 'The session and its sets will be removed, and that day will no longer count as trained. This cannot be undone.'
        }
        confirmLabel={live ? 'Discard' : 'Delete'}
        tone="danger"
        onConfirm={discard}
        onCancel={() => setDiscarding(false)}
      />
    </Page>
  )
}
