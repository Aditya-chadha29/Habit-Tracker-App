import { memo, useEffect, useRef, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Check } from 'lucide-react'
import '../lib/chartSetup'
import { computeScore, isDone, isEditable, isHabitActive, type DoneMap } from '../lib/derive'
import { addDays, formatWeekTitle, mondayOf, todayLocalStr, WEEKDAY_LABELS_MON_FIRST } from '../lib/dates'
import { setWeeklyRecord, toggleEntry } from '../lib/mutations'
import { useAllWeeklyRecords, useFlashOnTrue, useWeeklyRecordForWeek } from '../lib/hooks'
import { useTheme } from '../lib/theme'
import type { Habit } from '../lib/types'

const WEIGHT_CHART_COLOR = { dark: '#e1ad66', light: '#b68235' }
const MIN_WEIGHT_POINTS = 6

const WeekCell = memo(function WeekCell({
  habitId,
  iso,
  done,
  tappable,
}: {
  habitId: number
  iso: string
  done: boolean
  tappable: boolean
}) {
  const flashing = useFlashOnTrue(done)
  return (
    <div
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={tappable ? () => toggleEntry(habitId, iso) : undefined}
      onKeyDown={
        tappable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') toggleEntry(habitId, iso)
            }
          : undefined
      }
      className={`flex h-[26px] items-center justify-center rounded-[2px] border transition-colors duration-100 ${
        done ? 'border-gold bg-gold' : 'border-ink/18'
      } ${tappable ? (done ? 'cursor-pointer active:bg-gold-pressed' : 'cursor-pointer active:bg-gold/12') : 'cursor-default'} ${flashing ? 'animate-tick-pop' : ''}`}
    >
      {done && (
        <Check size={11} strokeWidth={3.4} className={`text-on-gold ${flashing ? 'animate-tick-check' : ''}`} />
      )}
    </div>
  )
})

function FutureCell() {
  return <div className="flex h-[26px] items-center justify-center rounded-[2px] border border-ink/8" />
}

export function WeekScreen({ habits, doneMap }: { habits: Habit[]; doneMap: DoneMap }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // See TodayScreen for why: resetting scroll on navigation avoids leaving an overflow:auto
  // region in whatever mid-scroll state can make iOS Safari's touch scrolling get stuck.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [weekOffset])

  const today = todayLocalStr()
  const mondayThisWeek = mondayOf(today)
  const monday = addDays(mondayThisWeek, weekOffset * 7)
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const weekEnd = weekDates[6]

  const weekHabits = habits.filter(
    (h) => h.created_on <= weekEnd && (!h.retired_on || h.retired_on > monday),
  )

  const { record, loaded } = useWeeklyRecordForWeek(monday)

  const weekSub = weekOffset === 0 ? 'This week' : `${Math.abs(weekOffset)} weeks back`

  const { effective } = useTheme()
  const allWeeklyRecords = useAllWeeklyRecords()
  const weightPoints = allWeeklyRecords
    .filter((r): r is typeof r & { weight_kg: number } => r.weight_kg != null)
    .sort((a, b) => a.week_monday.localeCompare(b.week_monday))
  const weightTrendOk = weightPoints.length >= MIN_WEIGHT_POINTS
  const weightNeed = MIN_WEIGHT_POINTS - weightPoints.length
  const weightChartData = {
    labels: weightPoints.map((p) => p.week_monday),
    datasets: [
      {
        data: weightPoints.map((p) => p.weight_kg),
        borderColor: WEIGHT_CHART_COLOR[effective],
        borderWidth: 2,
        pointRadius: 2.5,
        pointBackgroundColor: WEIGHT_CHART_COLOR[effective],
        tension: 0,
      },
    ],
  }
  const weightChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 8, bottom: 8, left: 0, right: 0 } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
  }
  const weightChange = weightTrendOk
    ? Math.round((weightPoints[weightPoints.length - 1].weight_kg - weightPoints[0].weight_kg) * 10) / 10
    : 0
  const weightReading = !weightTrendOk
    ? ''
    : weightChange === 0
      ? `Steady across ${weightPoints.length} weigh-ins.`
      : `${weightChange > 0 ? 'Up' : 'Down'} ${Math.abs(weightChange)} kg across ${weightPoints.length} weigh-ins.`

  return (
    <>
      <header className="flex items-center justify-between border-b border-ink/14 px-4 pt-2 pb-2.5">
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o - 1)}
          className="h-11 w-11 cursor-pointer border-0 bg-transparent font-heading text-[22px] text-gold transition-colors duration-100 active:text-gold-pressed"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="font-heading text-[17px]">{formatWeekTitle(monday)}</div>
          <div className="mt-0.5 text-[10.5px] tracking-[0.12em] text-ink/45 uppercase">{weekSub}</div>
        </div>
        <button
          type="button"
          disabled={weekOffset >= 0}
          onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
          className={`h-11 w-11 border-0 bg-transparent font-heading text-[22px] transition-colors duration-100 ${
            weekOffset < 0 ? 'cursor-pointer text-gold active:text-gold-pressed' : 'text-ink/18'
          }`}
        >
          ›
        </button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 pt-2.5 pb-4">
        <div className="mb-1.5 grid grid-cols-[104px_repeat(7,1fr)] items-center gap-[3px]">
          <div />
          {WEEKDAY_LABELS_MON_FIRST.map((label, i) => (
            <div
              key={label + i}
              className={`text-center text-[9.5px] tracking-[0.06em] uppercase ${
                weekDates[i] === today ? 'text-gold' : 'text-ink/45'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {weekHabits.map((habit) => (
          <div key={habit.id} className="mb-[3px] grid grid-cols-[104px_repeat(7,1fr)] items-center gap-[3px]">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-[1.2] text-ink/72">
              {habit.short_name}
            </div>
            {weekDates.map((iso) => {
              const future = iso > today
              if (future) return <FutureCell key={iso} />
              const done = isDone(doneMap, habit.id!, iso)
              const tappable = isEditable(iso, today) && isHabitActive(habit, iso)
              return <WeekCell key={iso} habitId={habit.id!} iso={iso} done={done} tappable={tappable} />
            })}
          </div>
        ))}

        <div className="mt-[7px] grid grid-cols-[104px_repeat(7,1fr)] items-center gap-[3px] border-t border-ink/14 pt-[7px]">
          <div className="text-[9.5px] tracking-[0.1em] text-ink/45 uppercase">Score</div>
          {weekDates.map((iso) => {
            const future = iso > today
            const label = future ? '—' : (() => {
              const s = computeScore(habits, doneMap, iso)
              return `${s.done}/${s.total}`
            })()
            return (
              <div
                key={iso}
                className={`tnum text-center font-heading text-[12px] ${
                  future ? 'text-ink/20' : iso === today ? 'text-gold' : 'text-ink/60'
                }`}
              >
                {label}
              </div>
            )
          })}
        </div>

        <hr className="my-4 border-ink/14" />

        <div className="flex items-end gap-3">
          <div className="w-[132px]">
            <div className="mb-1 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">Weight (kg)</div>
            <input
              key={`${monday}-${loaded}`}
              type="text"
              inputMode="decimal"
              disabled={!loaded}
              defaultValue={record?.weight_kg != null ? String(record.weight_kg) : ''}
              placeholder="—"
              onBlur={(e) => {
                const v = e.target.value.trim()
                const current = record?.weight_kg ?? null
                if (!v) {
                  if (current !== null) setWeeklyRecord(monday, { weight_kg: null })
                  return
                }
                const num = Number.parseFloat(v)
                if (!Number.isNaN(num)) {
                  const rounded = Math.round(num * 10) / 10
                  e.target.value = String(rounded)
                  if (rounded !== current) setWeeklyRecord(monday, { weight_kg: rounded })
                }
              }}
              className="tnum min-h-[40px] w-full rounded-[4px] border border-ink/20 bg-transparent px-2.5 py-1 font-heading text-[20px] text-ink disabled:opacity-60"
            />
          </div>
          <div className="flex-1 pb-1.5 text-[10.5px] leading-[1.45] text-ink/40">End of week. One decimal.</div>
        </div>

        <div className="mt-3">
          <div className="mb-1 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">Weight trend</div>
          {weightTrendOk ? (
            <div>
              <div style={{ height: 64 }}>
                <Line data={weightChartData} options={weightChartOptions} />
              </div>
              <p className="mt-1.5 text-[11px] leading-[1.4] text-ink/55">{weightReading}</p>
            </div>
          ) : (
            <div className="rounded-[4px] border border-ink/16 p-3 text-[11px] leading-[1.5] text-ink/55">
              {weightNeed} more {weightNeed === 1 ? 'weigh-in' : 'weigh-ins'} before a trend line means
              anything. Needs {MIN_WEIGHT_POINTS}; {weightPoints.length} recorded.
            </div>
          )}
        </div>

        <div className="mt-3">
          <div className="mb-1 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">Notes</div>
          <textarea
            key={`${monday}-${loaded}`}
            disabled={!loaded}
            defaultValue={record?.notes ?? ''}
            placeholder="What changed this week."
            onBlur={(e) => {
              if (e.target.value !== (record?.notes ?? '')) setWeeklyRecord(monday, { notes: e.target.value })
            }}
            className="min-h-[74px] w-full resize-none rounded-[4px] border border-ink/20 bg-transparent px-2.5 py-2 font-body text-[16px] leading-[1.5] text-ink disabled:opacity-60"
          />
        </div>
      </div>
    </>
  )
}
