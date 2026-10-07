import { useMemo, useState } from 'react'
import { goBack, navigate, type RouteProps } from '../../app/router'
import { db } from '../../data/db'
import { createDayRoutine, newStepKey, setDayRoutineRetired, updateDayRoutine } from '../../data/routineRepo'
import type { DayRoutine, RoutineSlot, RoutineStep } from '../../data/types'
import { describeFrequency } from '../../engine/describe'
import { currentVersion, isRetired } from '../../engine/timeline'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'
import { Button, IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Select, TextInput } from '../../ui/Field'
import { ConfirmationDialog, Modal } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { SLOT_OPTIONS } from './labels'

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function Editor({ routine }: { routine: DayRoutine | null }) {
  const { today, habits } = useCore()
  const toast = useToast()
  const [name, setName] = useState(routine?.name ?? '')
  const [slot, setSlot] = useState<RoutineSlot>(routine?.slot ?? 'morning')
  const [steps, setSteps] = useState<RoutineStep[]>(() => routine?.steps.map((step) => ({ ...step })) ?? [])
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const [retiring, setRetiring] = useState(false)
  const byId = useMemo(() => new Map(habits.map((habit) => [habit.id!, habit])), [habits])

  const choices = useMemo(() => {
    const used = new Set(steps.map((step) => step.habit_id))
    const words = search.trim().toLowerCase()
    return habits.filter((habit) => !isRetired(habit) && !used.has(habit.id!) && (!words || habit.name.toLowerCase().includes(words)))
  }, [habits, steps, search])

  const patchStep = (key: string, patch: Partial<RoutineStep>) => setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...patch } : step)))
  const addStep = (habitId: number | null) =>
    setSteps((current) => [...current, { key: newStepKey(), habit_id: habitId, label: '', time: '', minutes: null, note: '' }])

  const save = async () => {
    try {
      if (!name.trim()) throw new Error('Give the routine a name.')
      if (routine) await updateDayRoutine(routine.id!, { name, slot, steps })
      else await createDayRoutine(name, slot, steps)
      toast.show('Saved.', { tone: 'ok' })
      goBack('/routines')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.')
    }
  }

  return (
    <Page
      title={routine ? routine.name : 'New routine'}
      subtitle="How Today is laid out"
      back="/routines"
      width="narrow"
      actions={
        <Button variant="primary" size="sm" onClick={save}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {error && (
          <p role="alert" className="rounded-control bg-risk/12 px-3 py-2.5 text-[13.5px] text-risk">
            {error}
          </p>
        )}

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Morning routine" />
          </Field>
          <Field label="Part of the day" hint="Morning routines come first on Today, evening ones last.">
            <Select value={slot} onChange={(event) => setSlot(event.target.value as RoutineSlot)}>
              {SLOT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>
            Steps · {steps.length}
          </SectionTitle>
          {steps.length === 0 ? (
            <Card className="text-[13.5px] text-ink-3">No steps yet. Add the habits you do in this part of the day, in order.</Card>
          ) : (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {steps.map((step, i) => {
                const habit = step.habit_id === null ? null : byId.get(step.habit_id)
                const title = habit ? habit.name : step.habit_id === null ? step.label || 'Reminder' : 'A habit that no longer exists'
                return (
                  <div key={step.key} className="flex flex-col gap-2 py-2.5 pr-1 pl-4">
                    <div className="flex items-center gap-1">
                      <span className="tnum w-5 shrink-0 text-[12px] text-ink-3">{i + 1}</span>
                      {step.habit_id === null ? (
                        <TextInput
                          aria-label={`Reminder ${i + 1}`}
                          value={step.label}
                          onChange={(event) => patchStep(step.key, { label: event.target.value })}
                          maxLength={60}
                          placeholder="Leave for work"
                          className="min-w-0 flex-1"
                        />
                      ) : (
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] text-ink">{title}</span>
                          {habit && <span className="block truncate text-[12.5px] text-ink-3">{isRetired(habit) ? 'Retired — not shown on Today' : describeFrequency(currentVersion(habit))}</span>}
                        </span>
                      )}
                      <IconButton icon="chevron-up" label={`Move ${title} up`} size="sm" variant="ghost" disabled={i === 0} onClick={() => setSteps((current) => move(current, i, i - 1))} />
                      <IconButton
                        icon="chevron-down"
                        label={`Move ${title} down`}
                        size="sm"
                        variant="ghost"
                        disabled={i === steps.length - 1}
                        onClick={() => setSteps((current) => move(current, i, i + 1))}
                      />
                      <IconButton icon="close" label={`Remove ${title} from this routine`} size="sm" variant="ghost" onClick={() => setSteps((current) => current.filter((s) => s.key !== step.key))} />
                    </div>
                    <label className="flex items-center gap-2 pl-6 text-[12.5px] text-ink-3">
                      Around
                      <input
                        type="time"
                        value={step.time}
                        onChange={(event) => patchStep(step.key, { time: event.target.value })}
                        className="h-9 rounded-control bg-surface-2 px-2 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)]"
                      />
                      {step.time && (
                        <button type="button" className="cursor-pointer text-accent-ink underline-offset-2 hover:underline" onClick={() => patchStep(step.key, { time: '' })}>
                          No time
                        </button>
                      )}
                    </label>
                    <div className="flex items-center gap-2 pl-6">
                      <TextInput
                        aria-label={`Minutes for ${title}`}
                        inputMode="numeric"
                        value={step.minutes === null ? '' : String(step.minutes)}
                        onChange={(event) => {
                          const minutes = Number(event.target.value.replace(/[^0-9]/g, ''))
                          patchStep(step.key, { minutes: minutes > 0 ? Math.min(minutes, 600) : null })
                        }}
                        placeholder="min"
                        className="h-9 w-[68px] shrink-0 text-[13px]"
                      />
                      <TextInput
                        aria-label={`Note for ${title}`}
                        value={step.note}
                        onChange={(event) => patchStep(step.key, { note: event.target.value })}
                        maxLength={80}
                        placeholder="Note (optional)"
                        className="h-9 min-w-0 flex-1 text-[13px]"
                      />
                    </div>
                  </div>
                )
              })}
            </Card>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" icon="plus" onClick={() => setPicking(true)}>
              Add a habit
            </Button>
            <Button variant="ghost" icon="plus" onClick={() => addStep(null)}>
              Add a reminder line
            </Button>
          </div>
        </section>

        {routine && (
          <div className="flex justify-center">
            {routine.retired_on === null ? (
              <Button variant="secondary" onClick={() => setRetiring(true)}>
                Retire this routine
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() =>
                  setDayRoutineRetired(routine.id!, null)
                    .then(() => navigate('/routines', { replace: true }))
                    .catch(() => toast.show('That could not be restored.', { tone: 'risk' }))
                }
              >
                Restore this routine
              </Button>
            )}
          </div>
        )}
      </div>

      <Modal
        open={picking}
        onClose={() => {
          setPicking(false)
          setSearch('')
        }}
        title="Add a habit"
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <TextInput aria-label="Search habits" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
          {choices.length === 0 ? (
            <p className="py-4 text-center text-[13.5px] text-ink-3">{search.trim() ? 'No habit matches.' : 'Every active habit is already in this routine.'}</p>
          ) : (
            <ul className="-mx-1 flex max-h-[50vh] flex-col overflow-y-auto">
              {choices.map((habit) => (
                <li key={habit.id}>
                  <button
                    type="button"
                    onClick={() => addStep(habit.id!)}
                    className="flex min-h-[48px] w-full cursor-pointer flex-col justify-center rounded-control px-3 py-1.5 text-left transition-colors duration-100 hover:bg-surface-2"
                  >
                    <span className="truncate text-[14.5px] text-ink">{habit.name}</span>
                    <span className="truncate text-[12.5px] text-ink-3">{describeFrequency(currentVersion(habit))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <ConfirmationDialog
        open={retiring}
        title={`Retire ${routine?.name ?? ''}?`}
        body="Its habits stay exactly as they are and move to their pillar groups on Today. The routine can be restored at any time."
        confirmLabel="Retire"
        onCancel={() => setRetiring(false)}
        onConfirm={() => {
          setRetiring(false)
          if (!routine) return
          setDayRoutineRetired(routine.id!, today)
            .then(() => navigate('/routines', { replace: true }))
            .catch(() => toast.show('That could not be retired.', { tone: 'risk' }))
        }}
      />
    </Page>
  )
}

/** Create a routine (`/routines/new`) or change one. Kept as a draft and written on Save. */
export default function RoutineEditorScreen({ params }: RouteProps) {
  const isNew = params.id === 'new'
  const { data, loaded } = useKeyedLiveQuery(isNew ? -1 : Number(params.id), (id) => (id < 0 ? Promise.resolve(undefined) : db.day_routines.get(id)))
  if (isNew) return <Editor key="new" routine={null} />
  if (!loaded) return <Page title="Routine" back="/routines">{null}</Page>
  if (!data) {
    return (
      <Page title="Routine" back="/routines">
        <EmptyState title="That routine does not exist." />
      </Page>
    )
  }
  return <Editor key={data.id} routine={data} />
}
