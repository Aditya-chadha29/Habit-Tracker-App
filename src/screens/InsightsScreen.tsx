import { Line } from 'react-chartjs-2'
import '../lib/chartSetup'
import {
  allTimeRate,
  dailyScorePercents,
  historyDayCount,
  historyStartDate,
  rollingAverage,
  streak,
  weekdayRateGrid,
} from '../lib/derive'
import {
  dateRange,
  formatShortDate,
  todayLocalStr,
  WEEKDAY_FULL_MON_FIRST,
  WEEKDAY_INITIALS_MON_FIRST,
} from '../lib/dates'
import { useDoneMap, useHabits } from '../lib/hooks'

const RAMP = ['#4b3208', '#7d5411', '#a06f24', '#c28d41', '#e1ad66']
const NO_DATA_FILL = 'rgba(243,242,242,0.03)'

function fillForRate(v: number | null): string {
  if (v === null) return NO_DATA_FILL
  const step = Math.min(5, Math.max(1, Math.ceil(v * 5)))
  return RAMP[step - 1]
}

function GuardBlock({ text }: { text: string }) {
  return (
    <div className="mt-2.5 rounded-[4px] border border-ink/16 p-3.5 text-[12px] leading-[1.5] text-ink/55">
      {text}
    </div>
  )
}

function SectionHeading({ kicker, headline }: { kicker: string; headline: string }) {
  return (
    <>
      <div className="text-[10.5px] tracking-[0.12em] text-gold uppercase">{kicker}</div>
      <div className="mt-0.5 font-heading text-[16px]">{headline}</div>
    </>
  )
}

export function InsightsScreen() {
  const habits = useHabits()
  const doneMap = useDoneMap()
  const today = todayLocalStr()

  const start = historyStartDate(habits)
  const n = historyDayCount(habits, today)
  const dates = start ? dateRange(start, today) : []
  const weeks = n / 7

  const historyLabel = n >= 21 ? `${Math.floor(n / 7)} weeks recorded` : `${n} ${n === 1 ? 'day' : 'days'} recorded`

  // A — heatmap
  const heatOk = n >= 21
  const heatRows = habits.map((h) => ({ habit: h, cells: weekdayRateGrid(h, doneMap, today) }))
  let heatReading = ''
  if (heatOk) {
    let worst: { v: number; wd: number; short: string } | null = null
    for (const row of heatRows) {
      row.cells.forEach((v, wd) => {
        if (v !== null && (!worst || v < worst.v)) worst = { v, wd, short: row.habit.short_name }
      })
    }
    if (worst) {
      const w = worst as { v: number; wd: number; short: string }
      heatReading = `${w.short} holds worst on ${WEEKDAY_FULL_MON_FIRST[w.wd]} — ${Math.round(w.v * 100)}% across ${Math.floor(weeks)} weeks.`
    }
  }
  const heatNeedWeeks = Math.max(1, Math.ceil(3 - n / 7))
  const heatNeed = `${heatNeedWeeks} more ${heatNeedWeeks === 1 ? 'week' : 'weeks'} of logging before weekday patterns are reliable. Needs 3 complete weeks; ${n} ${n === 1 ? 'day' : 'days'} recorded.`

  // B — trend
  const trendOk = n >= 14
  const pcts = dailyScorePercents(habits, doneMap, dates)
  const roll = rollingAverage(pcts, 7)
  const last = roll[roll.length - 1] ?? 0
  const prior = roll[Math.max(0, roll.length - 15)] ?? 0
  const trendNeedDays = 14 - n
  const trendNeed = `${trendNeedDays} more ${trendNeedDays === 1 ? 'day' : 'days'} of logging before a trend line means anything. Needs 14 days.`
  const trendReading = `Seven-day average is at ${Math.round(last * 100)}%, ${last >= prior ? 'up' : 'down'} ${Math.abs(Math.round((last - prior) * 100))} points on two weeks ago.`

  const chartData = {
    labels: dates,
    datasets: [
      {
        data: pcts.map((v) => v * 100),
        borderColor: 'rgba(243,242,242,0.3)',
        borderWidth: 1,
        pointRadius: 0,
        tension: 0,
      },
      {
        data: roll.map((v) => v * 100),
        borderColor: '#e1ad66',
        borderWidth: 2,
        borderDash: [7, 4],
        pointRadius: 0,
        tension: 0,
      },
    ],
  }
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 8, bottom: 20, left: 0, right: 0 } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false, min: 0, max: 100 },
    },
    elements: { line: { capBezierPoints: false } },
  }

  // C — ranked
  const rankOk = n >= 14
  const rankedRows = habits
    .map((h) => ({ habit: h, rate: allTimeRate(h, doneMap, today) }))
    .filter((x): x is { habit: (typeof habits)[number]; rate: number } => x.rate !== null)
    .sort((a, b) => a.rate - b.rate)
  const rankNeedDays = 14 - n
  const rankNeed = `${rankNeedDays} more ${rankNeedDays === 1 ? 'day' : 'days'} of logging before ranking habits. Needs 14 days.`
  const rankReading = rankedRows.length
    ? `Weakest is ${rankedRows[0].habit.short_name} at ${Math.round(rankedRows[0].rate * 100)}%. Work down from the top of this list, one at a time.`
    : ''

  // D — streaks
  const streakRows = habits
    .map((h) => ({ habit: h, ...streak(h, doneMap, today) }))
    .sort((a, b) => b.cur - a.cur)

  return (
    <>
      <header className="border-b border-ink/14 px-4 pt-2.5 pb-2.5">
        <div className="font-heading text-[22px]">Insights</div>
        <div className="mt-0.5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">{historyLabel}</div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 pt-3.5 pb-5">
        <SectionHeading kicker="A · Habit × weekday" headline="Which habits fail, and when" />
        {heatOk ? (
          <div className="mt-2.5">
            <div className="mb-1 grid grid-cols-[96px_repeat(7,1fr)] gap-[3px]">
              <div />
              {WEEKDAY_INITIALS_MON_FIRST.map((label, i) => (
                <div key={i} className="text-center text-[9px] tracking-[0.06em] text-ink/40 uppercase">
                  {label}
                </div>
              ))}
            </div>
            {heatRows.map(({ habit, cells }) => (
              <div key={habit.id} className="mb-[3px] grid grid-cols-[96px_repeat(7,1fr)] items-center gap-[3px]">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] leading-[1.2] text-ink/72">
                  {habit.short_name}
                </div>
                {cells.map((v, wd) => (
                  <div
                    key={wd}
                    title={`${habit.short_name} · ${v === null ? 'no data' : Math.round(v * 100) + '%'}`}
                    className="h-[18px] rounded-[2px]"
                    style={{ background: fillForRate(v) }}
                  />
                ))}
              </div>
            ))}
            <div className="mt-2 flex items-center gap-1.5 text-[9.5px] text-ink/40">
              <span>0%</span>
              {RAMP.map((c, i) => (
                <div key={i} className="h-2 w-[22px] rounded-[1px]" style={{ background: c }} />
              ))}
              <span>100%</span>
            </div>
            <p className="mt-2.5 text-[12px] leading-[1.5] text-ink/62">{heatReading}</p>
          </div>
        ) : (
          <GuardBlock text={heatNeed} />
        )}

        <hr className="my-5 border-ink/14" />

        <SectionHeading kicker="B · Daily score" headline="Am I actually improving" />
        {trendOk ? (
          <div className="mt-2.5">
            <div style={{ height: 128 }} className="relative">
              <div className="absolute inset-x-0 bg-ink/10" style={{ top: 8, height: 1 }} />
              <div className="absolute inset-x-0 bg-ink/10" style={{ top: 58, height: 1 }} />
              <div className="absolute inset-x-0 bg-ink/16" style={{ top: 108, height: 1 }} />
              <Line data={chartData} options={chartOptions} />
            </div>
            <div className="mt-0.5 flex justify-between text-[9.5px] text-ink/40">
              <span>{formatShortDate(dates[0])}</span>
              <span>100%</span>
              <span>{formatShortDate(dates[dates.length - 1])}</span>
            </div>
            <div className="mt-2 flex gap-3.5 text-[10px] text-ink/50">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-px w-4 bg-ink/45" />
                Daily
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-gold" />
                7-day average
              </span>
            </div>
            <p className="mt-2.5 text-[12px] leading-[1.5] text-ink/62">{trendReading}</p>
          </div>
        ) : (
          <GuardBlock text={trendNeed} />
        )}

        <hr className="my-5 border-ink/14" />

        <SectionHeading kicker="C · Ranked" headline="What to work on next" />
        {rankOk ? (
          <div className="mt-2.5">
            {rankedRows.map(({ habit, rate }) => {
              const pct = Math.round(rate * 100)
              const fill = rate < 0.5 ? RAMP[1] : rate < 0.75 ? RAMP[3] : RAMP[4]
              return (
                <div key={habit.id} className="mb-1.5 grid grid-cols-[96px_1fr_34px] items-center gap-2">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] leading-[1.2] text-ink/72">
                    {habit.short_name}
                  </div>
                  <div className="h-3 bg-ink/7">
                    <div className="h-3" style={{ background: fill, width: `${pct}%` }} />
                  </div>
                  <div className="tnum text-right text-[10.5px] text-ink/60">{pct}%</div>
                </div>
              )
            })}
            <p className="mt-2.5 text-[12px] leading-[1.5] text-ink/62">{rankReading}</p>
          </div>
        ) : (
          <GuardBlock text={rankNeed} />
        )}

        <hr className="my-5 border-ink/14" />

        <SectionHeading kicker="D · Streaks" headline="Am I holding it right now" />
        <div className="mt-2.5">
          <div className="grid grid-cols-[1fr_48px_48px] gap-2 border-b border-ink/14 pb-1.5 text-[9px] tracking-[0.1em] text-ink/40 uppercase">
            <div>Habit</div>
            <div className="text-right">Now</div>
            <div className="text-right">Best</div>
          </div>
          {streakRows.map(({ habit, cur, best }) => (
            <div key={habit.id} className="grid grid-cols-[1fr_48px_48px] items-center gap-2 border-b border-ink/7 py-[7px]">
              <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-ink/80">
                {habit.short_name}
              </div>
              <div className={`tnum text-right font-heading text-[15px] ${cur >= 5 ? 'text-gold' : 'text-ink/80'}`}>
                {cur}
              </div>
              <div className="tnum text-right font-heading text-[15px] text-ink/42">{best}</div>
            </div>
          ))}
          <p className="mt-2.5 text-[12px] leading-[1.5] text-ink/62">
            Days, counted to yesterday — today stays pending until logged.
          </p>
        </div>
      </div>
    </>
  )
}
