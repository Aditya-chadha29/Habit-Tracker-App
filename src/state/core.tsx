import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { db } from '../data/db'
import type { WriteContext } from '../data/habitRepo'
import { settingsFromRows } from '../data/settingsRepo'
import type { AreaConfig, DateStr, Habit, Settings } from '../data/types'
import { buildCompletionIndex, type CompletionIndex } from '../engine/completion'
import { useClock } from './clock'
import { useAppliedTheme } from './theme'

/**
 * The live core of the app: the habits, what has been completed, the settings and what day it is.
 *
 * It is subscribed once, here, and every screen reads it from context. That is what makes the app
 * one system instead of a set of pages: a tick on Today, a finished workout or a logged learning
 * session changes the underlying rows, this recomputes, and every number on every screen that
 * depends on it is already up to date.
 */
export interface Core {
  today: DateStr
  /** Local hour, 0–23. */
  hour: number
  settings: Settings
  /** Shorthand for settings.week_start. */
  weekStart: number
  /** Pillars in display order. */
  areas: AreaConfig[]
  /** Every habit, retired ones included, in list order. */
  habits: Habit[]
  /** What was completed, from every source. */
  index: CompletionIndex
  /** Pass to any repository write that carries a date, so the history lock can be enforced. */
  write: WriteContext
  /** Which theme is actually on screen, for charts that need literal colours. */
  theme: 'dark' | 'light'
}

const CoreContext = createContext<Core | null>(null)

export function CoreProvider({ children, splash = null }: { children: ReactNode; splash?: ReactNode }) {
  const settingRows = useLiveQuery(() => db.settings.toArray(), [])
  // A row without chapters can only have been written by an earlier build of the app running
  // against this database. It is left out, not shown wrongly and not deleted.
  const habits = useLiveQuery(async () => (await db.habits.orderBy('sort_order').toArray()).filter((habit) => Array.isArray(habit.versions) && habit.versions.length > 0), [])
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  // Only the three fields completion needs; a session's notes or timers changing does not
  // matter here, but Dexie re-runs on any write to the table either way.
  const sessions = useLiveQuery(
    async () => (await db.sessions.toArray()).map(({ date, ended_at, kinds }) => ({ date, ended_at, kinds })),
    [],
  )
  const learningSessions = useLiveQuery(
    async () => (await db.learning_sessions.toArray()).map(({ date, lane }) => ({ date, lane })),
    [],
  )
  // Keys only: which days have a journal entry, without loading what was written.
  // No cursor here (which uniqueKeys would use): Safari on the iPhone can fail to open one
  // ("Unable to open cursor"), and this runs at every start.
  const journalDates = useLiveQuery(async () => [...new Set((await db.journal_entries.toArray()).map((entry) => entry.date))] as DateStr[], [])

  const settings = useMemo(() => settingsFromRows(settingRows ?? []), [settingRows])
  const clock = useClock(settings.day_start_hour)
  const theme = useAppliedTheme()

  const index = useMemo(
    () =>
      buildCompletionIndex({
        entries: entries ?? [],
        sessions: sessions ?? [],
        learningSessions: learningSessions ?? [],
        journalDates: journalDates ?? [],
      }),
    [entries, sessions, learningSessions, journalDates],
  )

  const loaded =
    settingRows !== undefined &&
    habits !== undefined &&
    entries !== undefined &&
    sessions !== undefined &&
    learningSessions !== undefined &&
    journalDates !== undefined

  const value = useMemo<Core | null>(() => {
    if (!loaded) return null
    return {
      today: clock.today,
      hour: clock.hour,
      settings,
      weekStart: settings.week_start,
      areas: [...settings.areas].sort((a, b) => a.sort_order - b.sort_order),
      habits: habits ?? [],
      index,
      write: { today: clock.today, windowDays: settings.edit_window_days },
      theme,
    }
  }, [loaded, clock.today, clock.hour, settings, habits, index, theme])

  if (!value) return <>{splash}</>
  return <CoreContext.Provider value={value}>{children}</CoreContext.Provider>
}

export function useCore(): Core {
  const core = useContext(CoreContext)
  if (!core) throw new Error('useCore must be used inside CoreProvider')
  return core
}
