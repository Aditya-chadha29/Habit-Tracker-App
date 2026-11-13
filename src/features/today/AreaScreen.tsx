import { useMemo } from 'react'
import { Link, type RouteProps } from '../../app/router'
import { HabitGroup } from '../../components/HabitGroup'
import { HabitRow } from '../../components/HabitRow'
import { MealRow } from '../../components/MealRow'
import type { Habit, HabitVersion } from '../../data/types'
import { describeFrequency } from '../../engine/describe'
import { periodOf } from '../../engine/periods'
import { dayScore, percent, weekTally } from '../../engine/score'
import { streakOf } from '../../engine/streaks'
import { matchesDayRule, versionOn } from '../../engine/timeline'
import { compareWindows } from '../../engine/trend'
import { useCore } from '../../state/core'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Icon, type IconName } from '../../ui/icons'
import { MetricCard } from '../../ui/Metric'
import { Page } from '../../ui/Page'
import { areaTagline } from './areaMeta'

/** Where each pillar's own tools live. */
const DOORS: Record<string, { to: string; icon: IconName; title: string; detail: string }[]> = {
  mind: [{ to: '/journal', icon: 'journal', title: 'Journal', detail: 'Morning and evening entries' }],
  body: [{ to: '/nutrition', icon: 'utensils', title: 'Nutrition', detail: 'Meals, supplements and food history' }],
  learning: [{ to: '/learn', icon: 'learn', title: 'Learn', detail: 'Today’s learning and the queue' }],
  exercise: [{ to: '/train', icon: 'train', title: 'Train', detail: 'Today’s workout, history and programme' }],
}

interface Listed {
  habit: Habit
  version: HabitVersion
  /** Shown on the list today: due, or doable any day. */
  today: boolean
}

/**
 * One pillar in full: how it stands today and this week, every habit in it grouped the way the
 * owner grouped them, and the way into that pillar's own tools.
 */
export default function AreaScreen({ params }: RouteProps) {
  const { today, areas, habits, index, weekStart } = useCore()
  const area = areas.find((candidate) => candidate.id === params.id)

  const listed = useMemo(() => {
    const out: Listed[] = []
    for (const habit of habits) {
      const version = versionOn(habit, today)
      if (!version || !version.active || version.area !== params.id) continue
      out.push({ habit, version, today: version.day.kind === 'flexible' || matchesDayRule(version.day, today) })
    }
    return out
  }, [habits, today, params.id])

  const groups = useMemo(() => {
    const byGroup = new Map<string, Listed[]>()
    for (const item of listed) {
      const list = byGroup.get(item.version.group)
      if (list) list.push(item)
      else byGroup.set(item.version.group, [item])
    }
    return [...byGroup.entries()]
  }, [listed])

  const day = useMemo(() => dayScore(habits, today, index), [habits, today, index])
  const week = useMemo(() => weekTally(habits, periodOf('week', today, weekStart), today, index), [habits, today, weekStart, index])

  if (!area) {
    return (
      <Page title="Pillar" back="/">
        <EmptyState title="That pillar does not exist." body="Pillars are managed in Settings." />
      </Page>
    )
  }

  const todayPart = day.by_area.get(area.id)
  const weekPart = week.by_area.get(area.id)
  const weekPct = weekPart ? percent(weekPart) : null
  const trend = compareWindows(habits, index, today, 7, area.id)

  return (
    <Page title={area.label} subtitle={areaTagline(area)} back="/" width="wide">
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="grid grid-cols-3 gap-3 lg:order-2 lg:col-span-4 lg:grid-cols-1">
          <MetricCard label="Today" value={todayPart ? `${todayPart.done} / ${todayPart.due}` : '—'} hint={todayPart ? 'so far' : 'Nothing due'} />
          <MetricCard
            label="This week"
            value={weekPct === null ? '—' : weekPct}
            unit={weekPct === null ? undefined : '%'}
            hint={weekPart ? `${weekPart.done} of ${weekPart.due} so far` : 'Nothing due yet'}
          />
          <MetricCard
            label="7 days"
            value={trend.delta === null ? '—' : `${trend.delta > 0 ? '+' : ''}${trend.delta}`}
            unit={trend.delta === null ? undefined : 'pts'}
            hint={trend.delta === null ? 'Need more history' : 'against the 7 days before'}
          />
          {(DOORS[area.id] ?? []).map((door) => (
            <Link
              key={door.to}
              to={door.to}
              className="col-span-3 flex min-h-[60px] items-center gap-3 rounded-card bg-surface px-4 py-2.5 shadow-card transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3 lg:col-span-1"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-2 text-ink-2">
                <Icon name={door.icon} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium text-ink">{door.title}</span>
                <span className="block truncate text-[12.5px] text-ink-3">{door.detail}</span>
              </span>
              <Icon name="chevron-right" size={17} className="shrink-0 text-ink-3" />
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-5 lg:order-1 lg:col-span-8">
          {listed.length === 0 && (
            <EmptyState
              icon="habits"
              title={`No habits in ${area.label} yet.`}
              body="Add one in Habits and choose this pillar."
              action={
                <Link to="/habits/new" className="text-[14px] font-medium text-cream underline underline-offset-2">
                  Add a habit
                </Link>
              }
            />
          )}
          {groups.map(([group, items]) => (
            <HabitGroup key={group || 'ungrouped'} title={group || area.label}>
              {items.map(({ habit, version, today: showToday }) => {
                const history = (
                  <Link
                    to={`/progress/habit/${habit.id}`}
                    aria-label={`History of ${version.name}`}
                    title="History"
                    className="flex w-11 shrink-0 items-center justify-center self-stretch text-ink-3 transition-colors duration-100 hover:bg-surface-2 hover:text-ink"
                  >
                    <Icon name="history" size={17} />
                  </Link>
                )
                if (!showToday) {
                  return (
                    <div key={habit.id} className="flex min-h-[56px] items-stretch">
                      <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-3 pl-4">
                        <span className="truncate text-[14.5px] text-ink-2">{version.name}</span>
                        <span className="mt-0.5 truncate text-[12.5px] text-ink-3">{describeFrequency(version)} · not due today</span>
                      </div>
                      {history}
                    </div>
                  )
                }
                if (habit.kind === 'meal') return <MealRow key={habit.id} habit={habit} date={today} />
                const streak = streakOf(habit, today, index, weekStart)
                const parts = [describeFrequency(version)]
                if (streak.current >= 2) parts.push(`${streak.current} ${streak.unit} in a row`)
                return <HabitRow key={habit.id} habit={habit} date={today} sub={parts.join(' · ')} trailing={history} />
              })}
            </HabitGroup>
          ))}
        </div>
      </div>
      {listed.length > 0 && (
        <Card className="mt-5 text-[12.5px] leading-relaxed text-ink-3 lg:hidden">
          Tap the clock on a row to see that habit’s history.
        </Card>
      )}
    </Page>
  )
}
