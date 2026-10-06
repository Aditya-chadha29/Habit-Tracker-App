export type Polarity = 'do' | 'abstain'

export interface Habit {
  id?: number
  name: string
  short_name: string
  polarity: Polarity
  created_on: string
  retired_on: string | null
  sort_order: number
}

export interface Entry {
  id?: number
  habit_id: number
  date: string
  done: boolean
}

export interface WeeklyRecord {
  id?: number
  week_monday: string
  weight_kg: number | null
  notes: string
}

export interface DailyNote {
  date: string
  text: string
}

// ─── Gym ─────────────────────────────────────────────────────────────────────────────────────

export type MuscleGroup =
  | 'chest' | 'back' | 'traps' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core' | 'cardio'

export type Equipment =
  | 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'smith'
  | 'bodyweight' | 'kettlebell' | 'band' | 'other'

/** Decides which inputs a set row renders. */
export type ExerciseKind =
  | 'weight_reps'
  | 'bodyweight_reps'
  | 'weighted_bodyweight'
  | 'time'
  | 'distance_time'

export interface Exercise {
  id?: number
  name: string
  primary_muscle: MuscleGroup
  equipment: Equipment
  kind: ExerciseKind
  /** Default step for the plus/minus buttons, in kg. */
  increment_kg: number
  /** Bar weight for plate maths; null means no plate maths for this exercise. */
  bar_weight_kg: number | null
  /** Default rest seconds; null falls back to the compound/isolation default. */
  rest_seconds: number | null
  is_builtin: boolean
  /** Retired, never deleted - same rule as habits. */
  retired_on: string | null
  sort_order: number
  notes: string
}

export interface Routine {
  id?: number
  name: string
  /** 1 = Monday ... 7 = Sunday, or null. A suggestion on that weekday, never enforced. */
  day_hint: number | null
  sort_order: number
  retired_on: string | null
}

export interface RoutineItem {
  id?: number
  routine_id: number
  exercise_id: number
  position: number
  target_sets: number
  target_reps_low: number | null
  target_reps_high: number | null
  note: string
}

export interface Session {
  id?: number
  /** Local calendar date, YYYY-MM-DD - via dates.ts, never from toISOString(). */
  date: string
  /** Where the session came from. Sets are copies, so editing a routine never rewrites history. */
  routine_id: number | null
  /** Routine name snapshotted at start, or 'Free session'. */
  title: string
  started_at: number | null
  /** null means the session is still open. */
  ended_at: number | null
  notes: string
  /** Rest-timer anchor, so a reload or a backgrounded phone can recover the countdown. */
  rest_started_at: number | null
  rest_seconds: number | null
}

export interface SetLog {
  id?: number
  session_id: number
  exercise_id: number
  /** Copied from session.date so per-exercise history is one index range query. Sessions never
   *  change date, so this cannot drift out of step. */
  date: string
  /** Order of the exercise block within the session. */
  position: number
  /** 1..n within that exercise block. */
  set_index: number
  weight_kg: number | null
  reps: number | null
  seconds: number | null
  distance_m: number | null
  /** Reps in reserve, 0-5. null = not recorded. Only ever asked for on the top set. */
  rir: number | null
  kind: 'work' | 'warmup'
  /** false = planned but not performed yet. Excluded from every statistic. */
  done: boolean
  done_at: number | null
  note: string
}

// ─── Food and supplements ────────────────────────────────────────────────────────────────────

export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner'

/** Free text, deliberately: a meal log, not a calorie counter. */
export interface Meal {
  date: string
  slot: MealSlot
  text: string
  ate_out: boolean
}

export type SupplementSchedule = 'daily' | 'weekly' | 'as_needed'
export type TimeHint = 'morning' | 'preworkout' | 'postworkout' | 'evening' | 'anytime'

export interface Supplement {
  id?: number
  name: string
  /** Free text so any unit works: "5 g", "1 scoop", "60,000 IU". */
  dose_text: string
  schedule: SupplementSchedule
  /** 0 = Monday ... 6 = Sunday. Only meaningful when schedule is 'weekly'. */
  weekly_day: number | null
  time_hint: TimeHint
  /** null = not tracking stock. */
  servings_left: number | null
  /** Warn at or below this; null = no warning. */
  low_stock_at: number | null
  created_on: string
  retired_on: string | null
  sort_order: number
}

export interface SupplementLog {
  supplement_id: number
  date: string
  /** An explicit false row means deliberately skipped, which is not the same as untouched. */
  taken: boolean
}
