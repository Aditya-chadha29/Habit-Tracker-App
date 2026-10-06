import { useMemo, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { formatShortDate, mondayIndex, mondayOf, todayLocalStr } from '../lib/dates'
import {
  WEEKLY_SET_BAND,
  bestSet,
  e1rm,
  formatSetLine,
  groupSetsByDate,
  isWorkSet,
  setsByMuscle,
} from '../lib/derive'
import {
  useAllWeeklyRecords,
  useExercises,
  useRecentSessions,
  useRoutines,
  useSessionsForDate,
  useSetsForExercise,
  useSetsInRange,
} from '../lib/hooks'
import { startSession } from '../lib/mutations'
import { ExercisePicker } from '../components/gym/ExercisePicker'
import { RoutineManager } from '../components/gym/RoutineManager'
import { SessionView } from '../components/gym/SessionView'
import type { Exercise } from '../lib/types'

const press = 'transition-transform duration-100 active:scale-[0.97] active:bg-accent/12'

/** The last few sessions of one exercise as plain text, plus its best set. The most useful thing
 *  a training log can show, and it needs no chart. */
function ExerciseHistory({ exercise, onBack }: { exercise: Exercise; onBack: () => void }) {
  const sets = useSetsForExercise(exercise.id!)
  const sessions = groupSetsByDate(sets.filter(isWorkSet)).slice(0, 6)
  const top = bestSet(sets)
  const topEstimate = top ? e1rm(top.weight_kg, top.reps, top.rir) : null

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-grain">
      <div className="flex flex-none items-center gap-2 border-b border-ink/14 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className={`flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent text-accent ${press}`}
        >
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <div className="min-w-0">
          <div className="truncate font-heading text-[16px]">{exercise.name}</div>
          <div className="text-[10.5px] tracking-[0.06em] text-ink/42 uppercase">
            {exercise.primary_muscle} · {exercise.equipment}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {top && (
          <div className="border-b border-ink/9 px-4 py-3 text-[12px] text-ink/60">
            Best set{' '}
            <span className="tnum text-ink">
              {top.weight_kg !== null && top.reps !== null
                ? `${top.weight_kg} × ${top.reps}`
                : formatSetLine([top])}
            </span>{' '}
            · {formatShortDate(top.date)}
            {topEstimate !== null && (
              <span className="text-ink/35"> · est. 1RM {Math.round(topEstimate)} kg</span>
            )}
          </div>
        )}

        {sessions.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-ink/35">Nothing logged for this yet.</div>
        )}

        {sessions.map(({ date, sets: rows }) => (
          <div key={date} className="border-b border-ink/9 px-4 py-2.5">
            <div className="text-[10.5px] tracking-[0.06em] text-ink/42 uppercase">
              {formatShortDate(date)}
            </div>
            <div className="tnum mt-0.5 text-[13px] text-ink/80">{formatSetLine(rows)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GymScreen({ active }: { active: boolean }) {
  const today = todayLocalStr()
  const [openId, setOpenId] = useState<number | null>(null)
  const [showRoutines, setShowRoutines] = useState(false)
  const [historyFor, setHistoryFor] = useState<Exercise | null>(null)
  const [pickingHistory, setPickingHistory] = useState(false)

  const routines = useRoutines()
  const exercises = useExercises()
  const weekly = useAllWeeklyRecords()
  const { sessions: todaySessions } = useSessionsForDate(today)
  const recent = useRecentSessions(12)

  const weekStart = mondayOf(today)
  const rangeStart = recent.length
    ? [...recent.map((s) => s.date), weekStart].reduce((min, d) => (d < min ? d : min))
    : weekStart
  const rangeSets = useSetsInRange(rangeStart, today)

  const exercisesById = useMemo(() => new Map(exercises.map((e) => [e.id!, e])), [exercises])

  // Cheap derivation over a bounded range, so it can run on every render.
  const weekSets = rangeSets.filter((s) => s.date >= weekStart && isWorkSet(s))
  const muscles = setsByMuscle(weekSets, exercisesById)
  const weekSessionDates = new Set(recent.filter((s) => s.date >= weekStart).map((s) => s.date))
  const setCountBySession = new Map<number, number>()
  for (const s of rangeSets) {
    if (!isWorkSet(s)) continue
    setCountBySession.set(s.session_id, (setCountBySession.get(s.session_id) ?? 0) + 1)
  }

  const openSession = todaySessions.find((s) => s.ended_at === null)
  const liveSession = openId ? todaySessions.find((s) => s.id === openId) : undefined
  const activeRoutines = routines.filter((r) => !r.retired_on)
  const suggested = activeRoutines.find((r) => r.day_hint === mondayIndex(today) + 1)
  const others = activeRoutines.filter((r) => r.id !== suggested?.id)
  const latestWeight = weekly
    .filter((w) => w.weight_kg !== null)
    .sort((a, b) => (a.week_monday < b.week_monday ? 1 : -1))[0]

  const begin = async (routineId: number | null) => {
    const id = await startSession(routineId, today)
    setOpenId(id)
  }

  if (liveSession) {
    return <SessionView session={liveSession} onExit={() => setOpenId(null)} />
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex flex-none items-center justify-between gap-2 border-b border-ink/14 px-4 pt-2 pb-2.5">
        <div>
          <div className="font-heading text-[22px]">Gym</div>
          <div className="mt-0.5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
            {weekSessionDates.size} session{weekSessionDates.size === 1 ? '' : 's'} this week
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          {latestWeight?.weight_kg != null && (
            <span className="text-[11px] text-ink/35">{latestWeight.weight_kg} kg</span>
          )}
          <button
            type="button"
            onClick={() => setShowRoutines(true)}
            className={`min-h-[36px] cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-3 font-heading text-[13px] text-ink/60 ${press}`}
          >
            Routines
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto pb-5">
        <div className="px-4 pt-4">
          {openSession ? (
            <button
              type="button"
              onClick={() => setOpenId(openSession.id!)}
              className={`min-h-[64px] w-full cursor-pointer rounded-[4px] border border-accent bg-accent font-heading text-[16px] tracking-[0.04em] text-on-accent ${press}`}
            >
              Resume · {openSession.title}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void begin(suggested?.id ?? null)}
              className={`min-h-[64px] w-full cursor-pointer rounded-[4px] border border-accent bg-accent font-heading text-[16px] tracking-[0.04em] text-on-accent ${press}`}
            >
              Start · {suggested ? suggested.name : 'Free session'}
            </button>
          )}

          {!openSession && (
            <div className="mt-2 flex flex-wrap gap-2">
              {others.map((routine) => (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() => void begin(routine.id!)}
                  className={`min-h-[44px] cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-3 text-[13px] text-ink/72 ${press}`}
                >
                  {routine.name}
                </button>
              ))}
              {suggested && (
                <button
                  type="button"
                  onClick={() => void begin(null)}
                  className={`min-h-[44px] cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-3 text-[13px] text-ink/72 ${press}`}
                >
                  Free session
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pt-6 pb-1 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
          This week · {weekSets.length} work sets
        </div>
        {muscles.length === 0 ? (
          <div className="px-4 py-2 text-[12px] text-ink/35">Nothing logged yet this week.</div>
        ) : (
          <div className="px-4 pt-1">
            {muscles.map(({ muscle, count }) => (
              <div key={muscle} className="mb-1.5 flex items-center gap-2">
                <span className="w-20 flex-none text-[11px] text-ink/60">{muscle}</span>
                <div className="relative h-2.5 min-w-0 flex-1 bg-ink/7">
                  {/* The 10–20 band is a reference, not a target: no colour change for being
                      outside it, and no score attached to being inside it. */}
                  <div
                    className="absolute inset-y-0 bg-ink/10"
                    style={{
                      left: `${(WEEKLY_SET_BAND.low / 24) * 100}%`,
                      width: `${((WEEKLY_SET_BAND.high - WEEKLY_SET_BAND.low) / 24) * 100}%`,
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-accent"
                    style={{ width: `${Math.min(100, (count / 24) * 100)}%` }}
                  />
                </div>
                <span className="tnum w-6 flex-none text-right text-[11px] text-ink/72">
                  {count}
                </span>
              </div>
            ))}
            <div className="pt-1 text-[10.5px] text-ink/28">
              Hard sets per muscle, counting the main muscle of each exercise. The shaded band is
              10–20 sets a week.
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-4 pt-6 pb-1">
          <span className="text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">Recent</span>
          <button
            type="button"
            onClick={() => setPickingHistory(true)}
            className={`min-h-[32px] cursor-pointer rounded-[4px] border-0 bg-transparent px-1 font-heading text-[12px] text-ink/50 underline decoration-ink/25 underline-offset-2 ${press}`}
          >
            Exercise history
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-2 text-[12px] text-ink/35">No sessions logged yet.</div>
        ) : (
          recent.map((session) => (
            <div
              key={session.id}
              className="flex items-baseline gap-2 border-b border-ink/9 px-4 py-2.5"
            >
              <span className="w-14 flex-none text-[11px] text-ink/42">
                {formatShortDate(session.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink/80">
                {session.title}
              </span>
              <span className="tnum flex-none text-[11.5px] text-ink/45">
                {setCountBySession.get(session.id!) ?? 0} sets
              </span>
              {session.ended_at === null && (
                <span className="flex-none text-[10.5px] text-accent">open</span>
              )}
            </div>
          ))
        )}
      </div>

      {showRoutines && <RoutineManager onClose={() => setShowRoutines(false)} />}

      {pickingHistory && active && (
        <ExercisePicker
          exercises={exercises}
          recentIds={[...new Set(rangeSets.map((s) => s.exercise_id))]}
          title="Which exercise?"
          onPick={(exercise) => {
            setHistoryFor(exercise)
            setPickingHistory(false)
          }}
          onClose={() => setPickingHistory(false)}
        />
      )}

      {historyFor && <ExerciseHistory exercise={historyFor} onBack={() => setHistoryFor(null)} />}
    </div>
  )
}
