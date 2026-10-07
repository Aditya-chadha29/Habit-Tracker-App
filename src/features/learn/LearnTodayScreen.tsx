import { useMemo, useState } from 'react'
import { Link, navigate } from '../../app/router'
import { startResource } from '../../data/learningRepo'
import type { LearningLane, LearningResource } from '../../data/types'
import { learningStats, progressFraction, progressLabel, queueOf, TYPE_LABEL } from '../../engine/learning'
import { periodOf } from '../../engine/periods'
import { useCore } from '../../state/core'
import { Button } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/icons'
import { Page } from '../../ui/Page'
import { ProgressBar } from '../../ui/Progress'
import { useLearningNow, useLearningSessions, usePillars, useResources } from './hooks'
import { LearnTabs, metaLine, openResourceLink, PillarChip, ResourceForm, ResourceRow, SessionSheet, StatusChip, TYPE_ICON } from './shared'

/**
 * Learn answers one question: what should I study now? It shows exactly one thing — the head of
 * the queue — and what follows it. The library is elsewhere on purpose.
 */
export default function LearnTodayScreen() {
  const { today, weekStart } = useCore()
  const now = useLearningNow()
  const { list } = useResources()
  const pillars = usePillars()
  const week = useMemo(() => periodOf('week', today, weekStart), [today, weekStart])
  const sessions = useLearningSessions(week.start, today)
  const [logging, setLogging] = useState<{ resource: LearningResource; lane: LearningLane; finishing: boolean } | null>(null)
  const [adding, setAdding] = useState(false)

  const pillarById = useMemo(() => new Map(pillars.map((pillar) => [pillar.id!, pillar])), [pillars])
  const queue = useMemo(() => queueOf(list), [list])
  const stats = useMemo(() => learningStats(sessions, list, pillars, week.start, today), [sessions, list, pillars, week.start, today])
  const todays = sessions.filter((session) => session.date === today)
  const current = now.current
  const fraction = current ? progressFraction(current) : null

  const start = async () => {
    if (!current) return
    openResourceLink(current)
    await startResource(current.id!, today)
  }

  return (
    <Page title="Learn" subtitle="One thing at a time, in order" width="wide" tabs={<LearnTabs current="/learn" />}>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-5 lg:col-span-7">
          {!now.loaded ? null : current ? (
            <Card className="flex flex-col gap-4 lg:p-6">
              <div>
                <p className="eyebrow">Today’s learning</p>
                <h2 className="mt-1.5 text-[24px] leading-tight font-semibold tracking-tight text-ink">{current.title}</h2>
                <p className="mt-1.5 flex items-center gap-2 text-[13.5px] text-ink-2">
                  <Icon name={TYPE_ICON[current.type]} size={16} className="text-ink-3" />
                  {metaLine(current)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <PillarChip pillar={current.pillar_id !== null ? pillarById.get(current.pillar_id) : undefined} />
                  <Chip>{TYPE_LABEL[current.type]}</Chip>
                  <StatusChip status={current.status} head />
                </div>
              </div>
              {(fraction !== null || current.position_note) && (
                <div>
                  {fraction !== null && <ProgressBar value={fraction} max={1} label={`${current.title}: ${Math.round(fraction * 100)} percent`} />}
                  <p className="mt-1.5 text-[12.5px] text-ink-3">{[progressLabel(current), current.position_note].filter(Boolean).join(' · ')}</p>
                </div>
              )}
              <Button variant="primary" size="lg" icon={current.url ? 'external' : 'play'} block onClick={start}>
                {current.status === 'in_progress' ? 'Continue learning' : 'Start learning'}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setLogging({ resource: current, lane: 'learning', finishing: false })}>
                  Log a session
                </Button>
                <Button variant="secondary" icon="check" onClick={() => setLogging({ resource: current, lane: 'learning', finishing: true })}>
                  Mark complete
                </Button>
              </div>
              {todays.some((session) => session.lane === 'learning') && (
                <p className="flex items-center gap-2 text-[13px] text-ok">
                  <Icon name="check-circle" size={16} />
                  Learning logged today.
                </p>
              )}
            </Card>
          ) : (
            <EmptyState
              icon="learn"
              title="Nothing queued."
              body="Add something to your learning queue, and it will be here tomorrow morning."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                    Add a resource
                  </Button>
                  <Button variant="secondary" onClick={() => navigate('/learn/queue')}>
                    Open the queue
                  </Button>
                </div>
              }
            />
          )}

          {queue.length > 1 && (
            <section className="flex flex-col gap-2">
              <SectionTitle
                action={
                  <Link to="/learn/queue" className="font-medium">
                    {now.queueSize} in queue
                  </Link>
                }
              >
                Next in queue
              </SectionTitle>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {queue.slice(1, 4).map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} pillar={resource.pillar_id !== null ? pillarById.get(resource.pillar_id) : undefined} />
                ))}
              </Card>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <section className="flex flex-col gap-2">
            <SectionTitle
              action={
                <Link to="/learn/reading" className="font-medium">
                  Books
                </Link>
              }
            >
              Reading
            </SectionTitle>
            {now.activeBook ? (
              <Card className="flex flex-col gap-3">
                <div>
                  <p className="text-[16px] font-semibold text-ink">{now.activeBook.title}</p>
                  {now.activeBook.author && <p className="text-[13px] text-ink-3">{now.activeBook.author}</p>}
                </div>
                {progressFraction(now.activeBook) !== null && (
                  <ProgressBar value={progressFraction(now.activeBook) ?? 0} max={1} label={`${now.activeBook.title}: ${progressLabel(now.activeBook)}`} />
                )}
                <p className="text-[12.5px] text-ink-3">{[progressLabel(now.activeBook), now.activeBook.position_note].filter(Boolean).join(' · ') || 'Not started'}</p>
                <Button variant="secondary" onClick={() => setLogging({ resource: now.activeBook!, lane: 'reading', finishing: false })}>
                  Log reading session
                </Button>
                {todays.some((session) => session.lane === 'reading') && (
                  <p className="flex items-center gap-2 text-[13px] text-ok">
                    <Icon name="check-circle" size={16} />
                    Reading logged today.
                  </p>
                )}
              </Card>
            ) : (
              <Card className="flex flex-col gap-3">
                <p className="text-[14px] text-ink-2">No book is being read.</p>
                <Button variant="secondary" onClick={() => navigate('/learn/reading')}>
                  Choose a book
                </Button>
              </Card>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <SectionTitle>This week</SectionTitle>
            <Card className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['Sessions', String(stats.sessions)],
                  ['Minutes', String(stats.minutes)],
                  ['Completed', String(stats.completed)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="eyebrow">{label}</p>
                    <p className="tnum mt-1 text-[20px] font-semibold text-ink">{value}</p>
                  </div>
                ))}
              </div>
              {stats.by_pillar.length > 0 && (
                <ul className="flex flex-col gap-1 border-t border-line pt-3">
                  {stats.by_pillar.map((row) => (
                    <li key={row.pillar_id ?? 'none'} className="flex items-baseline gap-3 text-[13.5px]">
                      <span className="min-w-0 flex-1 truncate text-ink-2">{row.name}</span>
                      <span className="tnum text-ink">
                        {row.sessions} {row.sessions === 1 ? 'session' : 'sessions'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      </div>

      {logging && <SessionSheet resource={logging.resource} lane={logging.lane} finishing={logging.finishing} onClose={() => setLogging(null)} />}
      {adding && <ResourceForm pillars={pillars} onClose={() => setAdding(false)} onSaved={() => navigate('/learn/queue')} />}
    </Page>
  )
}
