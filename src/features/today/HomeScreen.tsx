import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Link } from '../../app/router'
import { AttentionList } from '../../components/AttentionList'
import { QuoteLine } from '../../components/QuoteLine'
import { ScoreRing } from '../../components/ScoreRing'
import { db } from '../../data/db'
import { attentionItems } from '../../engine/attention'
import { formatDayTitle } from '../../engine/dates'
import { periodOf, shiftPeriod } from '../../engine/periods'
import { dayScore } from '../../engine/score'
import { useCore } from '../../state/core'
import { Card } from '../../ui/Card'
import { areaTone, toneBg, toneText } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/icons'
import { Page } from '../../ui/Page'
import { useLearningNow } from '../learn/hooks'
import { useQuoteOfDay } from '../quotes/hooks'
import { useTodaysWorkout } from '../train/hooks'
import { areaIcon } from './areaMeta'

function greeting(hour: number, name: string): string {
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}` : part
}

/** A faint ridge line behind the quote: a nod to the mountains in the reference design, drawn
 *  rather than photographed so it costs nothing and works offline in both themes. */
function Ridge() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 600 160"
      preserveAspectRatio="xMaxYMax slice"
      className="pointer-events-none absolute inset-0 h-full w-full text-accent-ink"
    >
      <path d="M0 160 L0 120 L70 84 L120 108 L190 52 L250 100 L300 70 L372 124 L430 90 L500 132 L560 104 L600 122 L600 160 Z" fill="currentColor" opacity="0.05" />
      <path d="M180 160 L300 96 L352 128 L428 60 L492 116 L540 92 L600 136 L600 160 Z" fill="currentColor" opacity="0.06" />
    </svg>
  )
}

/**
 * Home answers one question in about five seconds: where am I?
 * Today so far, the week so far, each pillar, what needs attention, what is next, and whether
 * things are getting better or worse — in that order.
 */
export default function HomeScreen() {
  const { today, hour, settings, weekStart, areas, habits, index } = useCore()
  const workout = useTodaysWorkout()
  const learning = useLearningNow()
  const { quote } = useQuoteOfDay(today)

  const week = useMemo(() => periodOf('week', today, weekStart), [today, weekStart])
  const lastWeekStart = shiftPeriod(week, -1).start
  const lastWeekReviewed =
    useLiveQuery(async () => {
      const review = await db.weekly_reviews.get(lastWeekStart)
      if (!review) return false
      return [review.reflection_good, review.reflection_bad, review.reflection_learned, review.reflection_change].some((text) => text.trim() !== '')
    }, [lastWeekStart]) ?? true

  const day = useMemo(() => dayScore(habits, today, index), [habits, today, index])

  const attention = useMemo(
    () =>
      attentionItems({
        habits,
        index,
        today,
        hour,
        weekStart,
        eveningHour: settings.evening_hour,
        reviewDay: settings.review_day,
        workout: workout.loaded ? { scheduled: workout.scheduled[0]?.name ?? null, doneToday: workout.finished.length > 0 } : null,
        learning:
          learning.current && learning.currentDaysInProgress !== null
            ? { title: learning.current.title, daysInProgress: learning.currentDaysInProgress, staleDays: settings.learning_stale_days }
            : null,
        lastWeekReviewed,
      }),
    [habits, index, today, hour, weekStart, settings, workout, learning, lastWeekReviewed],
  )


  return (
    <Page title={formatDayTitle(today)} subtitle={greeting(hour, settings.name)} width="wide">
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-5 xl:col-span-8">
          {quote && (
            <Card className="relative order-1 overflow-hidden lg:order-none lg:p-6">
              <Ridge />
              <QuoteLine quote={quote} className="relative" />
            </Card>
          )}

          <div className="order-2 lg:order-none">
            <ScoreRing
              title="Today"
              tally={day}
              caption={day.due === 0 ? 'nothing due' : 'so far'}
              footer={
                <Link to="/today" className="mt-1.5 inline-block text-[13px] font-medium text-accent-ink">
                  Open today
                </Link>
              }
            />
          </div>

          <nav aria-label="Pillars" className="order-3 grid grid-cols-4 gap-2 sm:gap-3 lg:order-none lg:gap-5">
            {areas.map((area) => {
              const part = day.by_area.get(area.id)
              const tone = areaTone(area.color)
              return (
                <Link
                  key={area.id}
                  to={`/area/${area.id}`}
                  className="flex min-w-0 flex-col gap-1.5 rounded-card bg-surface p-2.5 shadow-card transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3 sm:p-3.5"
                >
                  <span className={cx('flex h-8 w-8 items-center justify-center rounded-control', toneBg(tone), toneText(tone))}>
                    <Icon name={areaIcon(area)} size={17} />
                  </span>
                  <span className="truncate text-[12.5px] font-medium text-ink-2 sm:text-[13.5px]">{area.label}</span>
                  <span className={cx('tnum text-[15px] font-semibold', part && part.done === part.due ? 'text-ok' : 'text-ink')}>
                    {part ? `${part.done} / ${part.due}` : '—'}
                    <span className="sr-only">{part ? ' done today' : ' nothing due today'}</span>
                  </span>
                </Link>
              )
            })}
          </nav>

        </div>

        <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-5 xl:col-span-4">
          <div className="order-4 empty:hidden lg:order-none">
            <AttentionList items={attention} />
          </div>


        </div>
      </div>
    </Page>
  )
}
