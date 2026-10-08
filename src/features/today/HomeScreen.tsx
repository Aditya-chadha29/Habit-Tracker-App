import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Link } from '../../app/router'
import { AttentionList } from '../../components/AttentionList'
import { QuoteLine } from '../../components/QuoteLine'
import { Scene } from '../../components/Scene'
import { ScoreRing } from '../../components/ScoreRing'
import { db } from '../../data/db'
import { attentionItems } from '../../engine/attention'
import { formatDayTitle } from '../../engine/dates'
import { periodOf, shiftPeriod } from '../../engine/periods'
import { dayScore, weekTally } from '../../engine/score'
import { useCore } from '../../state/core'
import { hasCloudAccount } from '../../sync/state'
import { Card } from '../../ui/Card'
import { areaTone } from '../../ui/Chip'
import { Page } from '../../ui/Page'
import { useLearningNow } from '../learn/hooks'
import { useQuoteOfDay } from '../quotes/hooks'
import { useTodaysWorkout } from '../train/hooks'

function greeting(hour: number, name: string): string {
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}` : part
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
  const tally = useMemo(() => weekTally(habits, week, today, index), [habits, week, today, index])

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
          {!hasCloudAccount() && (
            <Card className="flex flex-col gap-3">
              <p className="text-[14px] font-medium text-ink">Sign in to your cloud copy</p>
              <p className="text-[13.5px] leading-relaxed text-ink-2">
                Your record is kept in your cloud account. Sign in to bring it to this device, or to save what is here.
              </p>
              <Link to="/data" className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-4 text-[14px] font-medium text-on-accent">
                Sign in
              </Link>
            </Card>
          )}
          {quote && (
            <Card padded={false} className="relative order-1 flex min-h-[248px] flex-col justify-end overflow-hidden p-3 lg:order-none lg:min-h-[340px] lg:p-6">
              <Scene name="mountain" fade="soft" position="62% 30%" eager />
              <div className="relative rounded-control bg-night/70 px-4 py-3.5 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-night-ink)_10%,transparent)] backdrop-blur-sm lg:max-w-[52ch]">
                <QuoteLine quote={quote} onScene />
              </div>
            </Card>
          )}

          <nav aria-label="Scores" className="order-2 grid grid-cols-2 gap-2.5 lg:order-none lg:gap-4">
            <Link to="/today" className="block rounded-card transition-opacity duration-100 active:opacity-80">
              <ScoreRing compact lead title="Today" tally={day} caption={day.due === 0 ? 'nothing due' : 'so far'} />
            </Link>
            <Link to="/review" className="block rounded-card transition-opacity duration-100 active:opacity-80">
              <ScoreRing compact lead title="This week" tally={tally} caption="so far" tone="ok" />
            </Link>
            {areas.map((area) => (
              <Link key={area.id} to={area.id === 'learning' ? '/learn' : `/area/${area.id}`} className="block rounded-card transition-opacity duration-100 active:opacity-80">
                <ScoreRing compact title={area.label} tally={day.by_area.get(area.id) ?? { done: 0, due: 0 }} caption="today" tone={areaTone(area.color)} />
              </Link>
            ))}
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
