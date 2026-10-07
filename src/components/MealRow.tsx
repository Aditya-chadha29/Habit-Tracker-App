import { saveMeal } from '../data/mealRepo'
import { db } from '../data/db'
import { toggleHabit } from '../data/habitRepo'
import type { DateStr, Habit, Meal } from '../data/types'
import { completedBy } from '../engine/completion'
import { clockHHMM } from '../engine/dates'
import { isEditable } from '../engine/lock'
import { dayStatus, statusLabel } from '../engine/status'
import { versionOn } from '../engine/timeline'
import { useCore } from '../state/core'
import { useKeyedLiveQuery } from '../state/live'
import { cx } from '../ui/cx'
import { Tick } from '../ui/Tick'
import { useToast } from '../ui/Toast'

/**
 * A meal: whether it happened, what it was, and whether it was eaten out. Deliberately nothing
 * more — this is a record of what was eaten, not a nutrition tracker.
 *
 * Writing a description ticks the meal; the tick can also be made on its own.
 */
export function MealRow({ habit, date, lead }: { habit: Habit; date: DateStr; lead?: string }) {
  const { index, today, write, settings } = useCore()
  const toast = useToast()
  const slot = habit.meal_slot ?? habit.name.toLowerCase()
  const habitId = habit.id!
  const key = `${date}|${slot}`
  const { data: meal, loaded } = useKeyedLiveQuery(key, async (): Promise<Meal | null> => {
    return (await db.meals.get([date, slot])) ?? null
  })

  const version = versionOn(habit, date)
  if (!version) return null
  const done = completedBy(habit, date, index) !== null
  const status = dayStatus(habit, date, today, index)
  const editable = isEditable(date, today, settings.edit_window_days)
  const now = () => (date === today ? clockHHMM(new Date()) : null)

  const fail = (error: unknown) =>
    toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        {lead !== undefined && <span className="tnum w-10 shrink-0 text-[12px] text-ink-3">{lead}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[14.5px] text-ink">{version.name}</span>
            {meal?.time && <span className="tnum text-[12px] text-ink-3">{meal.time}</span>}
            <span className={cx('ml-auto text-[11.5px] font-medium', done ? 'text-ok' : status === 'missed' ? 'text-risk' : 'text-ink-3')}>
              {statusLabel(status, habit.polarity)}
            </span>
          </div>
        </div>
        <Tick
          checked={done}
          disabled={!editable}
          onChange={() => toggleHabit(habitId, date, write, { time: now() }).catch(fail)}
          label={`${version.name}, eaten`}
        />
      </div>
      {loaded ? (
        <div className={cx('mt-2 flex items-center gap-2', lead !== undefined && 'pl-[52px]')}>
          <input
            // Keyed on the day and slot, never on the stored value: a save elsewhere must not
            // remount the field and throw away what is being typed.
            key={key}
            type="text"
            defaultValue={meal?.text ?? ''}
            disabled={!editable}
            placeholder="What did you eat?"
            aria-label={`What you ate for ${version.name}`}
            maxLength={300}
            enterKeyHint="done"
            onBlur={(event) => {
              const text = event.target.value.trim()
              if (text === (meal?.text ?? '')) return
              saveMeal(date, slot, { text }, write, { habitId, time: now() }).catch(fail)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            className="h-11 min-w-0 flex-1 rounded-control bg-surface-2 px-3 text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)] disabled:opacity-60"
          />
          <button
            type="button"
            aria-pressed={meal?.ate_out ?? false}
            disabled={!editable}
            onClick={() => saveMeal(date, slot, { ate_out: !(meal?.ate_out ?? false) }, write).catch(fail)}
            className={cx(
              'h-11 shrink-0 cursor-pointer rounded-control px-3 text-[13px] font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-60',
              meal?.ate_out ? 'bg-warn/15 text-warn shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-warn)_40%,transparent)]' : 'bg-surface-2 text-ink-3 shadow-[inset_0_0_0_1px_var(--color-line)]',
            )}
          >
            Ate out
          </button>
        </div>
      ) : (
        <div className="mt-2 h-11 rounded-control bg-surface-2" aria-hidden="true" />
      )}
    </div>
  )
}
