import { useMemo } from 'react'
import { Link, navigate, type RouteProps } from '../../app/router'
import { db } from '../../data/db'
import type { LearningSession, Meal, Session, SetLog, WeightEntry } from '../../data/types'
import { addMonths, formatMonthTitle, isValidDateStr, monthStartOf } from '../../engine/dates'
import { monthReport, type MonthHabitRow } from '../../engine/monthReport'
import { weightIn } from '../../engine/training'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { Page } from '../../ui/Page'

const NO_SESSIONS: Session[] = []
const NO_SETS: SetLog[] = []
const NO_WEIGHTS: WeightEntry[] = []
const NO_LEARNING: LearningSession[] = []
const NO_MEALS: Meal[] = []

function HabitRows({ title, rows }: { title: string; rows: MonthHabitRow[] }) {
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {rows.map((row) => (
          <Link key={row.id} to={`/progress/habit/${row.id}`} className="flex min-h-[48px] items-center gap-3 px-4 py-2 hover:bg-surface-2">
            <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{row.name}</span>
            <span className="tnum shrink-0 text-[12.5px] text-ink-3">
              {row.done} of {row.due}
            </span>
            <span className="tnum w-12 shrink-0 text-right text-[14.5px] font-semibold text-ink">{row.rate}%</span>
          </Link>
        ))}
      </Card>
    </section>
  )
}

/** A month in figures: every habit's rate, the best and worst of them, training, weight, learning, meals. */
export default function MonthScreen({ params }: RouteProps) {
  const { today, habits, index, settings } = useCore()
  const current = monthStartOf(today)
  const asked = `${params.month ?? ''}-01`
  const month = isValidDateStr(asked) && asked <= current ? asked : current
  const sessions = useLive(() => db.sessions.toArray(), [], NO_SESSIONS)
  const sets = useLive(() => db.set_logs.toArray(), [], NO_SETS)
  const weights = useLive(() => db.weight_entries.toArray(), [], NO_WEIGHTS)
  const learning = useLive(() => db.learning_sessions.toArray(), [], NO_LEARNING)
  const meals = useLive(() => db.meals.toArray(), [], NO_MEALS)
  const report = useMemo(() => monthReport({ month, today, habits, index, sessions, sets, weights, learning, meals }), [month, today, habits, index, sessions, sets, weights, learning, meals])
  const unit = settings.weight_unit
  const go = (shift: number) => navigate(`/review/month/${addMonths(month, shift).slice(0, 7)}`, { replace: true })
  const weight = (kg: number | null) => (kg === null ? '—' : `${weightIn(kg, unit)} ${unit}`)
  const figures: [string, string][] = [
    ['Completion', report.due ? `${Math.round((report.done / report.due) * 100)}% · ${report.done} of ${report.due}` : '—'],
    ['Days trained', String(report.gymDays)],
    ['Work sets', String(report.workSets)],
    report.weighIns === 1 ? ['Weight, one weigh-in', weight(report.weightStart)] : ['Weight, first to last', report.weightStart === null ? '—' : `${weight(report.weightStart)} to ${weight(report.weightEnd)}`],
    ['Minutes learned', String(report.minutesLearned)],
    ['Meals eaten out', `${report.mealsOut} of ${report.mealsLogged} logged`],
    ['Days off', String(report.daysOff)],
  ]

  return (
    <Page
      title={formatMonthTitle(month)}
      subtitle={month === current ? 'This month, up to yesterday' : 'The month in figures'}
      back="/review"
      width="narrow"
      actions={
        <>
          <IconButton icon="chevron-left" label="Month before" onClick={() => go(-1)} />
          <IconButton icon="chevron-right" label="Month after" disabled={month >= current} onClick={() => go(1)} />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {figures.map(([label, value]) => (
            <div key={label} className="flex min-h-[44px] items-baseline gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 text-[14px] text-ink-2">{label}</span>
              <span className="tnum shrink-0 text-[14.5px] font-medium text-ink">{value}</span>
            </div>
          ))}
        </Card>
        {report.habits.length === 0 && <p className="px-1 text-[13.5px] text-ink-3">Nothing was due in this month.</p>}
        <HabitRows title="Highest" rows={report.highest} />
        <HabitRows title="Lowest" rows={report.lowest} />
        <HabitRows title="Every habit" rows={report.habits} />
      </div>
    </Page>
  )
}
