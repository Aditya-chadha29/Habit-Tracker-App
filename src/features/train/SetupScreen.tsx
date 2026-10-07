import { useMemo, useState } from 'react'
import { Link, navigate, useQueryState } from '../../app/router'
import type { Exercise } from '../../data/types'
import { addExercise, restoreExercise, restoreRoutine, retireExercise, setProgrammeDay, updateExercise, type ExerciseInput } from '../../data/workoutRepo'
import { WEEKDAY_LONG, WEEKDAY_SHORT } from '../../engine/dates'
import { useCore } from '../../state/core'
import { Button } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Select, Stepper, TextInput } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { Drawer, Modal } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'
import { Tick } from '../../ui/Tick'
import { useToast } from '../../ui/Toast'
import { useExercises, useRoutines, useRoutineSizes } from './hooks'
import { EQUIPMENT, EQUIPMENT_LABEL, KIND_LABEL, KINDS, MUSCLE_LABEL, MUSCLES } from './labels'

const TABS = [
  { id: 'routines', label: 'Routines' },
  { id: 'exercises', label: 'Exercises' },
  { id: 'programme', label: 'Programme' },
] as const

type TabId = (typeof TABS)[number]['id']

const BLANK: ExerciseInput = { name: '', primary_muscle: 'chest', equipment: 'barbell', kind: 'weight_reps', increment_kg: 2.5, rest_seconds: 120, notes: '' }

function ExerciseEditor({ exercise, onClose }: { exercise: Exercise | 'new'; onClose: () => void }) {
  const { today } = useCore()
  const toast = useToast()
  const existing = exercise === 'new' ? null : exercise
  const [form, setForm] = useState<ExerciseInput>(
    existing
      ? { name: existing.name, primary_muscle: existing.primary_muscle, equipment: existing.equipment, kind: existing.kind, increment_kg: existing.increment_kg, rest_seconds: existing.rest_seconds, notes: existing.notes }
      : BLANK,
  )
  const [error, setError] = useState('')

  const save = async () => {
    try {
      if (existing) await updateExercise(existing.id!, form)
      else await addExercise(form)
      onClose()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.')
    }
  }

  const toggleRetired = async () => {
    if (!existing) return
    if (existing.retired_on) await restoreExercise(existing.id!)
    else await retireExercise(existing.id!, today)
    toast.show(existing.retired_on ? `${existing.name} restored.` : `${existing.name} retired. Its history is kept.`)
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={existing ? 'Edit exercise' : 'New exercise'}
      footer={
        <>
          {existing && (
            <Button variant="ghost" onClick={toggleRetired}>
              {existing.retired_on ? 'Restore' : 'Retire'}
            </Button>
          )}
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" error={error || undefined}>
          <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={60} />
        </Field>
        <Field label="Main muscle">
          <Select value={form.primary_muscle} onChange={(event) => setForm({ ...form, primary_muscle: event.target.value as ExerciseInput['primary_muscle'] })}>
            {MUSCLES.map((muscle) => (
              <option key={muscle} value={muscle}>
                {MUSCLE_LABEL[muscle]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Equipment">
          <Select value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value as ExerciseInput['equipment'] })}>
            {EQUIPMENT.map((item) => (
              <option key={item} value={item}>
                {EQUIPMENT_LABEL[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What a set records">
          <Select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as ExerciseInput['kind'] })}>
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Weight step" hint="How much the plus and minus buttons change the weight.">
          <Stepper label="Weight step in kilograms" value={form.increment_kg} onChange={(value) => setForm({ ...form, increment_kg: value })} step={0.5} min={0.5} max={20} unit="kg" />
        </Field>
        <Field label="Rest between sets" hint="Starts counting when a set is marked done.">
          <Stepper label="Rest in seconds" value={form.rest_seconds ?? 0} onChange={(value) => setForm({ ...form, rest_seconds: value })} step={15} min={0} max={600} unit="s" />
        </Field>
      </div>
    </Drawer>
  )
}

/** Routines, the exercise library and the weekly programme. Everything here is the owner's to
 *  change; nothing about training is fixed in code. */
export default function SetupScreen() {
  const [rawTab, setTab] = useQueryState('tab', 'routines')
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : 'routines'
  const routines = useRoutines()
  const sizes = useRoutineSizes()
  const { list: exercises } = useExercises()
  const toast = useToast()
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const [programmeDay, setProgrammeDayOpen] = useState<number | null>(null)

  const active = routines.filter((routine) => !routine.retired_on)
  const retired = routines.filter((routine) => routine.retired_on)
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matching = exercises.filter((exercise) => !needle || exercise.name.toLowerCase().includes(needle) || MUSCLE_LABEL[exercise.primary_muscle].toLowerCase().includes(needle))
    return MUSCLES.map((muscle) => ({ muscle, items: matching.filter((exercise) => exercise.primary_muscle === muscle) })).filter((group) => group.items.length)
  }, [exercises, query])

  return (
    <Page
      title="Training setup"
      subtitle="Routines, exercises and the weekly programme"
      back="/train"
      width="default"
      tabs={<Segmented options={TABS} value={tab} onChange={setTab} label="Setup section" block />}
    >
      {tab === 'routines' && (
        <div className="flex flex-col gap-5">
          <Button variant="primary" icon="plus" onClick={() => navigate('/train/setup/routine/new')} className="self-start">
            New routine
          </Button>
          {active.length === 0 ? (
            <EmptyState icon="train" title="No routines yet." body="A routine is a reusable workout: a name and a list of exercises." />
          ) : (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {active.map((routine) => (
                <Link
                  key={routine.id}
                  to={`/train/setup/routine/${routine.id}`}
                  className="flex min-h-[60px] items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-ink">{routine.name}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                      {sizes.get(routine.id!) ?? 0} exercises
                      {(routine.weekdays ?? []).length > 0 ? ` · ${(routine.weekdays ?? []).map((day) => WEEKDAY_SHORT[day]).join(', ')}` : ' · not in the programme'}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={17} className="shrink-0 text-ink-3" />
                </Link>
              ))}
            </Card>
          )}
          {retired.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionTitle>Retired</SectionTitle>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {retired.map((routine) => (
                  <div key={routine.id} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink-2">{routine.name}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        await restoreRoutine(routine.id!)
                        toast.show(`${routine.name} restored.`)
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>
      )}

      {tab === 'exercises' && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or muscle" aria-label="Search exercises" />
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              New
            </Button>
          </div>
          {groups.length === 0 && <EmptyState title="No exercise matches." body="Add it with New." />}
          {groups.map((group) => (
            <section key={group.muscle} className="flex flex-col gap-2">
              <SectionTitle>
                {MUSCLE_LABEL[group.muscle]} · {group.items.length}
              </SectionTitle>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {group.items.map((exercise) => (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={() => setEditing(exercise)}
                    className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={exercise.retired_on ? 'block truncate text-[14.5px] text-ink-3' : 'block truncate text-[14.5px] text-ink'}>{exercise.name}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                        {EQUIPMENT_LABEL[exercise.equipment]} · step {exercise.increment_kg} kg{exercise.retired_on ? ' · retired' : ''}
                      </span>
                    </span>
                    <Icon name="edit" size={15} className="shrink-0 text-ink-3" />
                  </button>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      {tab === 'programme' && (
        <div className="flex flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-ink-3">
            The programme is a suggestion for each day of the week. It decides what Train offers first; any routine can still be started on any day.
          </p>
          <Card padded={false} className="divide-y divide-line overflow-hidden">
            {WEEKDAY_LONG.map((name, weekday) => {
              const planned = active.filter((routine) => (routine.weekdays ?? []).includes(weekday))
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setProgrammeDayOpen(weekday)}
                  className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
                >
                  <span className="w-24 shrink-0 text-[13.5px] font-medium text-ink-2">{name}</span>
                  <span className={planned.length ? 'min-w-0 flex-1 truncate text-[14.5px] text-ink' : 'min-w-0 flex-1 truncate text-[14.5px] text-ink-3'}>
                    {planned.length ? planned.map((routine) => routine.name).join(' + ') : 'Nothing scheduled'}
                  </span>
                  <Icon name="edit" size={15} className="shrink-0 text-ink-3" />
                </button>
              )
            })}
          </Card>
        </div>
      )}

      {editing && <ExerciseEditor exercise={editing} onClose={() => setEditing(null)} />}

      <Modal open={programmeDay !== null} onClose={() => setProgrammeDayOpen(null)} title={programmeDay !== null ? WEEKDAY_LONG[programmeDay] : ''} size="sm">
        {programmeDay !== null && (
          <ul className="divide-y divide-line overflow-hidden rounded-control bg-surface-2">
            {active.length === 0 && <li className="px-3 py-4 text-[14px] text-ink-3">No routines yet.</li>}
            {active.map((routine) => {
              const on = (routine.weekdays ?? []).includes(programmeDay)
              const planned = active.filter((r) => (r.weekdays ?? []).includes(programmeDay)).map((r) => r.id!)
              return (
                <li key={routine.id} className="flex min-h-[52px] items-center gap-3 pr-1 pl-3">
                  <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{routine.name}</span>
                  <Tick
                    checked={on}
                    label={`${routine.name} on ${WEEKDAY_LONG[programmeDay]}`}
                    onChange={(next) => void setProgrammeDay(programmeDay, next ? [...planned, routine.id!] : planned.filter((id) => id !== routine.id))}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </Modal>
    </Page>
  )
}
