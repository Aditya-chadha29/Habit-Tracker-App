import { useMemo, useState } from 'react'
import type { Exercise } from '../../data/types'
import { TextInput } from '../../ui/Field'
import { Modal } from '../../ui/Overlay'
import { MUSCLE_LABEL, MUSCLES } from './labels'

interface ExercisePickerProps {
  open: boolean
  exercises: Exercise[]
  onPick: (exerciseId: number) => void
  onClose: () => void
}

/** Find an exercise by name or muscle. Retired exercises are not offered. */
export function ExercisePicker({ open, exercises, onPick, onClose }: ExercisePickerProps) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const active = exercises.filter(
      (exercise) =>
        !exercise.retired_on &&
        (!needle || exercise.name.toLowerCase().includes(needle) || MUSCLE_LABEL[exercise.primary_muscle].toLowerCase().includes(needle)),
    )
    return MUSCLES.map((muscle) => ({ muscle, items: active.filter((exercise) => exercise.primary_muscle === muscle) })).filter((group) => group.items.length)
  }, [exercises, query])

  return (
    <Modal open={open} onClose={onClose} title="Add an exercise" size="md">
      <TextInput
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name or muscle"
        aria-label="Search exercises"
      />
      <div className="mt-3 flex flex-col gap-4">
        {groups.length === 0 && <p className="py-6 text-center text-[14px] text-ink-3">No exercise matches “{query}”. New ones are added in Train setup.</p>}
        {groups.map((group) => (
          <section key={group.muscle}>
            <h3 className="eyebrow px-1 pb-1">{MUSCLE_LABEL[group.muscle]}</h3>
            <ul className="divide-y divide-line overflow-hidden rounded-control bg-surface-2">
              {group.items.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => onPick(exercise.id!)}
                    className="flex min-h-[48px] w-full cursor-pointer items-center px-3 text-left text-[14.5px] text-ink transition-colors duration-100 hover:bg-surface-3"
                  >
                    {exercise.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
