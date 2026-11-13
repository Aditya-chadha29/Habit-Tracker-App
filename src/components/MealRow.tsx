import { useRef, useState } from 'react'
import { favouriteMeals, saveMeal } from '../data/mealRepo'
import { db } from '../data/db'
import { toggleHabit } from '../data/habitRepo'
import type { DateStr, Habit, Meal } from '../data/types'
import { completedBy } from '../engine/completion'
import { clockHHMM } from '../engine/dates'
import { isEditable } from '../engine/lock'
import { dayStatus, statusLabel } from '../engine/status'
import { versionOn } from '../engine/timeline'
import { useCore } from '../state/core'
import { useKeyedLiveQuery, useLive } from '../state/live'
import { cx } from '../ui/cx'
import { Icon } from '../ui/icons'
import { Tick } from '../ui/Tick'
import { useToast } from '../ui/Toast'

/**
 * A meal: whether it happened, what it was, and whether it was eaten out. Deliberately nothing
 * more — this is a record of what was eaten, not a nutrition tracker.
 *
 * It rests as one line (the meal and what was written for it); tapping the line opens the text
 * box and the "Ate out" switch. Writing a description ticks the meal; the tick also works alone.
 */
export function MealRow({ habit, date, lead }: { habit: Habit; date: DateStr; lead?: string }) {
  const { index, today, write, settings } = useCore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const field = useRef<HTMLInputElement>(null)
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
  const ateOut = meal?.ate_out ?? false
  const protein = meal?.protein ?? false
  const summary = [meal?.text, protein ? 'protein' : '', ateOut ? 'ate out' : ''].filter(Boolean).join(' · ')

  const fail = (error: unknown) =>
    toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })

  return (
    <div>
      <div className="flex min-h-[56px] items-stretch">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${version.name}: ${statusLabel(status, habit.polarity)}${summary ? `. ${summary}` : ''}. ${open ? 'Close' : 'Open'} what was eaten`}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pr-2 pl-4 text-left transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
        >
          {lead !== undefined && <span className="tnum w-10 shrink-0 text-[12px] text-ink-3">{lead}</span>}
          <span className="min-w-0 flex-1">
            <span className={cx('block truncate text-[14.5px] leading-snug text-ink', done && 'opacity-60')}>{version.name}</span>
            {!open && summary && <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{summary}</span>}
          </span>
          <span className={cx('shrink-0 text-[11.5px] font-medium', done ? 'text-ok' : status === 'missed' ? 'text-risk' : 'text-ink-3')}>{statusLabel(status, habit.polarity)}</span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} className="shrink-0 text-ink-3" />
        </button>
        <span className="flex shrink-0 items-center pr-1.5">
          <Tick checked={done} disabled={!editable} onChange={() => toggleHabit(habitId, date, write, { time: now() }).catch(fail)} label={`${version.name}, eaten`} />
        </span>
      </div>
      {open &&
        (loaded ? (
          <div className={cx('flex flex-col gap-2 px-4 pb-3', lead !== undefined && 'pl-[68px]')}>
            <input
              ref={field}
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
              className="h-11 w-full min-w-0 rounded-control bg-surface-2 px-3 text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus:shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)] disabled:opacity-60"
            />
            {editable && !meal?.text && (
              <Favourites
                slot={slot}
                onPick={(text) => {
                  if (field.current) field.current.value = text
                  saveMeal(date, slot, { text }, write, { habitId, time: now() }).catch(fail)
                }}
              />
            )}
            <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={protein}
              disabled={!editable}
              onClick={() => saveMeal(date, slot, { protein: !protein }, write).catch(fail)}
              className={cx(
                'flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-control px-3 text-[13px] font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-60',
                protein ? 'bg-surface-3 text-ink shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)]' : 'bg-surface-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
              )}
            >
              {protein && <Icon name="check" size={14} />}
              Protein
            </button>
            <button
              type="button"
              aria-pressed={ateOut}
              disabled={!editable}
              onClick={() => saveMeal(date, slot, { ate_out: !ateOut }, write).catch(fail)}
              className={cx(
                'flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-control px-3 text-[13px] font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-60',
                ateOut ? 'bg-warn/15 text-warn shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-warn)_40%,transparent)]' : 'bg-surface-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
              )}
            >
              {ateOut && <Icon name="check" size={14} />}
              Ate out
            </button>
            </div>
          </div>
        ) : (
          <div className="mx-4 mb-3 h-11 rounded-control bg-surface-2" aria-hidden="true" />
        ))}
    </div>
  )
}

const NO_MEALS: Meal[] = []

/** What was written most often for this meal before, one tap to use again. */
function Favourites({ slot, onPick }: { slot: string; onPick: (text: string) => void }) {
  const meals = useLive(() => db.meals.toArray(), [], NO_MEALS)
  const favourites = favouriteMeals(meals, slot)
  if (favourites.length === 0) return null
  return (
    <div role="group" aria-label="Meals written before" className="flex flex-wrap gap-2">
      {favourites.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onPick(text)}
          className="flex min-h-11 max-w-full cursor-pointer items-center rounded-control bg-surface-2 px-3 text-left text-[13px] text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
        >
          <span className="truncate">{text}</span>
        </button>
      ))}
    </div>
  )
}
