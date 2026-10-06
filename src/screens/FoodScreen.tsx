import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { addDays, formatDayTitle, todayLocalStr, WEEKDAY_LABELS_MON_FIRST } from '../lib/dates'
import {
  MEAL_LABELS,
  MEAL_SLOTS,
  isEditable,
  isLowStock,
  mealFor,
  supplementDueOn,
  supplementTaken,
} from '../lib/derive'
import { useMealsForDate, useSupplementLogsForDate, useSupplements } from '../lib/hooks'
import { setMeal, toggleSupplement } from '../lib/mutations'
import type { Meal, MealSlot, Supplement } from '../lib/types'

const buttonPress = 'transition-transform duration-100 active:scale-[0.97] active:bg-accent/12'

function MealBlock({
  slot,
  meal,
  dateStr,
  editable,
}: {
  slot: MealSlot
  meal: Meal | undefined
  dateStr: string
  editable: boolean
}) {
  const text = meal?.text ?? ''
  const ateOut = meal?.ate_out ?? false

  return (
    <div className="border-b border-ink/9 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
          {MEAL_LABELS[slot]}
        </span>
        <button
          type="button"
          disabled={!editable}
          onClick={() => setMeal(dateStr, slot, { ate_out: !ateOut })}
          aria-pressed={ateOut}
          className={`min-h-[30px] cursor-pointer rounded-[4px] border px-2.5 text-[10.5px] tracking-[0.06em] uppercase ${buttonPress} ${
            ateOut ? 'border-accent bg-accent/12 text-accent' : 'border-ink/20 bg-transparent text-ink/42'
          } ${editable ? '' : 'cursor-default opacity-60'}`}
        >
          Ate out
        </button>
      </div>

      {editable ? (
        <textarea
          // Keyed on the date, never on the live value: a sibling write would otherwise remount
          // this mid-typing and discard what was being written.
          key={`${dateStr}-${slot}`}
          defaultValue={text}
          rows={2}
          placeholder="What did you eat?"
          onBlur={(e) => {
            const next = e.currentTarget.value
            // dateStr comes from the render closure — reading today's date here would land a late
            // save on the wrong day.
            if (next !== text) setMeal(dateStr, slot, { text: next })
          }}
          className="mt-1.5 w-full resize-none border-0 bg-transparent text-[14px] leading-[1.45] text-ink/80 placeholder:text-ink/28 focus:outline-none"
        />
      ) : (
        <div className="mt-1.5 text-[14px] leading-[1.45] whitespace-pre-wrap text-ink/72">
          {text || <span className="text-ink/28">Not logged</span>}
        </div>
      )}
    </div>
  )
}

function SupplementRow({
  supplement,
  taken,
  due,
  dateStr,
  editable,
}: {
  supplement: Supplement
  taken: boolean
  due: boolean
  dateStr: string
  editable: boolean
}) {
  const low = isLowStock(supplement)
  const weeklyLabel =
    supplement.schedule === 'weekly' && supplement.weekly_day !== null
      ? WEEKDAY_LABELS_MON_FIRST[supplement.weekly_day]
      : null

  // Not due today (a weekly item on the wrong day): one quiet line, counting toward nothing.
  if (!due && supplement.schedule === 'weekly') {
    return (
      <div className="flex min-h-[38px] items-center gap-3 border-b border-ink/9 px-4 text-[12px] text-ink/28">
        <span className="flex-1 truncate">{supplement.name}</span>
        <span>{weeklyLabel}</span>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={editable ? 0 : -1}
      onClick={() => editable && toggleSupplement(supplement.id!, dateStr)}
      onKeyDown={(e) => {
        if (editable && (e.key === 'Enter' || e.key === ' ')) {
          toggleSupplement(supplement.id!, dateStr)
        }
      }}
      aria-pressed={taken}
      className={`flex min-h-[46px] items-center gap-3 border-b border-ink/9 px-4 ${
        editable ? 'cursor-pointer active:bg-accent/12' : ''
      } ${taken ? 'bg-accent/6' : ''}`}
    >
      <div
        className={`flex h-5 w-5 flex-none items-center justify-center rounded-[2px] border ${
          taken ? 'border-accent bg-accent' : 'border-ink/32 bg-transparent'
        }`}
      >
        {taken && <Check size={12} strokeWidth={3.2} className="text-on-accent" />}
      </div>
      <span className={`min-w-0 flex-1 truncate text-[14px] ${taken ? 'text-ink' : 'text-ink/72'}`}>
        {supplement.name}
      </span>
      <span className="flex-none text-[11.5px] text-ink/45">{supplement.dose_text}</span>
      {supplement.servings_left !== null && (
        <span className={`flex-none text-[11px] ${low ? 'text-accent' : 'text-ink/35'}`}>
          ~{supplement.servings_left} left
        </span>
      )}
    </div>
  )
}

export function FoodScreen() {
  const [dayOffset, setDayOffset] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const today = todayLocalStr()
  const dateStr = addDays(today, dayOffset)
  const isTodayDate = dayOffset === 0
  const editable = isEditable(dateStr, today)

  const { meals, loaded } = useMealsForDate(dateStr)
  const supplements = useSupplements()
  const logs = useSupplementLogsForDate(dateStr)

  // Same reason as the Today screen: resetting scroll on date change avoids leaving an inner
  // overflow region in the mid-scroll state that wedges iOS Safari.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [dayOffset])

  const active = supplements.filter((s) => !s.retired_on || s.retired_on > dateStr)
  const daySub = isTodayDate
    ? 'Today'
    : dayOffset === -1
      ? 'Yesterday'
      : `${Math.abs(dayOffset)} days back`

  return (
    <>
      <header className="border-b border-ink/14 px-4 pt-2 pb-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={dayOffset <= -6}
            onClick={() => setDayOffset((o) => Math.max(-6, o - 1))}
            aria-label="Previous day"
            className={`h-11 w-11 border-0 bg-transparent font-heading text-[22px] transition-colors duration-100 ${
              dayOffset > -6 ? 'cursor-pointer text-accent active:text-accent-pressed' : 'text-ink/18'
            }`}
          >
            ‹
          </button>
          <div className="text-center">
            <div className="font-heading text-[18px] tracking-[0.01em]">
              {formatDayTitle(dateStr)}
            </div>
            <div className="mt-0.5 text-[10.5px] tracking-[0.12em] text-ink/45 uppercase">
              {daySub}
            </div>
          </div>
          <button
            type="button"
            disabled={dayOffset >= 0}
            onClick={() => setDayOffset((o) => Math.min(0, o + 1))}
            aria-label="Next day"
            className={`h-11 w-11 border-0 bg-transparent font-heading text-[22px] transition-colors duration-100 ${
              dayOffset < 0 ? 'cursor-pointer text-accent active:text-accent-pressed' : 'text-ink/18'
            }`}
          >
            ›
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {/* Nothing is drawn from the day's rows until they have arrived for THIS date: a
            half-loaded value in a text box is how a previous day's note once got saved onto the
            wrong day. */}
        {!loaded ? (
          <div className="px-4 py-6 text-[12px] text-ink/35">Loading…</div>
        ) : (
          MEAL_SLOTS.map((slot) => (
            <MealBlock
              key={slot}
              slot={slot}
              meal={mealFor(meals, slot)}
              dateStr={dateStr}
              editable={editable}
            />
          ))
        )}

        <div className="px-4 pt-4 pb-1.5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
          Supplements
        </div>
        {active.length === 0 ? (
          <div className="px-4 pb-4 text-[12px] text-ink/35">None yet.</div>
        ) : (
          active.map((s) => (
            <SupplementRow
              key={s.id}
              supplement={s}
              taken={supplementTaken(logs, s.id!)}
              due={supplementDueOn(s, dateStr)}
              dateStr={dateStr}
              editable={editable}
            />
          ))
        )}

        {!editable && (
          <div className="px-4 pt-3 pb-5 text-[11px] leading-[1.5] text-ink/35">
            Days older than a week are locked, the same as habit ticks.
          </div>
        )}
      </div>
    </>
  )
}
