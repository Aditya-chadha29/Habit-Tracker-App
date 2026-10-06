import { Check, Minus, Plus } from 'lucide-react'
import type { Exercise, SetLog } from '../../lib/types'

const press = 'transition-transform duration-100 active:scale-[0.97]'

/** Big, keyboard-free adjustment. The keypad stays available behind a tap on the number itself,
 *  but the common move — one more rep, one more notch of weight — never opens it. */
function Stepper({
  value,
  step,
  suffix,
  decimals,
  onChange,
  label,
}: {
  value: number | null
  step: number
  suffix: string
  decimals: number
  onChange: (next: number) => void
  label: string
}) {
  const current = value ?? 0
  const shown = decimals ? current.toFixed(decimals).replace(/\.0$/, '') : String(current)

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <button
        type="button"
        aria-label={`Less ${label}`}
        onClick={() => onChange(Math.max(0, Math.round((current - step) * 100) / 100))}
        className={`flex h-11 w-9 flex-none cursor-pointer items-center justify-center rounded-[4px] border border-ink/20 bg-transparent text-ink/60 ${press} active:bg-accent/12`}
      >
        <Minus size={14} strokeWidth={2} />
      </button>
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <input
          key={`${label}-${value ?? 'empty'}`}
          type="text"
          inputMode="decimal"
          defaultValue={value === null ? '' : shown}
          onBlur={(e) => {
            const parsed = Number.parseFloat(e.currentTarget.value.replace(',', '.'))
            if (!Number.isNaN(parsed)) onChange(Math.max(0, parsed))
          }}
          className="tnum w-full rounded-[4px] border border-ink/14 bg-transparent px-1 py-2 text-center text-[15px] text-ink focus:outline-none"
        />
      </label>
      <span className="flex-none text-[10.5px] text-ink/35">{suffix}</span>
      <button
        type="button"
        aria-label={`More ${label}`}
        onClick={() => onChange(Math.round((current + step) * 100) / 100)}
        className={`flex h-11 w-9 flex-none cursor-pointer items-center justify-center rounded-[4px] border border-ink/20 bg-transparent text-ink/60 ${press} active:bg-accent/12`}
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

export function SetRow({
  set,
  exercise,
  editable,
  onPatch,
  onComplete,
  onUncomplete,
}: {
  set: SetLog
  exercise: Exercise
  editable: boolean
  onPatch: (patch: Partial<SetLog>) => void
  onComplete: () => void
  onUncomplete: () => void
}) {
  const weightStep = exercise.increment_kg || 2.5
  const showWeight = exercise.kind === 'weight_reps' || exercise.kind === 'weighted_bodyweight'
  const showReps =
    exercise.kind === 'weight_reps' ||
    exercise.kind === 'bodyweight_reps' ||
    exercise.kind === 'weighted_bodyweight'
  const showSeconds = exercise.kind === 'time' || exercise.kind === 'distance_time'
  const showDistance = exercise.kind === 'distance_time'

  return (
    <div
      className={`flex items-center gap-2 border-b border-ink/9 px-3 py-1.5 ${
        set.done ? 'bg-accent/6' : ''
      }`}
    >
      <span className="w-4 flex-none text-center text-[11px] text-ink/35">{set.set_index}</span>

      {showWeight && (
        <Stepper
          value={set.weight_kg}
          step={weightStep}
          suffix="kg"
          decimals={1}
          label="weight"
          onChange={(next) => onPatch({ weight_kg: next })}
        />
      )}
      {showDistance && (
        <Stepper
          value={set.distance_m}
          step={100}
          suffix="m"
          decimals={0}
          label="distance"
          onChange={(next) => onPatch({ distance_m: next })}
        />
      )}
      {showReps && (
        <Stepper
          value={set.reps}
          step={1}
          suffix="reps"
          decimals={0}
          label="reps"
          onChange={(next) => onPatch({ reps: next })}
        />
      )}
      {showSeconds && (
        <Stepper
          value={set.seconds}
          step={15}
          suffix="s"
          decimals={0}
          label="seconds"
          onChange={(next) => onPatch({ seconds: next })}
        />
      )}

      <button
        type="button"
        disabled={!editable}
        onClick={() => (set.done ? onUncomplete() : onComplete())}
        aria-label={set.done ? `Undo set ${set.set_index}` : `Log set ${set.set_index}`}
        aria-pressed={set.done}
        className={`flex h-12 w-12 flex-none cursor-pointer items-center justify-center rounded-[4px] border ${press} ${
          set.done
            ? 'border-accent bg-accent text-on-accent active:bg-accent-pressed'
            : 'border-ink/32 bg-transparent text-ink/45 active:bg-accent/12'
        }`}
      >
        <Check size={20} strokeWidth={set.done ? 3 : 2} />
      </button>
    </div>
  )
}
