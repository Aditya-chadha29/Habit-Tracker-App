import { Check } from 'lucide-react'
import { WEEKDAY_LABELS_MON_FIRST, todayLocalStr } from '../lib/dates'
import {
  habitCategory,
  habitSchedule,
  isDone,
  isDueOn,
  isHabitActive,
  isLowStock,
  supplementDueOn,
  supplementTaken,
  weeklyProgress,
  type DoneMap,
} from '../lib/derive'
import { useSupplementLogsForDate, useSupplements } from '../lib/hooks'
import { toggleEntry, toggleSupplement } from '../lib/mutations'
import type { Habit, HabitCategory, Supplement, SupplementLog } from '../lib/types'

const press = 'transition-colors duration-100 active:bg-accent/12'

/** Sub-headings in the order they should read, rather than alphabetically. Anything not listed
 *  falls to the end; supplements always come last. */
const GROUP_ORDER: Record<HabitCategory, string[]> = {
  mind: [''],
  body: ['Face care', 'Hair care', 'Food', 'Avoid', 'Sleep', ''],
  exercise: ['', 'Daily 10s', 'Cardio'],
}

function TickRow({
  label,
  done,
  detail,
  onToggle,
}: {
  label: string
  done: boolean
  detail?: string
  onToggle: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onToggle()
      }}
      aria-pressed={done}
      className={`flex min-h-[46px] cursor-pointer items-center gap-3 border-b border-ink/9 px-4 ${press} ${
        done ? 'bg-accent/6' : ''
      }`}
    >
      <div
        className={`flex h-5 w-5 flex-none items-center justify-center rounded-[2px] border ${
          done ? 'border-accent bg-accent' : 'border-ink/32 bg-transparent'
        }`}
      >
        {done && <Check size={12} strokeWidth={3.2} className="text-on-accent" />}
      </div>
      <span className={`min-w-0 flex-1 truncate text-[14px] ${done ? 'text-ink' : 'text-ink/72'}`}>
        {label}
      </span>
      {detail && <span className="flex-none text-[11px] text-ink/42">{detail}</span>}
    </div>
  )
}

function SupplementRow({
  supplement,
  logs,
  dateStr,
}: {
  supplement: Supplement
  logs: SupplementLog[]
  dateStr: string
}) {
  const due = supplementDueOn(supplement, dateStr)
  const weeklyLabel =
    supplement.weekly_day !== null && supplement.weekly_day !== undefined
      ? WEEKDAY_LABELS_MON_FIRST[supplement.weekly_day]
      : null

  // Not due today (a weekly dose on the wrong day): one quiet line, counting toward nothing.
  if (!due && supplement.schedule === 'weekly') {
    return (
      <div className="flex min-h-[38px] items-center gap-3 border-b border-ink/9 px-4 text-[12px] text-ink/28">
        <span className="flex-1 truncate">{supplement.name}</span>
        <span>{weeklyLabel}</span>
      </div>
    )
  }

  const taken = supplementTaken(logs, supplement.id!)
  const detail = isLowStock(supplement)
    ? `${supplement.dose_text} · ~${supplement.servings_left} left`
    : supplement.dose_text

  return (
    <TickRow
      label={supplement.name}
      done={taken}
      detail={detail}
      onToggle={() => void toggleSupplement(supplement.id!, dateStr)}
    />
  )
}

export function CategoryScreen({
  category,
  title,
  blurb,
  habits,
  doneMap,
}: {
  category: HabitCategory
  title: string
  blurb: string
  habits: Habit[]
  doneMap: DoneMap
}) {
  const today = todayLocalStr()
  const supplements = useSupplements()
  const logs = useSupplementLogsForDate(today)

  const mine = habits.filter((h) => habitCategory(h) === category && isHabitActive(h, today))
  const dueToday = mine.filter((h) => isDueOn(h, today))
  const doneCount = dueToday.filter((h) => isDone(doneMap, h.id!, today)).length

  const mySupplements = supplements.filter(
    (s) => (s.category ?? 'body') === category && (!s.retired_on || s.retired_on > today),
  )
  const supplementsDue = mySupplements.filter((s) => supplementDueOn(s, today))
  const supplementsTaken = supplementsDue.filter((s) => supplementTaken(logs, s.id!)).length

  const total = dueToday.length + supplementsDue.length
  const ticked = doneCount + supplementsTaken
  const pct = total ? Math.round((ticked / total) * 100) : 0

  // Group the habits, then order the groups: known headings first, anything else after.
  const groups = new Map<string, Habit[]>()
  for (const habit of mine) {
    const group = habit.group ?? ''
    const list = groups.get(group)
    if (list) list.push(habit)
    else groups.set(group, [habit])
  }
  const preferred = GROUP_ORDER[category]
  const orderedGroups = [...groups.keys()].sort((a, b) => {
    const ia = preferred.indexOf(a)
    const ib = preferred.indexOf(b)
    return (ia === -1 ? preferred.length : ia) - (ib === -1 ? preferred.length : ib)
  })

  return (
    <>
      <header className="flex-none border-b border-ink/14 px-4 pt-2 pb-3">
        <div className="font-heading text-[22px]">{title}</div>
        <div className="mt-0.5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">{blurb}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="tnum font-heading text-[28px] leading-none">
            {ticked}/{total}
          </span>
          <span className="text-[11.5px] text-ink/50">so far today</span>
        </div>
        <div className="mt-2 h-0.5 bg-ink/12">
          <div
            className="h-0.5 bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto pb-5">
        {total === 0 && mySupplements.length === 0 && (
          <div className="px-4 py-6 text-[12px] leading-[1.6] text-ink/35">
            Nothing here yet. Add habits on the Habits screen and set their category.
          </div>
        )}

        {orderedGroups.map((group) => {
          const rows = groups.get(group) ?? []
          return (
            <section key={group || 'general'}>
              {group && (
                <div className="px-4 pt-4 pb-1.5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
                  {group}
                </div>
              )}
              {rows.map((habit) => {
                const isTicked = isDone(doneMap, habit.id!, today)
                // A weekly-target habit says where it stands in the week instead of pretending
                // today is a pass or a fail.
                const weekly =
                  habitSchedule(habit) === 'times_per_week'
                    ? weeklyProgress(habit, doneMap, today)
                    : null
                return (
                  <TickRow
                    key={habit.id}
                    label={habit.name}
                    done={isTicked}
                    detail={weekly ? `${weekly.done} of ${weekly.target} this week` : undefined}
                    onToggle={() => void toggleEntry(habit.id!, today)}
                  />
                )
              })}
            </section>
          )
        })}

        {mySupplements.length > 0 && (
          <section>
            <div className="px-4 pt-4 pb-1.5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
              Supplements
            </div>
            {mySupplements.map((supplement) => (
              <SupplementRow
                key={supplement.id}
                supplement={supplement}
                logs={logs}
                dateStr={today}
              />
            ))}
          </section>
        )}
      </div>
    </>
  )
}
