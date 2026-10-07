import { useMemo } from 'react'
import { Link } from '../../app/router'
import { db } from '../../data/db'
import type { LearningPillar, LearningResource, LearningSession } from '../../data/types'
import { formatMonthTitle } from '../../engine/dates'
import { monthlySeries } from '../../engine/history'
import type { DateRange } from '../../engine/insights'
import { learningStats, TYPE_LABEL } from '../../engine/learning'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { ProgressBar } from '../../ui/Progress'

const NO_SESSIONS: LearningSession[] = []
const NO_RESOURCES: LearningResource[] = []
const NO_PILLARS: LearningPillar[] = []

/** Month by month: the same completion figure as everywhere else, one row per month. */
export function MonthlyHistory() {
  const { today, habits, index } = useCore()
  const months = useMemo(() => monthlySeries(habits, 12, today, index).filter((point) => point.due > 0), [habits, today, index])
  if (months.length < 2) return null
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Month by month</SectionTitle>
      <Card className="flex flex-col gap-3">
        {[...months].reverse().map((point) => (
          <div key={point.month} className="flex items-center gap-3">
            <span className="w-[112px] shrink-0 text-[13.5px] text-ink">
              {formatMonthTitle(point.month)}
              {point.running && <span className="block text-[11.5px] text-ink-3">so far</span>}
            </span>
            <ProgressBar value={point.done} max={point.due} label={`${formatMonthTitle(point.month)}: ${point.done} of ${point.due}`} className="min-w-0 flex-1" />
            <span className="tnum w-11 shrink-0 text-right text-[13.5px] font-medium text-ink">{point.rate === null ? '—' : `${point.rate}%`}</span>
            <span className="tnum hidden w-[88px] shrink-0 text-right text-[12px] text-ink-3 sm:block">
              {point.done} of {point.due}
            </span>
          </div>
        ))}
      </Card>
    </section>
  )
}

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="tnum mt-1 text-[19px] font-semibold tracking-tight text-ink">{value}</p>
    </div>
  )
}

/** What was studied over the chosen range: sessions, time, what was finished, and where it went. */
export function LearningInsights({ range, label }: { range: DateRange; label: string }) {
  const sessions = useLive(() => db.learning_sessions.toArray(), [], NO_SESSIONS)
  const resources = useLive(() => db.learning_resources.toArray(), [], NO_RESOURCES)
  const pillars = useLive(() => db.learning_pillars.toArray(), [], NO_PILLARS)
  const stats = useMemo(() => learningStats(sessions, resources, pillars, range.from, range.to), [sessions, resources, pillars, range])
  const added = resources.filter((resource) => resource.created_on >= range.from && resource.created_on <= range.to).length
  const queued = resources.filter((resource) => resource.status === 'queued' || resource.status === 'in_progress').length
  const finished = resources.filter((resource) => resource.completed_on !== null && resource.completed_on >= range.from && resource.completed_on <= range.to)
  const byType = new Map<string, number>()
  for (const resource of finished) byType.set(TYPE_LABEL[resource.type], (byType.get(TYPE_LABEL[resource.type]) ?? 0) + 1)
  const most = stats.by_pillar.reduce((max, row) => Math.max(max, row.sessions), 0)

  if (!resources.length && !sessions.length) return null
  const hours = stats.minutes >= 60 ? `${Math.round((stats.minutes / 60) * 10) / 10} h` : `${stats.minutes} min`

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle
        action={
          <Link to="/learn/library" className="font-medium">
            Library
          </Link>
        }
      >
        Learning · {label}
      </SectionTitle>
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-x-3 gap-y-4">
          <Figure label="Sessions" value={stats.sessions} />
          <Figure label="Time" value={stats.minutes ? hours : '—'} />
          <Figure label="Finished" value={stats.completed} />
          <Figure label="Added" value={added} />
          <Figure label="In the queue" value={queued} />
        </div>
        {stats.by_pillar.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            {stats.by_pillar.map((row) => (
              <div key={row.pillar_id ?? 'none'} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{row.name}</span>
                <span className="h-2 w-[30%] shrink-0 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                  <span className="block h-full rounded-full bg-learning" style={{ width: `${most ? Math.round((row.sessions / most) * 100) : 0}%` }} />
                </span>
                <span className="tnum w-[84px] shrink-0 text-right text-[12.5px] text-ink-2">
                  {row.sessions} {row.sessions === 1 ? 'session' : 'sessions'}
                </span>
              </div>
            ))}
          </div>
        )}
        {byType.size > 0 && (
          <p className="border-t border-line pt-3 text-[12.5px] text-ink-3">
            Finished: {[...byType.entries()].map(([type, count]) => `${count} ${type.toLowerCase()}${count === 1 ? '' : 's'}`).join(' · ')}
          </p>
        )}
        {stats.sessions === 0 && <p className="text-[12.5px] text-ink-3">No learning session was logged in this period.</p>}
      </Card>
    </section>
  )
}
