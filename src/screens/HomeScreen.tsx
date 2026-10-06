import { Line } from 'react-chartjs-2'
import { Settings } from 'lucide-react'
import '../lib/chartSetup'
import { MenuButton, type Section } from '../components/SectionMenu'
import {
  addDays,
  dateRange,
  formatDayTitle,
  mondayOf,
  todayLocalStr,
  WEEKDAY_INITIALS_MON_FIRST,
} from '../lib/dates'
import {
  computeScore,
  dailyScorePercents,
  isWorkSet,
  mealsLogged,
  supplementAdherence,
  type DoneMap,
} from '../lib/derive'
import {
  useAllWeeklyRecords,
  useMealsForDate,
  useRecentSessions,
  useSetsInRange,
  useSupplementLogsForDate,
  useSupplements,
} from '../lib/hooks'
import { quoteForDate } from '../lib/quotes'
import { useTheme } from '../lib/theme'
import { CHART_PALETTE } from '../lib/themeOptions'
import type { Habit } from '../lib/types'

const press = 'transition-transform duration-100 active:scale-[0.97] active:bg-accent/12'

function Card({
  label,
  value,
  hint,
  onClick,
}: {
  label: string
  value: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[74px] cursor-pointer flex-col justify-between rounded-[4px] border border-ink/14 bg-transparent px-3 py-2.5 text-left ${press}`}
    >
      <span className="text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">{label}</span>
      <span className="font-heading text-[17px] leading-tight text-ink">{value}</span>
      <span className="truncate text-[10.5px] text-ink/35">{hint}</span>
    </button>
  )
}

export function HomeScreen({
  habits,
  doneMap,
  onOpen,
  onMenu,
}: {
  habits: Habit[]
  doneMap: DoneMap
  onOpen: (section: Section) => void
  onMenu: () => void
}) {
  const today = todayLocalStr()
  const weekStart = mondayOf(today)
  const { effective } = useTheme()
  const palette = CHART_PALETTE[effective]

  const quote = quoteForDate(today)
  const score = computeScore(habits, doneMap, today)
  const scorePct = score.total ? Math.round((score.done / score.total) * 100) : 0
  const pending = score.total - score.done

  const weekDates = dateRange(weekStart, addDays(weekStart, 6))
  const weekPercents = dailyScorePercents(habits, doneMap, weekDates)

  const { meals } = useMealsForDate(today)
  const supplements = useSupplements()
  const supplementLogs = useSupplementLogsForDate(today)
  const adherence = supplementAdherence(supplements, supplementLogs, today)

  const recent = useRecentSessions(12)
  const weekSets = useSetsInRange(weekStart, today).filter(isWorkSet)
  const weekSessions = new Set(recent.filter((s) => s.date >= weekStart).map((s) => s.date)).size

  const weekly = useAllWeeklyRecords()
  const weightPoints = weekly
    .filter((w) => w.weight_kg !== null)
    .sort((a, b) => (a.week_monday < b.week_monday ? -1 : 1))
    .slice(-12)

  // Last 14 days of daily score. One line, no fill, no gridlines — the shape is the message.
  const trendDates = dateRange(addDays(today, -13), today)
  const trendValues = dailyScorePercents(habits, doneMap, trendDates).map((v) => Math.round(v * 100))
  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 6, bottom: 6 } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } },
  }

  return (
    <>
      <header className="flex-none border-b border-ink/14 px-4 pt-2 pb-3">
        {/* Controls left, the day and its score right. */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen('habits')}
              aria-label="Habits and settings"
              title="Habits and settings"
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-[4px] border border-ink/20 bg-transparent text-ink/60 ${press}`}
            >
              <Settings size={16} strokeWidth={1.5} />
            </button>
            <MenuButton onClick={onMenu} />
          </div>
          <div className="min-w-0 pt-0.5 text-right font-heading text-[18px] tracking-[0.01em]">
            {formatDayTitle(today)}
          </div>
        </div>

        <div className="mt-1.5 flex items-baseline justify-end gap-2">
          <span className="text-[11.5px] text-ink/50">so far</span>
          <span className="tnum font-heading text-[34px] leading-none">
            {score.done}/{score.total}
          </span>
        </div>
        <div className="mt-2 h-0.5 bg-ink/12">
          <div
            className="h-0.5 bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${scorePct}%` }}
          />
        </div>

        {/* The one place motivational copy is allowed (CLAUDE.md): a single quiet line, now on
            Home rather than Today. */}
        <p className="mt-2.5 text-center font-heading text-[12.5px] leading-[1.4] text-ink/50 italic">
          “{quote.text}” <span className="text-ink/35 not-italic">— {quote.attribution}</span>
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-3 pb-5">
        {/* The week so far, one cell per day. Shade is that day's score; today is outlined. */}
        <div className="flex gap-1">
          {weekDates.map((iso, i) => {
            const future = iso > today
            const pct = weekPercents[i]
            return (
              <div key={iso} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className={`h-8 w-full rounded-[2px] ${iso === today ? 'border border-accent' : ''}`}
                  style={{
                    backgroundColor: future ? 'transparent' : palette.avg,
                    opacity: future ? 0.12 : Math.max(0.12, pct),
                  }}
                />
                <span className={`text-[9.5px] ${iso === today ? 'text-accent' : 'text-ink/42'}`}>
                  {WEEKDAY_INITIALS_MON_FIRST[i]}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Card
            label="Today"
            value={pending === 0 ? 'All ticked' : `${pending} pending`}
            hint={`${score.done} of ${score.total} done`}
            onClick={() => onOpen('today')}
          />
          <Card
            label="Gym"
            value={`${weekSessions} session${weekSessions === 1 ? '' : 's'}`}
            hint={`${weekSets.length} sets this week`}
            onClick={() => onOpen('gym')}
          />
          <Card
            label="Food"
            value={`${mealsLogged(meals)}/4 meals`}
            hint={
              adherence.due ? `supplements ${adherence.taken}/${adherence.due}` : 'no supplements due'
            }
            onClick={() => onOpen('food')}
          />
          <Card
            label="Week"
            value={`${Math.round((weekPercents.reduce((a, b) => a + b, 0) / 7) * 100)}%`}
            hint="grid, weight, notes"
            onClick={() => onOpen('week')}
          />
        </div>

        <div className="mt-6 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
          Daily score · 14 days
        </div>
        {/* A flat line along the bottom reads as a broken chart rather than an empty fortnight,
            so say it in words instead. */}
        {trendValues.every((v) => v === 0) ? (
          <div className="mt-1 text-[12px] text-ink/35">Nothing ticked in the last 14 days.</div>
        ) : (
        <div className="mt-1 h-20">
          <Line
            data={{
              labels: trendDates,
              datasets: [
                {
                  data: trendValues,
                  borderColor: palette.avg,
                  borderWidth: 2,
                  pointRadius: 0,
                  tension: 0,
                },
              ],
            }}
            options={lineOptions}
          />
        </div>
        )}

        {weightPoints.length >= 2 && (
          <>
            <div className="mt-5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
              Weight · {weightPoints.length} weigh-ins
            </div>
            <div className="mt-1 h-20">
              <Line
                data={{
                  labels: weightPoints.map((p) => p.week_monday),
                  datasets: [
                    {
                      data: weightPoints.map((p) => p.weight_kg as number),
                      borderColor: palette.avg,
                      borderWidth: 2,
                      pointRadius: 2.5,
                      pointBackgroundColor: palette.avg,
                      tension: 0,
                    },
                  ],
                }}
                options={{
                  ...lineOptions,
                  scales: { x: { display: false }, y: { display: false } },
                }}
              />
            </div>
            <div className="mt-1 text-[11px] text-ink/35">
              {weightPoints[weightPoints.length - 1].weight_kg} kg latest ·{' '}
              {weightPoints[0].weight_kg} kg at the start
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => onOpen('insights')}
          className={`mt-6 min-h-[44px] w-full cursor-pointer rounded-[4px] border border-ink/20 bg-transparent font-heading text-[14px] text-ink/60 ${press}`}
        >
          Insights
        </button>
      </div>
    </>
  )
}
