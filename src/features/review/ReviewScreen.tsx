import { useEffect, useRef, useState } from 'react'
import { Link, navigate, type RouteProps } from '../../app/router'
import { canReflectOn, freezeDueWeeks, saveReflection, weekStatsFor, type ReflectionPatch } from '../../data/reviewRepo'
import type { DateStr, HabitWeekResult, TargetResult, WeeklyReview, WeekStats } from '../../data/types'
import { addDays, formatMediumDate, formatRange, isValidDateStr, weekStartOf } from '../../engine/dates'
import { describeTarget } from '../../engine/describe'
import { firstEditableDate } from '../../engine/lock'
import { rankHabits } from '../../engine/review'
import { targetProgress } from '../../engine/targets'
import { ReviewTabs } from '../../components/ReviewTabs'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'
import { IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { areaTone, Chip, toneText, type Tone } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { Field, TextArea } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { InsightCard } from '../../ui/Metric'
import { Page } from '../../ui/Page'
import { ProgressBar, ProgressRing } from '../../ui/Progress'
import { WeekStrip } from '../../ui/WeekStrip'
import { saveStateLabel, useAutosave } from '../../state/useAutosave'

const pct = (done: number, due: number): number | null => (due ? Math.round((done / due) * 100) : null)

const OUTCOME: Record<TargetResult['outcome'], { tone: Tone; text: (target: TargetResult) => string }> = {
  met: { tone: 'ok', text: () => 'Target met' },
  missed: { tone: 'risk', text: (t) => `Missed target · ${t.target - t.done} ${t.target - t.done === 1 ? 'session' : 'sessions'} short` },
  partial: { tone: 'neutral', text: () => 'Tracked for part of the week · not judged' },
  open: { tone: 'accent', text: (t) => (t.done >= t.target ? 'Target met' : `${t.target - t.done} to go`) },
}

const PROMPTS: { key: keyof ReflectionPatch; label: string }[] = [
  { key: 'reflection_good', label: 'What went well?' },
  { key: 'reflection_bad', label: 'What went badly?' },
  { key: 'reflection_learned', label: 'What did I learn?' },
  { key: 'reflection_change', label: 'What will I change next week?' },
]

function Reflection({ weekStart, initial, editable }: { weekStart: DateStr; initial: WeeklyReview | null; editable: boolean }) {
  const { write } = useCore()
  const [form, setForm] = useState<Required<ReflectionPatch>>({
    reflection_good: initial?.reflection_good ?? '',
    reflection_bad: initial?.reflection_bad ?? '',
    reflection_learned: initial?.reflection_learned ?? '',
    reflection_change: initial?.reflection_change ?? '',
    next_week_notes: initial?.next_week_notes ?? '',
  })
  const state = useAutosave(JSON.stringify(form), () => (editable ? saveReflection(weekStart, form, write, Date.now()) : Promise.resolve()))

  if (!editable) {
    const written = PROMPTS.filter((prompt) => form[prompt.key].trim())
    return (
      <Card className="flex flex-col gap-4">
        {written.length === 0 && !form.next_week_notes.trim() && <p className="text-[14px] text-ink-3">No reflection was written for this week.</p>}
        {written.map((prompt) => (
          <div key={prompt.key}>
            <p className="text-[12.5px] font-medium text-ink-3">{prompt.label}</p>
            <p className="mt-0.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink">{form[prompt.key]}</p>
          </div>
        ))}
        {form.next_week_notes.trim() && (
          <div>
            <p className="text-[12.5px] font-medium text-ink-3">Notes for the week after</p>
            <p className="mt-0.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink">{form.next_week_notes}</p>
          </div>
        )}
        <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <Icon name="lock" size={13} />
          This week is locked. Its reflection can no longer be changed.
        </p>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-4">
      {PROMPTS.map((prompt) => (
        <Field key={prompt.key} label={prompt.label}>
          <TextArea autoGrow rows={2} value={form[prompt.key]} onChange={(event) => setForm({ ...form, [prompt.key]: event.target.value })} />
        </Field>
      ))}
      <Field label="Notes for next week" hint="Anything to carry forward.">
        <TextArea autoGrow rows={2} value={form.next_week_notes} onChange={(event) => setForm({ ...form, next_week_notes: event.target.value })} />
      </Field>
      <p aria-live="polite" className="min-h-5 text-[12.5px] text-ink-3">
        {saveStateLabel(state)}
      </p>
    </Card>
  )
}

function HabitList({ title, habits }: { title: string; habits: HabitWeekResult[] }) {
  if (!habits.length) return null
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {habits.map((habit) => (
          <li key={habit.habit_id} className="flex items-baseline gap-3 text-[14px]">
            <Link to={`/progress/habit/${habit.habit_id}`} className="min-w-0 flex-1 truncate text-ink hover:text-accent-ink">
              {habit.name}
            </Link>
            <span className="tnum shrink-0 text-ink-2">
              {habit.done} of {habit.due}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The weekly review. The app produces all of it from the week's records — score, pillars,
 * targets, what was missed, what stood out — and the owner writes only the reflection.
 * A running week reads "so far"; a week past the correction window is frozen and never changes.
 */
export default function ReviewScreen({ params }: RouteProps) {
  const { today, settings, weekStart: firstDay, areas, habits, index } = useCore()
  const current = weekStartOf(today, firstDay)
  const asked = params.weekStart && isValidDateStr(params.weekStart) ? weekStartOf(params.weekStart, firstDay) : current
  const start = asked > current ? current : asked
  const end = addDays(start, 6)
  const running = end >= today

  // Weeks that have fully left the correction window are frozen the first time Review is opened
  // after they lock. Idempotent, so running it on every visit is harmless.
  const latest = useRef(settings)
  latest.current = settings
  useEffect(() => {
    void freezeDueWeeks(today, latest.current, Date.now())
  }, [today])

  const key = `${start}|${today}|${settings.week_start}|${settings.edit_window_days}`
  const { data, loaded } = useKeyedLiveQuery(key, () => weekStatsFor(start, today, latest.current))
  // The reflection form is mounted once per week from the row as it was then, so a save elsewhere
  // can never replace what is being typed.
  const [mounted, setMounted] = useState<{ start: DateStr; review: WeeklyReview | null } | null>(null)
  if (loaded && data && mounted?.start !== start) setMounted({ start, review: data.review })

  const stats: WeekStats | null = data?.stats ?? null
  const frozen = data?.frozen ?? false
  const editable = canReflectOn(start, today, settings.edit_window_days)
  const overall = stats ? pct(stats.done, stats.due) : null
  const ranked = stats ? rankHabits(stats.habits) : []
  const strongest = ranked.filter((habit) => habit.done === habit.due).slice(0, 4)
  const weakest = ranked.filter((habit) => habit.done < habit.due).slice(-4).reverse()
  const missedTargets = stats?.targets.filter((target) => target.outcome === 'missed') ?? []
  const openTargets = stats?.targets.filter((target) => target.outcome === 'open' && target.done < target.target) ?? []
  const days = stats
    ? Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i)
        const day = stats.days.find((candidate) => candidate.date === date)
        return day ? { ...day, counted: true } : { date, done: 0, due: 0, counted: false }
      })
    : []

  return (
    <Page
      backdrop={{ scene: 'toriiWide', at: 'top', position: '50% 45%', reveal: true }}
      title="Review"
      subtitle={formatRange(start, end)}
      width="wide"
      tabs={<ReviewTabs current="/review" />}
      actions={
        <>
          <IconButton icon="chevron-left" label="Previous week" onClick={() => navigate(`/review/${addDays(start, -7)}`, { replace: true })} />
          <IconButton icon="chevron-right" label="Next week" disabled={start >= current} onClick={() => navigate(`/review/${addDays(start, 7)}`, { replace: true })} />
        </>
      }
    >
      {!stats ? null : (
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
          <div className="flex flex-col gap-5 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              {running ? (
                <Chip tone="accent">In progress</Chip>
              ) : frozen ? (
                <Chip icon="lock">Locked</Chip>
              ) : (
                <Chip tone="warn">Open to correction until {formatMediumDate(addDays(end, settings.edit_window_days - 1))}</Chip>
              )}
              {start !== current && (
                <Link to="/review" className="text-[13px] font-medium text-accent-ink">
                  Go to this week
                </Link>
              )}
            </div>

            <Card className="flex flex-col gap-5">
              <div className="flex items-center gap-5">
                <ProgressRing
                  value={stats.due ? stats.done / stats.due : null}
                  size={108}
                  stroke={9}
                  tone="ok"
                  label={overall === null ? 'Nothing was due this week' : `Week completion ${overall} percent, ${stats.done} of ${stats.due}`}
                >
                  <span className="tnum text-[26px] leading-none font-semibold tracking-tight text-ink">
                    {overall ?? '—'}
                    {overall !== null && <span className="text-[13px] font-medium text-ink-3">%</span>}
                  </span>
                </ProgressRing>
                <div className="min-w-0">
                  <p className="eyebrow">Overall</p>
                  <p className="tnum mt-1 text-[22px] leading-tight font-semibold tracking-tight text-ink">
                    {stats.done} <span className="text-ink-3">of</span> {stats.due}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">{stats.due === 0 ? 'Nothing was tracked this week.' : running ? 'so far this week' : 'for the week'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {stats.areas.map((area) => {
                  const value = pct(area.done, area.due)
                  const config = areas.find((candidate) => candidate.id === area.area)
                  return (
                    <div key={area.area} className="rounded-control bg-surface-2 p-3">
                      <p className={cx('text-[12px] font-medium', toneText(areaTone(config?.color ?? '')))}>{area.label}</p>
                      <p className="tnum mt-1 text-[20px] leading-none font-semibold text-ink">
                        {value === null ? '—' : value}
                        {value !== null && <span className="text-[12px] font-medium text-ink-3">%</span>}
                      </p>
                      <p className="tnum mt-1 text-[12px] text-ink-3">{area.due ? `${area.done} of ${area.due}` : 'nothing due'}</p>
                    </div>
                  )
                })}
              </div>
            </Card>

            <section className="flex flex-col gap-2">
              <SectionTitle>Days</SectionTitle>
              <Card>
                <WeekStrip days={days} today={today} />
              </Card>
            </section>

            {stats.targets.length > 0 && (
              <section className="flex flex-col gap-2">
                <SectionTitle>Key targets</SectionTitle>
                <Card padded={false} className="divide-y divide-line overflow-hidden">
                  {stats.targets.map((target) => {
                    const outcome = OUTCOME[target.outcome]
                    // A target still running is worded exactly as it is on Home and Today.
                    const habit = target.outcome === 'open' && target.per === 'week' ? habits.find((candidate) => candidate.id === target.habit_id) : undefined
                    const live = habit ? targetProgress(habit, { per: 'week', start, end: addDays(start, 6) }, today, index) : null
                    const tone: Tone =
                      target.outcome === 'open' && target.done >= target.target ? 'ok' : live?.state === 'at_risk' ? 'risk' : live?.state === 'attention' ? 'warn' : outcome.tone
                    return (
                      <div key={target.habit_id} className="px-4 py-3">
                        <div className="flex items-baseline gap-2">
                          <Link to={`/progress/habit/${target.habit_id}`} className="min-w-0 flex-1 truncate text-[14.5px] text-ink hover:text-accent-ink">
                            {target.name}
                          </Link>
                          <span className="tnum shrink-0 text-[13.5px] font-medium text-ink">
                            {target.done} / {target.target}
                          </span>
                        </div>
                        <ProgressBar value={Math.min(target.done, target.target)} max={target.target} tone={tone} label={`${target.name}: ${target.done} of ${target.target}`} className="mt-2" />
                        <p className={cx('mt-1.5 text-[12.5px]', toneText(tone === 'accent' ? 'neutral' : tone))}>{live ? describeTarget(live) : outcome.text(target)}</p>
                      </div>
                    )
                  })}
                </Card>
              </section>
            )}

            {!running && (missedTargets.length > 0 || openTargets.length > 0 || weakest.length > 0 || strongest.length > 0) && (
              <section className="flex flex-col gap-2">
                <SectionTitle>{running ? 'Where the week stands' : 'What did I miss?'}</SectionTitle>
                <Card className="flex flex-col gap-5">
                  {missedTargets.length > 0 && (
                    <div>
                      <p className="eyebrow">Missed targets</p>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {missedTargets.map((target) => (
                          <li key={target.habit_id} className="flex items-center gap-2 text-[14px] text-ink">
                            <Icon name="alert-circle" size={15} className="shrink-0 text-risk" />
                            {target.name} — {target.target - target.done} {target.target - target.done === 1 ? 'session' : 'sessions'} short
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {openTargets.length > 0 && (
                    <div>
                      <p className="eyebrow">Still open</p>
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {openTargets.map((target) => (
                          <li key={target.habit_id} className="text-[14px] text-ink">
                            {target.name} — {target.done} of {target.target}, {target.target - target.done} to go
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <HabitList title={running ? 'Lowest so far' : 'Weakest'} habits={weakest} />
                  <HabitList title={running ? 'Complete so far' : 'Strongest'} habits={strongest} />
                </Card>
              </section>
            )}

            {stats.observations.length > 0 && (
              <section className="flex flex-col gap-2">
                <SectionTitle>Observations</SectionTitle>
                {stats.observations.map((line) => (
                  <InsightCard key={line}>{line}</InsightCard>
                ))}
              </section>
            )}
          </div>

          <div className="flex flex-col gap-5 lg:col-span-5">
            <section className="flex flex-col gap-2">
              <SectionTitle>Reflection</SectionTitle>
              {mounted?.start === start ? (
                <Reflection key={start} weekStart={start} initial={mounted.review} editable={editable} />
              ) : (
                <div className="h-40 rounded-card bg-surface" aria-hidden="true" />
              )}
              {data?.review?.legacy_notes && (
                <Card>
                  <p className="eyebrow">Weekly note from the earlier app</p>
                  <p className="mt-2 text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink">{data.review.legacy_notes}</p>
                </Card>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <SectionTitle>Training</SectionTitle>
              <Card className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['Sessions', String(stats.training.sessions)],
                    ['Sets', String(stats.training.sets)],
                    ['Volume', stats.training.volume_kg ? `${stats.training.volume_kg.toLocaleString('en-IN')} kg` : '—'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="eyebrow">{label}</p>
                      <p className="tnum mt-1 text-[17px] font-semibold text-ink">{value}</p>
                    </div>
                  ))}
                </div>
                {stats.training.best && <p className="text-[13px] text-ink-2">Best set: {stats.training.best}</p>}
                {stats.training.sessions === 0 && <p className="text-[13px] text-ink-3">No sessions logged this week.</p>}
              </Card>
            </section>

            {!running && !frozen && (
              <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">
                Days from {formatMediumDate(firstEditableDate(today, settings.edit_window_days))} onward can still be corrected, so these numbers can still move. Once the whole week is
                older than {settings.edit_window_days} days it is locked as it stands.
              </p>
            )}
          </div>
        </div>
      )}
    </Page>
  )
}
