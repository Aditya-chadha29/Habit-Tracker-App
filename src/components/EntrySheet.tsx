import { useState } from 'react'
import { db } from '../data/db'
import { annotateEntry, setHabitDone } from '../data/habitRepo'
import type { DateStr, Habit } from '../data/types'
import { clockHHMM, formatMediumDate } from '../engine/dates'
import { nameOn } from '../engine/timeline'
import { useCore } from '../state/core'
import { useKeyedLiveQuery } from '../state/live'
import { Button } from '../ui/Button'
import { Field, Stepper, TextInput } from '../ui/Field'
import { Modal } from '../ui/Overlay'
import { useToast } from '../ui/Toast'

const STEP: Record<string, number> = { count: 1, duration: 5, numeric: 0.5, quantity: 1 }

/**
 * The detail behind a tick, for a habit that records more than done / not done: how many reps,
 * how many minutes, and an optional note.
 */
export function EntrySheet({ habit, date, onClose }: { habit: Habit; date: DateStr; onClose: () => void }) {
  const { write, today } = useCore()
  const toast = useToast()
  const habitId = habit.id!
  const { data: entry, loaded } = useKeyedLiveQuery(`${habitId}|${date}`, async () => {
    return (await db.entries.where('[habit_id+date]').equals([habitId, date]).first()) ?? null
  })
  const [value, setValue] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const shownValue = value ?? entry?.value ?? habit.measure.target ?? 0
  const shownNote = note ?? entry?.note ?? ''
  const target = habit.measure.target

  const fail = (error: unknown) =>
    toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })

  const save = async (done: boolean) => {
    try {
      if (done) {
        await setHabitDone(habitId, date, true, write, {
          value: shownValue,
          note: shownNote,
          time: date === today ? clockHHMM(new Date()) : null,
        })
      } else {
        await setHabitDone(habitId, date, false, write, { note: shownNote })
        if (shownValue) await annotateEntry(habitId, date, write, { value: shownValue })
      }
      onClose()
    } catch (error) {
      fail(error)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${nameOn(habit, date)} · ${formatMediumDate(date)}`}
      size="sm"
      footer={
        <div className="flex w-full gap-2">
          <Button variant="secondary" block onClick={() => save(false)}>
            Save as not done
          </Button>
          <Button variant="primary" block onClick={() => save(true)}>
            Save as done
          </Button>
        </div>
      }
    >
      {loaded && (
        <div className="flex flex-col gap-5">
          <Field
            label={`Amount${habit.measure.unit ? ` (${habit.measure.unit})` : ''}`}
            hint={target !== null ? `${target} ${habit.measure.unit} counts as done.`.replace('  ', ' ') : undefined}
          >
            <Stepper
              label={`Amount in ${habit.measure.unit || 'units'}`}
              value={shownValue}
              onChange={setValue}
              step={STEP[habit.measure.type] ?? 1}
              min={0}
              unit={habit.measure.unit}
              size="lg"
            />
          </Field>
          <Field label="Note" hint="Optional.">
            <TextInput value={shownNote} onChange={(event) => setNote(event.target.value)} maxLength={200} />
          </Field>
        </div>
      )}
    </Modal>
  )
}
