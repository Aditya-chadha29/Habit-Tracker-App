import { useState } from "react"
import type { Exercise, SetLog } from "../../data/types"
import { completeSet, uncompleteSet, updateSet } from "../../data/workoutRepo"
import { formatSet } from "../../engine/training"
import { useCore } from "../../state/core"
import { cx } from "../../ui/cx"
import { Icon } from "../../ui/icons"
import { useToast } from "../../ui/Toast"

type FieldKey = "weight_kg" | "reps" | "seconds" | "distance_m"

interface FieldSpec {
  key: FieldKey
  /** The column heading, as a workout log writes it: KG, REPS. */
  label: string
  /** What a screen reader hears for the cell. */
  name: string
  decimal: boolean
  /** Stored value to shown value, and back. */
  show: (stored: number) => number
  store: (shown: number) => number
}

const same = (value: number) => value

function fieldsFor(exercise: Exercise | undefined): FieldSpec[] {
  const weight: FieldSpec = { key: "weight_kg", label: "KG", name: "weight in kilograms", decimal: true, show: same, store: same }
  const reps: FieldSpec = { key: "reps", label: "REPS", name: "reps", decimal: false, show: same, store: same }
  switch (exercise?.kind) {
    case "bodyweight_reps":
      return [reps]
    case "time":
      return [{ key: "seconds", label: "SEC", name: "seconds", decimal: false, show: same, store: same }]
    case "distance_time":
      return [
        { key: "seconds", label: "MIN", name: "minutes", decimal: false, show: (s) => Math.round(s / 60), store: (m) => m * 60 },
        { key: "distance_m", label: "KM", name: "distance in kilometres", decimal: true, show: (m) => Math.round(m / 10) / 100, store: (km) => Math.round(km * 1000) },
      ]
    default:
      return [weight, reps]
  }
}

/** The grid every row of an exercise shares, so the columns line up under their headings. */
function columns(count: number): string {
  return "26px minmax(0, 1fr) " + Array.from({ length: count }, () => "minmax(0, 66px)").join(" ") + " 44px"
}

interface CellProps {
  label: string
  value: number | null
  decimal: boolean
  disabled: boolean
  onCommit: (value: number) => void
}

/**
 * One number in a set. Typed straight in, as in a paper log. While it has focus it holds its own
 * text, so a half-typed "62." is not rewritten under the thumb; every valid number is saved as it
 * is typed, and leaving the cell shows what is stored.
 */
function Cell({ label, value, decimal, disabled, onCommit }: CellProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const stored = value === null ? "" : String(value)
  return (
    <input
      aria-label={label}
      inputMode={decimal ? "decimal" : "numeric"}
      disabled={disabled}
      placeholder="–"
      value={draft ?? stored}
      onFocus={(event) => {
        setDraft(stored)
        event.target.select()
      }}
      onChange={(event) => {
        const text = event.target.value.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, "")
        setDraft(text)
        const number = Number(text)
        if (text !== "" && Number.isFinite(number)) onCommit(number)
      }}
      onBlur={() => setDraft(null)}
      className="tnum h-11 w-full min-w-0 rounded-control bg-surface-2 px-1 text-center text-[16px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-accent-ink)] disabled:opacity-60"
    />
  )
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
 * One set, laid out like a line of a workout log: its number, what was done last time, the
 * numbers for this time, and a tick. The numbers arrive filled in from last time, so a set that
 * went as planned is one tap.
 */
export function SetRow({ set, exercise, previous, restSeconds, editable, live, heading = false }: SetRowProps) {
  const { write } = useCore()
  const toast = useToast()
  const fields = fieldsFor(exercise)
  const grid = { gridTemplateColumns: columns(fields.length) }
  const fail = (error: unknown) => toast.show(error instanceof Error ? error.message : "That could not be saved.", { tone: "risk" })

  const toggle = () => {
    if (set.done) uncompleteSet(set.id!, write).catch(fail)
    else completeSet(set.id!, {}, live ? restSeconds : null, write, Date.now()).catch(fail)
  }

  return (
    <>
      {heading && (
        <div className="grid items-center gap-1.5 px-1.5 pb-1 text-[10.5px] font-semibold tracking-[0.08em] text-ink-3" style={grid} aria-hidden="true">
          <span className="text-center">SET</span>
          <span>PREVIOUS</span>
          {fields.map((field) => (
            <span key={field.key} className="text-center">
              {field.label}
            </span>
          ))}
          <span className="flex justify-center">
            <Icon name="check" size={14} />
          </span>
        </div>
      )}
      <div className={cx("grid items-center gap-1.5 rounded-control px-1.5 py-1", set.done && "bg-ok/12")} style={grid}>
        <span className="tnum text-center text-[14px] font-semibold text-ink-2" aria-hidden="true">
          {set.set_index}
        </span>
        <span className="tnum min-w-0 truncate text-[13px] text-ink-3">{previous ? formatSet(previous) : "—"}</span>
        {fields.map((field) => (
          <Cell
            key={field.key}
            label={"Set " + set.set_index + " " + field.name}
            value={set[field.key] === null ? null : field.show(set[field.key]!)}
            decimal={field.decimal}
            disabled={!editable}
            onCommit={(shown) => {
              const patch: Partial<Pick<SetLog, FieldKey>> = {}
              patch[field.key] = field.store(shown)
              updateSet(set.id!, patch, write).catch(fail)
            }}
          />
        ))}
        <button
          type="button"
          aria-pressed={set.done}
          aria-label={"Set " + set.set_index + ": " + (set.done ? "done. Tap to undo" : "tap when done")}
          disabled={!editable}
          onClick={toggle}
          className={cx(
            "flex h-11 w-11 cursor-pointer items-center justify-center rounded-control transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50",
            set.done ? "bg-ok text-ground" : "bg-surface-3 text-ink-3",
          )}
        >
          <Icon name="check" size={20} className="stroke-[2.8]" />
        </button>
      </div>
    </>
  )
}
