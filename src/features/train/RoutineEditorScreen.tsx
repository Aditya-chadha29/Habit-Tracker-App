import { useEffect, useState } from 'react'
import { goBack, navigate, type RouteProps } from '../../app/router'
import { db } from '../../data/db'
import { createRoutine, retireRoutine, setRoutineItems, updateRoutine, type RoutineItemInput } from '../../data/workoutRepo'
import { useCore } from '../../state/core'
import { Button, IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Stepper, TextInput, WeekdayPicker } from '../../ui/Field'
import { ConfirmationDialog } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { ExercisePicker } from './ExercisePicker'
import { useExercises } from './hooks'
import { MUSCLE_LABEL } from './labels'

interface Draft {
  name: string
  weekdays: number[]
  items: RoutineItemInput[]
}

/**
 * A routine: its name, the days the programme suggests it, and its exercises in order with a
 * target number of sets. Changes are kept as a draft and written together on Save, so a routine
 * is never left half-edited.
 */
export default function RoutineEditorScreen({ params }: RouteProps) {
  const isNew = params.id === 'new'
  const routineId = isNew ? null : Number(params.id)
  const { today } = useCore()
  const toast = useToast()
  const { list, byId } = useExercises()
  const [draft, setDraft] = useState<Draft | null>(isNew ? { name: '', weekdays: [], items: [] } : null)
  const [missing, setMissing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [retiring, setRetiring] = useState(false)
  const [error, setError] = useState('')

  // Loaded once per routine, not live: a live value would overwrite the draft while it is edited.
  useEffect(() => {
    if (routineId === null) return
    let cancelled = false
    void (async () => {
      const routine = await db.routines.get(routineId)
      const items = await db.routine_items.where('routine_id').equals(routineId).sortBy('position')
      if (cancelled) return
      if (!routine) {
        setMissing(true)
        return
      }
      setDraft({
        name: routine.name,
        weekdays: routine.weekdays ?? [],
        items: items.map((item) => ({ exercise_id: item.exercise_id, target_sets: item.target_sets, target_reps_low: item.target_reps_low, target_reps_high: item.target_reps_high })),
      })
    })()
    return () => {
      cancelled = true
    }
  }, [routineId])

  if (missing) {
    return (
      <Page title="Routine" back="/train/setup">
        <EmptyState title="That routine does not exist." />
      </Page>
    )
  }
  if (!draft) return <Page title="Routine" back="/train/setup">{null}</Page>

  const move = (index: number, by: number) => {
    const target = index + by
    if (target < 0 || target >= draft.items.length) return
    const items = [...draft.items]
    ;[items[index], items[target]] = [items[target], items[index]]
    setDraft({ ...draft, items })
  }

  const save = async () => {
    try {
      let id = routineId
      if (id === null) id = await createRoutine(draft.name, draft.weekdays)
      else await updateRoutine(id, { name: draft.name, weekdays: draft.weekdays })
      await setRoutineItems(id, draft.items)
      toast.show('Routine saved.', { tone: 'ok' })
      goBack('/train/setup')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.')
    }
  }

  return (
    <Page
      title={isNew ? 'New routine' : draft.name || 'Routine'}
      back="/train/setup"
      width="narrow"
      actions={
        <Button variant="primary" size="sm" onClick={save}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" error={error || undefined}>
          <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Chest + Triceps" maxLength={60} />
        </Field>
        <Field label="Days in the weekly programme" hint="Optional. On these days Train offers this routine first.">
          <WeekdayPicker label="Programme days" value={draft.weekdays} onChange={(weekdays) => setDraft({ ...draft, weekdays })} />
        </Field>

        <section className="flex flex-col gap-2">
          <SectionTitle>Exercises · {draft.items.length}</SectionTitle>
          {draft.items.length === 0 ? (
            <EmptyState title="No exercises yet." body="Add them in the order you do them." />
          ) : (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {draft.items.map((item, index) => {
                const exercise = byId.get(item.exercise_id)
                return (
                  <div key={`${item.exercise_id}-${index}`} className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <span className="tnum w-5 shrink-0 text-center text-[12.5px] text-ink-3">{index + 1}</span>
                      <span className="min-w-0 flex-1 pl-1">
                        <span className="block truncate text-[14.5px] text-ink">{exercise?.name ?? 'Removed exercise'}</span>
                        {exercise && <span className="block text-[12.5px] text-ink-3">{MUSCLE_LABEL[exercise.primary_muscle]}</span>}
                      </span>
                      <IconButton icon="chevron-up" size="sm" label={`Move ${exercise?.name ?? 'exercise'} up`} disabled={index === 0} onClick={() => move(index, -1)} />
                      <IconButton icon="chevron-down" size="sm" label={`Move ${exercise?.name ?? 'exercise'} down`} disabled={index === draft.items.length - 1} onClick={() => move(index, 1)} />
                      <IconButton
                        icon="close"
                        size="sm"
                        label={`Remove ${exercise?.name ?? 'exercise'} from the routine`}
                        onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-3 pl-6">
                      <span className="text-[12.5px] text-ink-3">Sets</span>
                      <Stepper
                        label={`Target sets for ${exercise?.name ?? 'exercise'}`}
                        value={item.target_sets}
                        min={1}
                        max={12}
                        onChange={(value) => setDraft({ ...draft, items: draft.items.map((it, i) => (i === index ? { ...it, target_sets: value } : it)) })}
                        className="w-[150px]"
                      />
                    </div>
                  </div>
                )
              })}
            </Card>
          )}
          <Button variant="secondary" icon="plus" onClick={() => setPicking(true)}>
            Add an exercise
          </Button>
        </section>

        <p className="text-[12.5px] leading-relaxed text-ink-3">
          Changing a routine never changes a workout that was already logged: a session copies the routine when it starts.
        </p>

        {routineId !== null && (
          <Button variant="ghost" onClick={() => setRetiring(true)} className="self-center text-risk">
            Retire this routine
          </Button>
        )}
      </div>

      <ExercisePicker
        open={picking}
        exercises={list}
        onClose={() => setPicking(false)}
        onPick={(exerciseId) => {
          setPicking(false)
          setDraft({ ...draft, items: [...draft.items, { exercise_id: exerciseId, target_sets: 3, target_reps_low: null, target_reps_high: null }] })
        }}
      />
      <ConfirmationDialog
        open={retiring}
        title="Retire this routine?"
        body="It leaves the programme and the list of routines. Every session already logged with it stays exactly as it is, and it can be restored from Training setup."
        confirmLabel="Retire"
        onCancel={() => setRetiring(false)}
        onConfirm={async () => {
          if (routineId !== null) await retireRoutine(routineId, today)
          navigate('/train/setup', { replace: true })
        }}
      />
    </Page>
  )
}
