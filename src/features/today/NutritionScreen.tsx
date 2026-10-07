import { useMemo, useState } from 'react'
import { Link, useQueryState } from '../../app/router'
import { DayNav } from '../../components/DayNav'
import { HabitGroup } from '../../components/HabitGroup'
import { HabitRow } from '../../components/HabitRow'
import { MealRow } from '../../components/MealRow'
import { mealsBetween } from '../../data/mealRepo'
import type { DateStr, Habit, HabitVersion, Meal } from '../../data/types'
import { completedBy } from '../../engine/completion'
import { addDays, formatMediumDate, isValidDateStr, relativeDayLabel } from '../../engine/dates'
import { describeAmount, describeFrequency } from '../../engine/describe'
import { firstEditableDate } from '../../engine/lock'
import { matchesDayRule, versionOn } from '../../engine/timeline'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'

const TABS = [
  { id: 'food', label: 'Food' },
  { id: 'supplements', label: 'Supplements' },
  { id: 'history', label: 'History' },
] as const

type TabId = (typeof TABS)[number]['id']

interface Listed {
  habit: Habit
  version: HabitVersion
  due: boolean
}

function listOf(habits: readonly Habit[], kind: Habit['kind'], date: DateStr): Listed[] {
  const out: Listed[] = []
  for (const habit of habits) {
    if (habit.kind !== kind) continue
    const version = versionOn(habit, date)
    if (!version || !version.active) continue
    out.push({ habit, version, due: version.day.kind === 'flexible' || matchesDayRule(version.day, date) })
  }
  return out
}

function FoodHistory({ slotNames }: { slotNames: Map<string, string> }) {
  const { today } = useCore()
  const [days, setDays] = useState(30)
  const from = addDays(today, -days)
  const { data, loaded } = useKeyedLiveQuery(`${from}|${today}`, () => mealsBetween(from, today))

  const byDate = useMemo(() => {
    const groups = new Map<DateStr, Meal[]>()
    for (const meal of data ?? []) {
      const list = groups.get(meal.date)
      if (list) list.push(meal)
      else groups.set(meal.date, [meal])
    }
    return [...groups.entries()]
  }, [data])

  const order = ['breakfast', 'lunch', 'snack', 'dinner']
  const rank = (slot: string) => (order.indexOf(slot) < 0 ? order.length : order.indexOf(slot))

  if (!loaded) return null
  return (
    <div className="flex flex-col gap-4">
      {byDate.length === 0 && (
        <EmptyState icon="utensils" title="No meals written down in this period." body="What you write under a meal on the Food tab appears here." />
      )}
      {byDate.map(([date, meals]) => (
        <Card key={date} padded={false} className="overflow-hidden">
          <div className="flex items-baseline gap-2 border-b border-line px-4 py-2.5">
            <h3 className="text-[14px] font-semibold text-ink">{formatMediumDate(date)}</h3>
            <span className="text-[12px] text-ink-3">{relativeDayLabel(date, today) === formatMediumDate(date) ? '' : relativeDayLabel(date, today)}</span>
          </div>
          <dl className="divide-y divide-line">
            {[...meals]
              .sort((a, b) => rank(a.slot) - rank(b.slot))
              .map((meal) => (
                <div key={meal.slot} className="flex items-start gap-3 px-4 py-2.5">
                  <dt className="w-[84px] shrink-0 pt-px text-[12.5px] text-ink-3">
                    {slotNames.get(meal.slot) ?? meal.slot.charAt(0).toUpperCase() + meal.slot.slice(1)}
                    {meal.time && <span className="tnum block text-[11.5px]">{meal.time}</span>}
                  </dt>
                  <dd className="min-w-0 flex-1 text-[14px] leading-snug text-ink">
                    {meal.text || <span className="text-ink-3">Not described</span>}
                    {meal.ate_out && (
                      <Chip tone="warn" className="ml-2 align-middle">
                        Ate out
                      </Chip>
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </Card>
      ))}
      <Button variant="secondary" onClick={() => setDays((current) => current + 60)}>
        Show earlier
      </Button>
      <p className="text-center text-[12.5px] text-ink-3">Showing the last {days} days.</p>
    </div>
  )
}

/**
 * Nutrition, kept deliberately simple: what was eaten at each meal, which supplements were
 * taken, and a history to look back through. No calories, no macros, no scores.
 */
export default function NutritionScreen() {
  const { today, settings, habits, index } = useCore()
  const [rawTab, setTab] = useQueryState('tab', 'food')
  const [rawDate, setDate] = useQueryState('d', today)
  const tab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : 'food'
  const first = firstEditableDate(today, settings.edit_window_days)
  const date: DateStr = isValidDateStr(rawDate) && rawDate >= first && rawDate <= today ? rawDate : today

  const meals = useMemo(() => listOf(habits, 'meal', date), [habits, date])
  const supplements = useMemo(() => listOf(habits, 'supplement', date), [habits, date])
  const slotNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const habit of habits) if (habit.kind === 'meal' && habit.meal_slot) names.set(habit.meal_slot, habit.name)
    return names
  }, [habits])

  const dueMeals = meals.filter((meal) => meal.due)
  const mealsDone = dueMeals.filter((meal) => completedBy(meal.habit, date, index) !== null).length
  const dueSupplements = supplements.filter((item) => item.due && item.version.day.kind !== 'flexible')
  const supplementsDone = dueSupplements.filter((item) => completedBy(item.habit, date, index) !== null).length
  const flexibleSupplements = supplements.filter((item) => item.version.day.kind === 'flexible')
  const restingSupplements = supplements.filter((item) => !item.due)

  return (
    <Page
      title="Nutrition"
      subtitle="What you ate, and what you took"
      back="/area/body"
      width="narrow"
      tabs={<Segmented options={TABS} value={tab} onChange={setTab} label="Nutrition section" block />}
    >
      <div className="flex flex-col gap-5">
        {tab !== 'history' && <DayNav date={date} onChange={setDate} />}

        {tab === 'food' &&
          (meals.length === 0 ? (
            <EmptyState
              icon="utensils"
              title="No meals are set up."
              body="Add a habit of the kind “Meal” in Habits to log breakfast, lunch and dinner here."
              action={
                <Link to="/habits/new" className="text-[14px] font-medium text-accent-ink">
                  Add a meal
                </Link>
              }
            />
          ) : (
            <HabitGroup title="Meals" tally={{ done: mealsDone, due: dueMeals.length }} note="Writing what you ate ticks the meal.">
              {dueMeals.map(({ habit }) => (
                <MealRow key={habit.id} habit={habit} date={date} />
              ))}
            </HabitGroup>
          ))}

        {tab === 'supplements' &&
          (supplements.length === 0 ? (
            <EmptyState
              icon="pill"
              title="No supplements are set up."
              body="Add a habit of the kind “Supplement” in Habits, with its dose and how often it is taken."
              action={
                <Link to="/habits/new" className="text-[14px] font-medium text-accent-ink">
                  Add a supplement
                </Link>
              }
            />
          ) : (
            <>
              {dueSupplements.length > 0 && (
                <HabitGroup title="Due" tally={{ done: supplementsDone, due: dueSupplements.length }}>
                  {dueSupplements.map(({ habit }) => (
                    <HabitRow key={habit.id} habit={habit} date={date} />
                  ))}
                </HabitGroup>
              )}
              {flexibleSupplements.length > 0 && (
                <HabitGroup title="When needed">
                  {flexibleSupplements.map(({ habit, version }) => (
                    <HabitRow key={habit.id} habit={habit} date={date} quiet sub={[describeAmount(habit), describeFrequency(version)].filter(Boolean).join(' · ')} />
                  ))}
                </HabitGroup>
              )}
              {restingSupplements.length > 0 && (
                <HabitGroup title="Not due on this day">
                  {restingSupplements.map(({ habit, version }) => (
                    <div key={habit.id} className="flex min-h-[52px] flex-col justify-center px-4 py-2">
                      <span className="text-[14.5px] text-ink-2">{version.name}</span>
                      <span className="mt-0.5 text-[12.5px] text-ink-3">{[describeAmount(habit), describeFrequency(version)].filter(Boolean).join(' · ')}</span>
                    </div>
                  ))}
                </HabitGroup>
              )}
            </>
          ))}

        {tab === 'history' && <FoodHistory slotNames={slotNames} />}
      </div>
    </Page>
  )
}
