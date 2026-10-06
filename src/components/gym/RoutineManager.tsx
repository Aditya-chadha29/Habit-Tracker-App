import { useEffect, useState } from 'react'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { WEEKDAY_LABELS_MON_FIRST } from '../../lib/dates'
import { useExercises, useRoutineItems, useRoutines } from '../../lib/hooks'
import { createRoutine, retireRoutine, setRoutineItems, updateRoutine } from '../../lib/mutations'
import type { Exercise } from '../../lib/types'
import { ExercisePicker } from './ExercisePicker'

const press = 'transition-transform duration-100 active:scale-[0.97] active:bg-accent/12'

type Draft = { exercise_id: number; target_sets: number }

/** Editing a routine changes the plan for next time only. Sessions copy their rows at the moment
 *  they start, so nothing here can rewrite a session already logged. */
function RoutineEditor({
  routineId,
  name,
  dayHint,
  exercises,
  onBack,
}: {
  routineId: number
  name: string
  dayHint: number | null
  exercises: Exercise[]
  onBack: () => void
}) {
  const items = useRoutineItems(routineId)
  const [draft, setDraft] = useState<Draft[] | null>(null)
  const [picking, setPicking] = useState(false)

  // The stored items are the source of truth until the first local edit; after that the draft is,
  // so an in-flight save can't bounce a row back under the user's finger.
  useEffect(() => {
    setDraft(null)
  }, [routineId])

  const rows: Draft[] =
    draft ?? items.map((i) => ({ exercise_id: i.exercise_id, target_sets: i.target_sets }))

  const commit = (next: Draft[]) => {
    setDraft(next)
    void setRoutineItems(
      routineId,
      next.map((r) => ({
        exercise_id: r.exercise_id,
        target_sets: r.target_sets,
        target_reps_low: null,
        target_reps_high: null,
      })),
    )
  }

  const byId = new Map(exercises.map((e) => [e.id!, e]))

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-grain">
      <div className="flex flex-none items-center gap-2 border-b border-ink/14 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to routines"
          className={`flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent text-accent ${press}`}
        >
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-[16px]">{name}</div>
          <div className="text-[10.5px] text-ink/42">
            {dayHint ? `Suggested on ${WEEKDAY_LABELS_MON_FIRST[dayHint - 1]}` : 'No set day'}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-ink/35">
            No exercises yet. Add them in the order you train them.
          </div>
        )}

        {rows.map((row, index) => {
          const exercise = byId.get(row.exercise_id)
          return (
            <div
              key={`${row.exercise_id}-${index}`}
              className="flex items-center gap-2 border-b border-ink/9 px-4 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink/80">
                {exercise?.name ?? 'Exercise'}
              </span>
              <div className="flex flex-none items-center gap-1">
                <button
                  type="button"
                  aria-label="Fewer sets"
                  onClick={() =>
                    commit(
                      rows.map((r, i) =>
                        i === index ? { ...r, target_sets: Math.max(1, r.target_sets - 1) } : r,
                      ),
                    )
                  }
                  className={`h-9 w-9 cursor-pointer rounded-[4px] border border-ink/20 bg-transparent text-ink/60 ${press}`}
                >
                  −
                </button>
                <span className="tnum w-12 text-center text-[12px] text-ink/60">
                  {row.target_sets} sets
                </span>
                <button
                  type="button"
                  aria-label="More sets"
                  onClick={() =>
                    commit(
                      rows.map((r, i) => (i === index ? { ...r, target_sets: r.target_sets + 1 } : r)),
                    )
                  }
                  className={`h-9 w-9 cursor-pointer rounded-[4px] border border-ink/20 bg-transparent text-ink/60 ${press}`}
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${exercise?.name ?? 'exercise'}`}
                  onClick={() => commit(rows.filter((_, i) => i !== index))}
                  className={`h-9 w-9 cursor-pointer rounded-[4px] border-0 bg-transparent text-ink/35 ${press}`}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
          )
        })}

        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className={`flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-accent bg-transparent font-heading text-[14px] text-accent ${press}`}
          >
            <Plus size={16} strokeWidth={2} /> Add exercise
          </button>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          exercises={exercises}
          recentIds={rows.map((r) => r.exercise_id)}
          title="Add to routine"
          onPick={(exercise) => {
            commit([...rows, { exercise_id: exercise.id!, target_sets: 3 }])
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}

export function RoutineManager({ onClose }: { onClose: () => void }) {
  const routines = useRoutines()
  const exercises = useExercises()
  const [editing, setEditing] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [newDay, setNewDay] = useState<number | null>(null)

  const active = routines.filter((r) => !r.retired_on)
  const current = active.find((r) => r.id === editing)

  if (current) {
    return (
      <RoutineEditor
        routineId={current.id!}
        name={current.name}
        dayHint={current.day_hint}
        exercises={exercises}
        onBack={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-grain">
      <div className="flex flex-none items-center justify-between border-b border-ink/14 px-4 py-2">
        <div className="font-heading text-[16px]">Routines</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close routines"
          className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent text-ink/60 ${press}`}
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {active.length === 0 && (
          <div className="px-4 py-5 text-[12px] leading-[1.6] text-ink/35">
            None yet. A routine is just a running order — Push A, Pull A, Legs. Give it a weekday
            and it offers itself on that day; you can always start a free session instead.
          </div>
        )}

        {active.map((routine) => (
          <div key={routine.id} className="flex items-center gap-2 border-b border-ink/9 px-4 py-2">
            <button
              type="button"
              onClick={() => setEditing(routine.id!)}
              className={`min-w-0 flex-1 cursor-pointer border-0 bg-transparent py-1 text-left ${press}`}
            >
              <span className="block truncate text-[14px] text-ink/80">{routine.name}</span>
              <span className="block text-[10.5px] text-ink/42">
                {routine.day_hint ? WEEKDAY_LABELS_MON_FIRST[routine.day_hint - 1] : 'No set day'}
              </span>
            </button>
            <select
              value={routine.day_hint ?? ''}
              onChange={(e) =>
                void updateRoutine(routine.id!, {
                  day_hint: e.target.value ? Number(e.target.value) : null,
                })
              }
              aria-label={`Day for ${routine.name}`}
              className="h-9 flex-none rounded-[4px] border border-ink/20 bg-transparent px-1 text-[12px] text-ink/60"
            >
              <option value="">—</option>
              {WEEKDAY_LABELS_MON_FIRST.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void retireRoutine(routine.id!)}
              aria-label={`Retire ${routine.name}`}
              className={`h-9 flex-none cursor-pointer rounded-[4px] border border-ink/14 bg-transparent px-2 text-[11px] text-ink/42 ${press}`}
            >
              Retire
            </button>
          </div>
        ))}

        <div className="px-4 py-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New routine name"
            className="w-full rounded-[4px] border border-ink/20 bg-transparent px-3 py-2 text-[14px] text-ink placeholder:text-ink/35 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <select
              value={newDay ?? ''}
              onChange={(e) => setNewDay(e.target.value ? Number(e.target.value) : null)}
              aria-label="Day for the new routine"
              className="h-11 flex-none rounded-[4px] border border-ink/20 bg-transparent px-2 text-[13px] text-ink/60"
            >
              <option value="">No day</option>
              {WEEKDAY_LABELS_MON_FIRST.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!newName.trim()}
              onClick={async () => {
                const id = await createRoutine(newName, newDay)
                setNewName('')
                setNewDay(null)
                if (id) setEditing(id)
              }}
              className={`min-h-[44px] flex-1 cursor-pointer rounded-[4px] border border-accent bg-transparent font-heading text-[14px] text-accent disabled:opacity-40 ${press}`}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
