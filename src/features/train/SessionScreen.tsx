import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, navigate, type RouteProps } from '../../app/router'
import { db } from '../../data/db'
import type { SetLog } from '../../data/types'
import {
  addExerciseToSession, addSetRow, clearRest, deleteSession, extendRest, finishSession, lastPerformedSets,
  removeExerciseBlock, setSessionNotes,
} from '../../data/workoutRepo'
import { formatMediumDate } from '../../engine/dates'
import { isEditable } from '../../engine/lock'
import { bestSet, formatDuration, formatSet, formatSetLine, isWorkSet, sessionMinutes, volumeLoad } from '../../engine/training'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'
import { Button } from '../../ui/Button'
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

  const live = !!session && session.ended_at === null
  const now = useNow(live)
  const awake = useWakeLock(live)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [notes, setNotes] = useState('')
  const buzzed = useRef<number | null>(null)

  // Opens the first block that still has sets to do; once the user opens another, that wins.
  const firstOpen = blocks.find((block) => block.sets.some((set) => !set.done))?.position ?? blocks[0]?.position ?? null
  const openPosition = expanded ?? firstOpen

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
            {elapsed && (
              <span role="timer" aria-label={`Elapsed ${elapsed}`} className="tnum px-1 text-[17px] font-semibold text-ok">
                {elapsed}
              </span>
            )}
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

        {!live && !session.quick && doneSets.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Sets', String(doneSets.length)],
              ['Volume', `${Math.round(volumeLoad(sets)).toLocaleString('en-IN')} kg`],
              ['Time', minutes !== null ? `${minutes} min` : '—'],
            ].map(([label, value]) => (
              <Card key={label} className="p-3">
                <p className="eyebrow">{label}</p>
                <p className="tnum mt-1 text-[17px] font-semibold text-ink">{value}</p>
              </Card>
            ))}
          </div>
        )}

        {blocks.length === 0 && !session.quick && (
          <EmptyState
            icon="train"
            title="No exercises in this session yet."
            action={
              editable ? (
                <Button variant="primary" icon="plus" onClick={() => setPicking(true)}>
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
          const open = openPosition === block.position
          const rest = exercise?.rest_seconds ?? settings.default_rest_seconds
          return (
            <Card key={block.position} padded={false} className="overflow-hidden">
              <div className="flex items-stretch">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? -1 : block.position)}
                  className="flex min-h-[60px] min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pr-2 pl-4 text-left transition-colors duration-100 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{exercise?.name ?? 'Exercise'}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                      {before.length ? `Last time: ${formatSetLine(before)}` : 'First time logging this exercise'}
                    </span>
                  </span>
                  <span className={cx('tnum shrink-0 text-[13px] font-medium', done === block.sets.length && done > 0 ? 'text-ok' : 'text-ink-2')}>
                    {done} / {block.sets.length}
                  </span>
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={17} className="shrink-0 text-ink-3" />
                </button>
                <Link
                  to={`/train/exercise/${block.exerciseId}`}
                  aria-label={`History of ${exercise?.name ?? 'this exercise'}`}
                  title="Exercise history"
                  className="flex w-11 shrink-0 items-center justify-center text-ink-3 transition-colors duration-100 hover:bg-surface-2 hover:text-ink"
                >
                  <Icon name="history" size={17} />
                </Link>
              </div>
              {open && (
                <div className="border-t border-line px-2 pt-1 pb-2">
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
                    />
                  ))}
                  {editable && (
                    <div className="mt-1 flex gap-2 pl-6">
                      <Button variant="secondary" size="sm" icon="plus" onClick={() => addSetRow(sessionId, block.position, write).catch(fail)}>
                        Add set
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeExerciseBlock(sessionId, block.position, write).catch(fail)}>
                        Remove exercise
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}

        {editable && !session.quick && blocks.length > 0 && (
          <Button variant="secondary" icon="plus" onClick={() => setPicking(true)}>
            Add an exercise
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
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Sets done', String(doneSets.length)],
              ['Volume', `${Math.round(volumeLoad(sets)).toLocaleString('en-IN')} kg`],
              ['Time', elapsed ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-control bg-surface-2 p-3">
                <p className="eyebrow">{label}</p>
                <p className="tnum mt-1 text-[17px] font-semibold text-ink">{value}</p>
              </div>
            ))}
          </div>
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
                        {top ? formatSet(top) : '—'}
                        {before && <span className="text-ink-3"> · was {formatSet(before)}</span>}
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
