import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { bestSet, e1rm, formatSetLine, isWorkSet, setsByMuscle, volumeLoad } from '../../lib/derive'
import { useExercises, useSetsForSession } from '../../lib/hooks'
import {
  addExerciseToSession,
  addSetRow,
  clearRest,
  completeSet,
  extendRest,
  finishSession,
  lastPerformedSets,
  removeSetRow,
  uncompleteSet,
  updateSet,
} from '../../lib/mutations'
import type { Exercise, Session, SetLog } from '../../lib/types'
import { ExercisePicker } from './ExercisePicker'
import { SetRow } from './SetRow'

const press = 'transition-transform duration-100 active:scale-[0.97] active:bg-accent/12'

/** A short chime when rest ends. Unlocked by the tap that started the timer, so no autoplay
 *  prompt. Deliberately the only alert: an offline web app on iOS cannot notify you once the
 *  screen is locked, so nothing here pretends otherwise. */
function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 660
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.65)
    osc.onended = () => void ctx.close()
  } catch {
    // No audio available: the bar still counts down on screen.
  }
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
}

/** Keeps the screen on while logging. Re-requested on return to the tab, because the lock is
 *  dropped whenever the page is hidden. */
function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let sentinel: { release: () => Promise<void> } | null = null
    let cancelled = false

    const request = async () => {
      try {
        const lock = await (navigator as WakeLockNavigator).wakeLock?.request('screen')
        if (cancelled) void lock?.release()
        else sentinel = lock ?? null
      } catch {
        // Unsupported or refused; nothing to do.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
      sentinel = null
    }
  }, [enabled])
}

function RestBar({ session }: { session: Session }) {
  const [now, setNow] = useState(() => Date.now())
  const chimedFor = useRef<number | null>(null)

  const startedAt = session.rest_started_at
  const seconds = session.rest_seconds ?? 0

  // Derived from timestamps on every tick rather than decremented: a counter drifts, and simply
  // stops while the phone is asleep or the app is in the background.
  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setNow(Date.now()), 500)
    const onVisible = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [startedAt])

  const remaining = startedAt ? Math.ceil((startedAt + seconds * 1000 - now) / 1000) : 0

  useEffect(() => {
    if (!startedAt || remaining > 0) return
    if (chimedFor.current === startedAt) return
    chimedFor.current = startedAt
    playChime()
  }, [startedAt, remaining])

  if (!startedAt) return null

  const over = remaining <= 0
  const pct = over ? 100 : Math.min(100, ((seconds - remaining) / Math.max(1, seconds)) * 100)
  const mins = Math.floor(Math.abs(remaining) / 60)
  const secs = Math.abs(remaining) % 60

  return (
    <div className="flex-none border-b border-ink/14 px-3 py-1.5">
      <div className="flex items-center gap-2">
        <span className="tnum flex-none text-[12px] text-ink/60">
          {over ? 'rest over' : `${mins}:${String(secs).padStart(2, '0')}`}
        </span>
        <div className="h-0.5 min-w-0 flex-1 bg-ink/12">
          <div
            className="h-0.5 bg-accent transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => void extendRest(session.id!, 30)}
          className={`h-8 flex-none cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-2 text-[11px] text-ink/60 ${press}`}
        >
          +30s
        </button>
        <button
          type="button"
          onClick={() => void clearRest(session.id!)}
          aria-label="Skip rest"
          className={`h-8 w-8 flex-none cursor-pointer rounded-[4px] border-0 bg-transparent text-[14px] text-ink/45 ${press}`}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function FinishPanel({
  sets,
  exercisesById,
  previous,
  onCancel,
  onSave,
}: {
  sets: SetLog[]
  exercisesById: Map<number, Exercise>
  previous: Map<number, SetLog[]>
  onCancel: () => void
  onSave: (notes: string) => void
}) {
  const [notes, setNotes] = useState('')
  const done = sets.filter(isWorkSet)
  const byExercise = [...new Set(done.map((s) => s.exercise_id))]
  const muscles = setsByMuscle(done, exercisesById)

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-grain">
      <div className="flex-none border-b border-ink/14 px-4 py-3">
        <div className="font-heading text-[17px]">Finish session</div>
        <div className="mt-0.5 text-[11.5px] text-ink/45">{done.length} work sets</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {byExercise.map((exerciseId) => {
          const exercise = exercisesById.get(exerciseId)
          const mine = done.filter((s) => s.exercise_id === exerciseId)
          const top = bestSet(mine)
          const prev = bestSet(previous.get(exerciseId) ?? [])
          // Stated flatly in both directions: a set that went down reads the same as one that went
          // up. No badge, no arrow, no celebration.
          const comparison =
            prev && prev.weight_kg !== null && prev.reps !== null
              ? `last ${prev.weight_kg} × ${prev.reps}`
              : 'first time'
          return (
            <div
              key={exerciseId}
              className="flex items-baseline gap-2 border-b border-ink/9 px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink/80">
                {exercise?.name ?? 'Exercise'}
              </span>
              <span className="tnum flex-none text-[13px] text-ink">
                {top && top.weight_kg !== null && top.reps !== null
                  ? `${top.weight_kg} × ${top.reps}`
                  : formatSetLine(mine)}
              </span>
              <span className="flex-none text-[11px] text-ink/35">{comparison}</span>
            </div>
          )
        })}

        <div className="px-4 pt-3 text-[11.5px] leading-[1.6] text-ink/45">
          Sets by muscle: {muscles.map((m) => `${m.muscle} ${m.count}`).join(' · ') || '—'}
        </div>
        <div className="px-4 pt-1 text-[11px] text-ink/28">
          Volume load {Math.round(volumeLoad(done)).toLocaleString()} kg
        </div>

        <div className="px-4 pt-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Note (optional) — anything that changes how today compares"
            className="w-full resize-none rounded-[4px] border border-ink/20 bg-transparent p-2 text-[13px] text-ink/80 placeholder:text-ink/28 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-none items-center gap-2 border-t border-ink/14 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className={`min-h-[44px] flex-none cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-4 font-heading text-[14px] text-ink/60 ${press}`}
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onSave(notes)}
          className={`min-h-[44px] flex-1 cursor-pointer rounded-[4px] border border-accent bg-accent px-4 font-heading text-[14px] text-on-accent ${press}`}
        >
          Save session
        </button>
      </div>
    </div>
  )
}

export function SessionView({ session, onExit }: { session: Session; onExit: () => void }) {
  const { sets } = useSetsForSession(session.id!)
  const exercises = useExercises()
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [awake, setAwake] = useState(true)
  const [previous, setPrevious] = useState<Map<number, SetLog[]>>(new Map())

  useWakeLock(awake && !finishing)

  const exercisesById = useMemo(() => new Map(exercises.map((e) => [e.id!, e])), [exercises])

  const blocks = useMemo(() => {
    const byPosition = new Map<number, SetLog[]>()
    for (const s of sets) {
      const list = byPosition.get(s.position)
      if (list) list.push(s)
      else byPosition.set(s.position, [s])
    }
    return [...byPosition.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([position, rows]) => ({
        position,
        exerciseId: rows[0].exercise_id,
        sets: rows.slice().sort((a, b) => a.set_index - b.set_index),
      }))
  }, [sets])

  const exerciseIdsKey = blocks.map((b) => b.exerciseId).join(',')

  // One-shot per exercise, not a live query: "what I did last time" is history and cannot change
  // while this session is being logged.
  useEffect(() => {
    let cancelled = false
    const ids = exerciseIdsKey ? exerciseIdsKey.split(',').map(Number) : []
    Promise.all(
      ids.map((id) => lastPerformedSets(id, session.date).then((rows) => [id, rows] as const)),
    )
      .then((pairs) => {
        if (!cancelled) setPrevious(new Map(pairs))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [exerciseIdsKey, session.date])

  const recentIds = useMemo(() => blocks.map((b) => b.exerciseId), [blocks])

  const handleFinish = useCallback(
    async (notes: string) => {
      await finishSession(session.id!, notes)
      onExit()
    },
    [session.id, onExit],
  )

  const elapsed = session.started_at ? Math.round((Date.now() - session.started_at) / 60000) : 0

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex flex-none items-center justify-between gap-2 border-b border-ink/14 px-4 py-2">
        <div className="min-w-0">
          <div className="truncate font-heading text-[17px]">{session.title}</div>
          <div className="mt-0.5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
            {sets.filter(isWorkSet).length} set{sets.filter(isWorkSet).length === 1 ? '' : 's'} ·{' '}
            {elapsed} min
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAwake((a) => !a)}
          aria-pressed={awake}
          title="Keep the screen awake while logging"
          className={`h-9 flex-none cursor-pointer rounded-[4px] border px-2 text-[10.5px] tracking-[0.06em] uppercase ${press} ${
            awake
              ? 'border-accent/45 bg-transparent text-accent'
              : 'border-ink/20 bg-transparent text-ink/42'
          }`}
        >
          Awake
        </button>
        <button
          type="button"
          onClick={() => setFinishing(true)}
          className={`h-9 flex-none cursor-pointer rounded-[4px] border border-accent bg-transparent px-3 font-heading text-[13px] text-accent ${press}`}
        >
          Finish
        </button>
      </header>

      <RestBar session={session} />

      <div className="min-h-0 flex-1 overflow-auto pb-6">
        {blocks.length === 0 && (
          <div className="px-4 py-6 text-[12px] leading-[1.6] text-ink/35">
            Nothing in this session yet. Add the first exercise below.
          </div>
        )}

        {blocks.map((block) => {
          const exercise = exercisesById.get(block.exerciseId)
          if (!exercise) return null
          const prev = previous.get(block.exerciseId) ?? []
          const lastSet = block.sets[block.sets.length - 1]
          const top = bestSet(block.sets)
          const estimate = top ? e1rm(top.weight_kg, top.reps, top.rir) : null

          return (
            <section key={block.position} className="border-b border-ink/14 pb-2">
              <div className="flex items-baseline justify-between gap-2 px-4 pt-3 pb-1">
                <h2 className="min-w-0 truncate font-heading text-[15px]">{exercise.name}</h2>
                <span className="flex-none text-[10.5px] tracking-[0.06em] text-ink/35 uppercase">
                  {exercise.primary_muscle}
                </span>
              </div>
              <div className="px-4 pb-1.5 text-[11.5px] text-ink/42">
                {prev.length ? `last time  ${formatSetLine(prev)}` : 'first time logged'}
              </div>

              {block.sets.map((set) => (
                <SetRow
                  key={set.id}
                  set={set}
                  exercise={exercise}
                  editable
                  onPatch={(patch) => void updateSet(set.id!, patch)}
                  onComplete={() => void completeSet(set.id!, {}, exercise.rest_seconds)}
                  onUncomplete={() => void uncompleteSet(set.id!)}
                />
              ))}

              <div className="flex items-center gap-2 px-3 pt-2">
                <button
                  type="button"
                  onClick={() => void addSetRow(session.id!, block.exerciseId)}
                  className={`min-h-[36px] cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-3 text-[12px] text-ink/60 ${press}`}
                >
                  + set
                </button>
                {lastSet && (
                  <button
                    type="button"
                    onClick={() => void removeSetRow(lastSet.id!)}
                    className={`min-h-[36px] cursor-pointer rounded-[4px] border border-ink/14 bg-transparent px-3 text-[12px] text-ink/42 ${press}`}
                  >
                    − set
                  </button>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <span className="text-[10.5px] text-ink/35">RIR</span>
                  {[0, 1, 2, 3].map((value) => {
                    const active = lastSet?.rir === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          lastSet && void updateSet(lastSet.id!, { rir: active ? null : value })
                        }
                        aria-pressed={active}
                        className={`h-9 w-9 cursor-pointer rounded-[4px] border text-[12px] ${press} ${
                          active
                            ? 'border-accent bg-accent/12 text-accent'
                            : 'border-ink/14 bg-transparent text-ink/42'
                        }`}
                      >
                        {value === 3 ? '3+' : value}
                      </button>
                    )
                  })}
                </div>
              </div>

              {estimate !== null && (
                <div className="px-4 pt-2 text-[11px] text-ink/28">
                  est. 1RM {Math.round(estimate)} kg
                </div>
              )}
            </section>
          )
        })}

        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className={`flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-accent bg-transparent font-heading text-[14px] text-accent ${press}`}
          >
            <Plus size={16} strokeWidth={2} /> Add exercise
          </button>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          exercises={exercises}
          recentIds={recentIds}
          title="Add exercise"
          onPick={(exercise) => {
            void addExerciseToSession(session.id!, exercise.id!, session.date)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {finishing && (
        <FinishPanel
          sets={sets}
          exercisesById={exercisesById}
          previous={previous}
          onCancel={() => setFinishing(false)}
          onSave={(notes) => void handleFinish(notes)}
        />
      )}
    </div>
  )
}
