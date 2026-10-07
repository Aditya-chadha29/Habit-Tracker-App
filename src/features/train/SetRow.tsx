import type { Exercise, SetLog } from '../../data/types'
import { completeSet, removeSetRow, uncompleteSet, updateSet } from '../../data/workoutRepo'
import { formatSet } from '../../engine/training'
import { useCore } from '../../state/core'
import { cx } from '../../ui/cx'
import { Stepper } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { useToast } from '../../ui/Toast'

type FieldKey = 'weight_kg' | 'reps' | 'seconds' | 'distance_m'

interface FieldSpec {
  key: FieldKey
  label: string
  unit: string
  step: number
  /** Stored value → shown value, and back. */
  show: (stored: number) => number
  store: (shown: number) => number
}

const same = (value: number) => value

function fieldsFor(exercise: Exercise | undefined, increment: number): FieldSpec[] {
  const weight: FieldSpec = { key: 'weight_kg', label: 'Weight', unit: 'kg', step: increment, show: same, store: same }
  const reps: FieldSpec = { key: 'reps', label: 'Reps', unit: '', step: 1, show: same, store: same }
  switch (exercise?.kind) {
    case 'bodyweight_reps':
      return [reps]
    case 'time':
      return [{ key: 'seconds', label: 'Seconds', unit: 's', step: 5, show: same, store: same }]
    case 'distance_time':
      return [
        { key: 'seconds', label: 'Minutes', unit: 'min', step: 1, show: (s) => Math.round(s / 60), store: (m) => m * 60 },
        { key: 'distance_m', label: 'Distance', unit: 'km', step: 0.1, show: (m) => Math.round(m / 10) / 100, store: (km) => Math.round(km * 1000) },
      ]
    default:
      return [weight, reps]
  }
}

interface SetRowProps {
  set: SetLog
  exercise: Exercise | undefined
  /** The matching set from the last time this exercise was performed. */
  previous: SetLog | undefined
  /** Seconds of rest to start when this set is done. */
  restSeconds: number
  editable: boolean
  /** Whether the session is still running (decides whether a rest clock starts). */
  live: boolean
  /** Draw the column headings above this row (the first row of a block). */
  heading?: boolean
}

/**
 * One set: the numbers, pre-filled from last time, and a large button that logs it in one tap.
 * Built for a tired thumb — every control is at least 44px and nothing needs the keyboard.
 */
export function SetRow({ set, exercise, previous, restSeconds, editable, live, heading = false }: SetRowProps) {
  const { write, settings } = useCore()
  const toast = useToast()
  const fields = fieldsFor(exercise, exercise?.increment_kg || settings.default_increment_kg)
  const fail = (error: unknown) => toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })

  const toggle = () => {
    if (set.done) uncompleteSet(set.id!, write).catch(fail)
    else completeSet(set.id!, {}, live ? restSeconds : null, write, Date.now()).catch(fail)
  }

  return (
    <div className="py-1.5">
      {heading && (
        <div className="flex items-center gap-1.5 pb-1 text-[11px] text-ink-3" aria-hidden="true">
          <span className="w-5 shrink-0 text-center">Set</span>
          {fields.map((field) => (
            <span key={field.key} className={cx('min-w-0 text-center', field.key === 'reps' && fields.length > 1 ? 'flex-[0.85]' : 'flex-1')}>
              {field.label}
              {field.unit && ` (${field.unit})`}
            </span>
          ))}
          <span className="w-12 shrink-0 text-center">Done</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="tnum w-5 shrink-0 text-center text-[12.5px] text-ink-3" aria-hidden="true">
          {set.set_index}
        </span>
        {fields.map((field) => (
          <Stepper
            key={field.key}
            label={`Set ${set.set_index} ${field.label.toLowerCase()}`}
            value={set[field.key] === null ? null : field.show(set[field.key]!)}
            onChange={(shown) => {
              if (!editable) return
              const patch: Partial<Pick<SetLog, FieldKey>> = {}
              patch[field.key] = field.store(shown)
              updateSet(set.id!, patch, write).catch(fail)
            }}
            step={field.step}
            min={0}
            className={cx('min-w-0', field.key === 'reps' && fields.length > 1 ? 'flex-[0.85]' : 'flex-1')}
          />
        ))}
        <button
          type="button"
          aria-pressed={set.done}
          aria-label={`Set ${set.set_index}: ${set.done ? 'done. Tap to undo' : 'tap when done'}`}
          disabled={!editable}
          onClick={toggle}
          className={cx(
            'flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-control transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50',
            set.done ? 'bg-ok text-ground' : 'bg-surface-2 text-ink-3 shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]',
          )}
        >
          <Icon name="check" size={20} className="stroke-[2.8]" />
        </button>
      </div>
      <div className="mt-0.5 flex min-h-5 items-center gap-2 pl-6 text-[11.5px] text-ink-3">
        <span className="min-w-0 flex-1 truncate">{previous ? `Last time ${formatSet(previous)}` : 'No earlier set to compare'}</span>
        {editable && !set.done && (
          <button
            type="button"
            onClick={() => removeSetRow(set.id!, write).catch(fail)}
            className="-my-2 h-9 shrink-0 cursor-pointer rounded-[7px] px-2 text-[11.5px] text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
