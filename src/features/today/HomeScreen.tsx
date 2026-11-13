import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { Link } from '../../app/router'
import { AttentionList } from '../../components/AttentionList'
import { QuoteLine } from '../../components/QuoteLine'
import { ScoreRing } from '../../components/ScoreRing'
import { db } from '../../data/db'
import type { Exercise, LearningPillar, LearningResource, SetLog } from '../../data/types'
import { attentionItems } from '../../engine/attention'
import { formatDayTitle } from '../../engine/dates'
import { periodOf, shiftPeriod } from '../../engine/periods'
import { dayScore, weekTally } from '../../engine/score'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { hasCloudAccount } from '../../sync/state'
import { areaTone } from '../../ui/Chip'
import { Page } from '../../ui/Page'
import { useLearningNow } from '../learn/hooks'
import { UpNext } from '../learn/UpNext'
import { useQuoteOfDay } from '../quotes/hooks'
import { useTodaysWorkout } from '../train/hooks'
import { lastExportDay } from '../data/lastExport'
import { PlanCard } from './PlanCard'
import { SavedLine } from './SavedLine'

/** The order the user asked for on Home: Learning and Exercise first, then Mind and Body. */
const HOME_ORDER = ['learning', 'exercise', 'mind', 'body']
const rank = (id: string): number => (HOME_ORDER.includes(id) ? HOME_ORDER.indexOf(id) : HOME_ORDER.length)
/** One thing a day: shown as a tick when done, not as "0 / 1". */
const SINGLE_ON_HOME: string[] = ['learning', 'exercise']
const NO_SETS: SetLog[] = []
const NO_EXERCISES: Exercise[] = []
const NO_RESOURCES: LearningResource[] = []
const NO_PILLARS: LearningPillar[] = []

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

  const sets = useLive(() => db.set_logs.toArray(), [], NO_SETS)
  const exercises = useLive(() => db.exercises.toArray(), [], NO_EXERCISES)
  const exercisesById = useMemo(() => new Map(exercises.map((exercise) => [exercise.id!, exercise])), [exercises])
  const resources = useLive(() => db.learning_resources.toArray(), [], NO_RESOURCES)
  const pillars = useLive(() => db.learning_pillars.toArray(), [], NO_PILLARS)

  const day = useMemo(() => dayScore(habits, today, index), [habits, today, index])
  const signedInBefore = hasCloudAccount()
  // The first day anything was tracked, for the backup reminder (shown only without a cloud copy).
  const firstDay = habits.reduce<string | null>((first, habit) => (first === null || habit.created_on < first ? habit.created_on : first), null)
  const learningOpen = day.items.some((item) => item.version.area === 'learning' && !item.done)
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
        sets,
        exercisesById,
        lastExport: signedInBefore ? undefined : lastExportDay(),
        firstDay,
      }),
    [habits, index, today, hour, weekStart, settings, workout, learning, lastWeekReviewed, sets, exercisesById, signedInBefore, firstDay],
  )


  const homeAreas = [...areas].sort((a, b) => rank(a.id) - rank(b.id))

  return (
    <Page title={formatDayTitle(today)} subtitle={greeting(hour, settings.name)} width="wide" backdrop={{ scene: 'mountain', at: 'top', position: '58% 28%' }}>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-5 xl:col-span-8">
          {quote && (
            <div className="order-1 flex flex-col lg:order-none">
              {/* Room for the scene to be seen before anything sits on it. */}
              <div aria-hidden="true" className="h-[118px] lg:h-[190px]" />
              <div className="rounded-card bg-night/60 px-4 py-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-night-ink)_12%,transparent)] backdrop-blur-md lg:max-w-[56ch] lg:p-6">
                <QuoteLine quote={quote} onScene />
              </div>
            </div>
          )}

          {signedInBefore ? (
            <div className="order-1 -my-2 flex lg:order-none">
              <SavedLine />
            </div>
          ) : (
            <Link to="/data" className="order-1 flex min-h-[48px] items-center justify-between gap-3 rounded-card bg-surface px-4 py-2.5 shadow-card lg:order-none">
              <span className="min-w-0 text-[13.5px] leading-snug text-ink-2">Your record is not saved to the cloud from this device yet.</span>
              <span className="shrink-0 text-[13.5px] font-medium text-cream underline underline-offset-2">Sign in to save</span>
            </Link>
          )}
          <nav aria-label="Scores" className="order-2 grid grid-cols-2 gap-2.5 lg:order-none lg:gap-4">
            <Link to="/today" className="block rounded-card transition-opacity duration-100 active:opacity-80">
              <ScoreRing compact lead title="Today" tally={day} caption={day.due === 0 ? 'nothing due' : 'so far'} />
            </Link>
            <Link to="/review" className="block rounded-card transition-opacity duration-100 active:opacity-80">
              <ScoreRing compact lead title="This week" tally={tally} caption="so far" tone="ok" />
            </Link>
            {homeAreas.map((area) => {
              const areaTally = day.by_area.get(area.id) ?? { done: 0, due: 0 }
              return (
                <Link key={area.id} to={area.id === 'learning' ? '/learn' : `/area/${area.id}`} className="block rounded-card transition-opacity duration-100 active:opacity-80">
                  <ScoreRing compact title={area.label} tally={areaTally} caption="today" tone={areaTone(area.color)} single={SINGLE_ON_HOME.includes(area.id) && areaTally.due <= 1} />
                </Link>
              )
            })}
          </nav>

          {learningOpen && (
            <div className="order-3 empty:hidden lg:order-none">
              <UpNext resources={resources} pillars={pillars} />
            </div>
          )}

          <div className="order-3 empty:hidden lg:order-none">
            <PlanCard />
          </div>

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
