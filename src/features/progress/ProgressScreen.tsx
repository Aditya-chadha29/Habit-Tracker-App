import { useMemo, useState } from 'react'
import { Link, useQueryState } from '../../app/router'
import { db } from '../../data/db'
import type { DateStr } from '../../data/types'
import { addDays, formatShortDate, WEEKDAY_LONG, WEEKDAY_SHORT, weekdayIndex, weekStartOf } from '../../engine/dates'
import { describeFrequency } from '../../engine/describe'
import {
  compareRange, habitSummaries, historyDays, lowestWeekday, pointsWithData, RANGES, rangeFor, standingComparisons,
  streakLeaders, weeklySeries, type Comparison, type RangeKey,
} from '../../engine/insights'
import { weekdayRates } from '../../engine/streaks'
import { LearningInsights, MonthlyHistory } from './LongerViews'
import { currentVersion, isRetired } from '../../engine/timeline'
import { ReviewTabs } from '../../components/ReviewTabs'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { BarChart, LineChart, type Series } from '../../ui/Charts'
import { areaTone } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/icons'
import { MetricCard, TrendMark } from '../../ui/Metric'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'

const RANGE_OPTIONS = RANGES.map((range) => ({ id: range.id, label: range.label }))
const LINES = [
  { id: 'overall', label: 'Overall' },
  { id: 'pillars', label: 'By pillar' },
] as const

const NEED = 'Need more history'

function deltaText(comparison: Comparison): string {
  if (comparison.delta === null) return NEED
  if (comparison.direction === 'flat') return `steady (${comparison.delta >= 0 ? '+' : ''}${comparison.delta} pts)`
  return `${comparison.delta > 0 ? '+' : ''}${comparison.delta} points`
}

/** Shade for a weekday cell. The number is always printed in the cell; the shade only helps the eye. */
function shade(rate: number): string {
  if (rate >= 0.9) return 'bg-accent/45 text-ink'
  if (rate >= 0.75) return 'bg-accent/32 text-ink'
  if (rate >= 0.5) return 'bg-accent/20 text-ink'
  if (rate >= 0.25) return 'bg-accent/10 text-ink-2'
  return 'bg-surface-2 text-ink-2'
}

/**
 * Progress answers "am I actually improving?" with evidence: consistency over a chosen range
 * against the range before it, week-by-week completion, each pillar and habit, and which
 * weekdays are weakest. Anything without enough history behind it says so instead of guessing.
 */
export default function ProgressScreen() {
  const { today, weekStart, areas, habits, index } = useCore()
  const [rawRange, setRange] = useQueryState('range', '30d')
  const [lines, setLines] = useState<(typeof LINES)[number]['id']>('overall')
  const key: RangeKey = RANGES.some((range) => range.id === rawRange) ? (rawRange as RangeKey) : '30d'
  const rangeInfo = RANGES.find((range) => range.id === key)!
  const range = useMemo(() => rangeFor(key, today), [key, today])

  const overall = useMemo(() => compareRange(habits, range, index), [habits, range, index])
  const summaries = useMemo(() => habitSummaries(habits, range, today, weekStart, index), [habits, range, today, weekStart, index])
  const leaders = useMemo(() => streakLeaders(summaries), [summaries])
  const standing = useMemo(() => standingComparisons(habits, today, weekStart, index), [habits, today, weekStart, index])
  const series = useMemo(() => weeklySeries(habits, rangeInfo.weeks, today, weekStart, index), [habits, rangeInfo.weeks, today, weekStart, index])
  const areaSeries = useMemo(
    () => (lines === 'pillars' ? areas.map((area) => ({ area, points: weeklySeries(habits, rangeInfo.weeks, today, weekStart, index, area.id) })) : []),
    [lines, areas, habits, rangeInfo.weeks, today, weekStart, index],
  )
  const pillars = useMemo(() => areas.map((area) => ({ area, comparison: compareRange(habits, range, index, area.id) })), [areas, habits, range, index])
  const retired = habits.filter(isRetired)
  const days = historyDays(habits, today)

  const sessions = useLive(() => db.sessions.toArray(), [], [])
  const learning = useLive(() => db.learning_sessions.toArray(), [], [])
  const perWeek = (rows: { date: DateStr }[]) => {
    const current = weekStartOf(today, weekStart)
    const counts = new Map<DateStr, Set<DateStr>>()
    for (const row of rows) {
      const start = weekStartOf(row.date, weekStart)
      const set = counts.get(start) ?? new Set<DateStr>()
      set.add(row.date)
      counts.set(start, set)
    }
    return Array.from({ length: 12 }, (_, i) => {
      const start = addDays(current, -7 * (11 - i))
      return { x: start, y: counts.get(start)?.size ?? 0 }
    })
  }
  const trainingBars = perWeek(sessions.filter((session) => session.ended_at !== null))
  const learningBars = perWeek(learning)

  const chartSeries: Series[] =
    lines === 'overall'
      ? [{ label: 'Overall', tone: 'accent', points: series.map((point) => ({ x: point.week_start, y: point.rate })) }]
      : areaSeries.map(({ area, points }) => ({ label: area.label, tone: areaTone(area.color), points: points.map((point) => ({ x: point.week_start, y: point.rate })) }))

  const weekdayRows = useMemo(
    () =>
      summaries
        .filter((summary) => summary.streak.unit === 'days')
        .map((summary) => {
          const rates = weekdayRates(summary.habit, range.from, range.to, today, index, weekdayIndex)
          return { habit: summary.habit, rates, lowest: lowestWeekday(rates) }
        })
        .filter((row) => row.rates.some((entry) => entry.due > 0)),
    [summaries, range, today, index],
  )

  if (!habits.length) {
    return (
      <Page title="Progress" width="wide">
        <EmptyState icon="progress" title="Nothing tracked yet." body="History builds up from the first day a habit is tracked." />
      </Page>
    )
  }

  return (
    <Page
      backdrop={{ scene: 'toriiWide', at: 'top', position: '50% 45%', reveal: true }}
      title="Progress"
      subtitle={`${days} ${days === 1 ? 'day' : 'days'} of history`}
      width="wide"
      tabs={
        <div className="flex flex-col gap-2">
          <ReviewTabs current="/progress" />
          <Segmented options={RANGE_OPTIONS} value={key} onChange={setRange} label="Range" size="sm" block />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard
            className="col-span-2 sm:col-span-1"
            label={`Consistency · ${rangeInfo.label}`}
            value={overall.rate === null ? '—' : overall.rate}
            unit={overall.rate === null ? undefined : '%'}
            delta={
              overall.delta === null || overall.direction === null
                ? undefined
                : { text: `${deltaText(overall)} against the ${rangeInfo.label} before`, direction: overall.direction, good: overall.direction === 'flat' ? null : overall.direction === 'up' }
            }
            hint={overall.rate === null ? NEED : overall.delta === null ? `${overall.current.done} of ${overall.current.due} · nothing earlier to compare with` : `${overall.current.done} of ${overall.current.due}`}
          />
          <MetricCard
            label="Longest streak now"
            value={leaders.current ? leaders.current.streak.current : '—'}
            unit={leaders.current ? 'days' : undefined}
            hint={leaders.current ? leaders.current.habit.name : 'No streak running'}
          />
          <MetricCard
            label="Longest streak ever"
            value={leaders.longest ? leaders.longest.streak.longest : '—'}
            unit={leaders.longest ? 'days' : undefined}
            hint={leaders.longest ? leaders.longest.habit.name : NEED}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          <div className="flex flex-col gap-6 lg:col-span-7">
            <Card className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="eyebrow min-w-0 flex-1">Weekly completion · last {rangeInfo.weeks} weeks</h2>
                <Segmented options={LINES} value={lines} onChange={setLines} label="Lines to show" size="sm" />
              </div>
              {pointsWithData(series) >= 2 ? (
                <LineChart
                  series={chartSeries}
                  yMin={0}
                  yMax={100}
                  yFormat={(value) => `${Math.round(value)}%`}
                  xFormat={formatShortDate}
                  height={230}
                  label={`Weekly completion over the last ${rangeInfo.weeks} weeks`}
                />
              ) : (
                <p className="py-6 text-[13.5px] text-ink-3">{NEED}. A trend line appears once two weeks have been tracked.</p>
              )}
              {pointsWithData(series) >= 2 && <p className="text-[12px] text-ink-3">The last point is this week up to yesterday.</p>}
            </Card>

            <section className="flex flex-col gap-2">
              <SectionTitle>Habits · {rangeInfo.label}</SectionTitle>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {summaries.map(({ habit, streak, rate, direction, delta, due }) => (
                  <Link
                    key={habit.id}
                    to={`/progress/habit/${habit.id}`}
                    className="flex min-h-[58px] items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] text-ink">{habit.name}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                        {describeFrequency(currentVersion(habit))}
                        {streak.current >= 2 ? ` · ${streak.current} ${streak.unit} in a row` : ''}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-right">
                      <span className="block text-[14.5px] font-semibold text-ink">{rate === null ? '—' : `${rate}%`}</span>
                      <span className="block text-[11.5px] text-ink-3">{rate === null ? (due ? `${due} due` : streak.unit === 'days' ? 'no data' : 'by target') : `${due} due`}</span>
                    </span>
                    {direction ? (
                      <TrendMark
                        direction={direction}
                        good={direction === 'flat' ? null : direction === 'up'}
                        label={direction === 'flat' ? 'steady' : `${direction} ${Math.abs(delta ?? 0)} points`}
                      />
                    ) : (
                      <span className="w-4" />
                    )}
                    <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />
                  </Link>
                ))}
              </Card>
              {retired.length > 0 && (
                <details className="px-1 text-[13.5px] text-ink-3">
                  <summary className="cursor-pointer py-2 text-accent-ink">Retired habits · {retired.length}</summary>
                  <ul className="flex flex-col">
                    {retired.map((habit) => (
                      <li key={habit.id}>
                        <Link to={`/progress/habit/${habit.id}`} className="flex min-h-[44px] items-center text-ink-2 hover:text-ink">
                          {habit.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-6 lg:col-span-5">
            <section className="flex flex-col gap-2">
              <SectionTitle>Against the period before</SectionTitle>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {standing.map((row) => (
                  <div key={row.label} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] text-ink">{row.label}</span>
                      <span className="block text-[12px] text-ink-3">
                        {row.previous_label}: {row.previous_rate === null ? '—' : `${row.previous_rate}%`}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-right">
                      <span className="block text-[15px] font-semibold text-ink">{row.rate === null ? '—' : `${row.rate}%`}</span>
                      <span className="block text-[11.5px] text-ink-3">{deltaText(row)}</span>
                    </span>
                    {row.direction && <TrendMark direction={row.direction} good={row.direction === 'flat' ? null : row.direction === 'up'} label={deltaText(row)} />}
                  </div>
                ))}
              </Card>
            </section>

            <section className="flex flex-col gap-2">
              <SectionTitle>Pillars · {rangeInfo.label}</SectionTitle>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {pillars.map(({ area, comparison }) => (
                  <Link key={area.id} to={`/area/${area.id}`} className="flex min-h-[52px] items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2">
                    <span className="min-w-0 flex-1 text-[14px] text-ink">{area.label}</span>
                    <span className="tnum shrink-0 text-[12.5px] text-ink-3">{deltaText(comparison)}</span>
                    <span className="tnum w-12 shrink-0 text-right text-[15px] font-semibold text-ink">{comparison.rate === null ? '—' : `${comparison.rate}%`}</span>
                    {comparison.direction ? (
                      <TrendMark direction={comparison.direction} good={comparison.direction === 'flat' ? null : comparison.direction === 'up'} label={deltaText(comparison)} />
                    ) : (
                      <span className="w-4" />
                    )}
                  </Link>
                ))}
              </Card>
            </section>

            <section className="flex flex-col gap-2">
              <SectionTitle
                action={
                  <Link to="/train/history" className="font-medium">
                    History
                  </Link>
                }
              >
                Days trained per week
              </SectionTitle>
              <Card>
                {trainingBars.filter((bar) => bar.y > 0).length >= 2 ? (
                  <BarChart bars={trainingBars} yMax={7} xFormat={formatShortDate} height={130} label="Days trained in each of the last twelve weeks" />
                ) : (
                  <p className="text-[13.5px] text-ink-3">{NEED}.</p>
                )}
              </Card>
            </section>

            <section className="flex flex-col gap-2">
              <SectionTitle
                action={
                  <Link to="/learn" className="font-medium">
                    Learn
                  </Link>
                }
              >
                Days with learning per week
              </SectionTitle>
              <Card>
                {learningBars.filter((bar) => bar.y > 0).length >= 2 ? (
                  <BarChart bars={learningBars.map((bar) => ({ ...bar, tone: 'learning' as const }))} yMax={7} xFormat={formatShortDate} height={130} label="Days with a learning or reading session in each of the last twelve weeks" />
                ) : (
                  <p className="text-[13.5px] text-ink-3">{NEED}.</p>
                )}
              </Card>
            </section>

            <Link to="/progress/weight" className="flex min-h-[56px] items-center gap-3 rounded-card bg-surface px-4 py-2 shadow-card transition-colors duration-100 hover:bg-surface-2">
              <Icon name="scale" size={18} className="text-ink-3" />
              <span className="min-w-0 flex-1 text-[14.5px] text-ink">Body weight</span>
              <Icon name="chevron-right" size={16} className="text-ink-3" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <MonthlyHistory />
          <LearningInsights range={range} label={rangeInfo.label} />
        </div>

        {weekdayRows.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionTitle>Habit by weekday · {rangeInfo.label}</SectionTitle>
            <Card padded={false} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-separate border-spacing-1 p-2 text-[12px]">
                  <thead>
                    <tr>
                      <th scope="col" className="w-[38%] px-2 py-1 text-left font-medium text-ink-3">
                        Habit
                      </th>
                      {WEEKDAY_SHORT.map((day) => (
                        <th key={day} scope="col" className="px-1 py-1 text-center font-medium text-ink-3">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weekdayRows.map(({ habit, rates }) => (
                      <tr key={habit.id}>
                        <th scope="row" className="max-w-0 truncate px-2 py-1 text-left text-[13px] font-normal text-ink">
                          {habit.short_name || habit.name}
                        </th>
                        {rates.map((entry, weekday) => (
                          <td key={weekday} className="p-0 text-center">
                            {entry.rate === null || entry.due < 2 ? (
                              <span className="tnum flex h-8 items-center justify-center rounded-[6px] border border-dashed border-line text-ink-3" title="Not enough days yet">
                                ·
                              </span>
                            ) : (
                              <span className={cx('tnum flex h-8 items-center justify-center rounded-[6px] font-medium', shade(entry.rate))}>{Math.round(entry.rate * 100)}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="px-1 text-[12.5px] text-ink-3">Percent of due days done. A dot means too few days to say.</p>
            {weekdayRows.some((row) => row.lowest) && (
              <ul className="flex flex-col gap-1 px-1 text-[13.5px] text-ink-2">
                {weekdayRows
                  .filter((row) => row.lowest)
                  .slice(0, 5)
                  .map((row) => (
                    <li key={row.habit.id}>
                      {WEEKDAY_LONG[row.lowest!.weekday]} has the lowest completion rate for {row.habit.name} ({Math.round(row.lowest!.rate * 100)}%).
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Page>
  )
}
