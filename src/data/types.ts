/**
 * Every record the app stores. One file on purpose: this is the contract between the database,
 * the engine and the screens, and it is far easier to keep honest in one place.
 *
 * Dates are local calendar dates as `YYYY-MM-DD` strings (see engine/dates.ts). Fields ending in
 * `_at` are epoch milliseconds and exist only to order rows or measure a duration — a calendar day
 * is never derived from one.
 */

export type DateStr = string

// ─── Habits ──────────────────────────────────────────────────────────────────────────────────
// A "habit" row is anything recurring that can be done on a day: a practice, a supplement, a meal.
// They share one table so that one engine scores them, one calendar draws them and one export
// carries them. What differs is `kind`, which only changes how a row is drawn and edited.

export type Polarity = 'do' | 'abstain'
export type HabitKind = 'habit' | 'supplement' | 'meal'

/** Which pillar a habit counts toward. Ids come from `Settings.areas`, so a new pillar is a
 *  settings change and not a schema change. */
export type AreaId = string

/** Which days a habit is expected on. 0 = Monday … 6 = Sunday throughout. */
export type DayRule =
  | { kind: 'daily' }
  | { kind: 'weekdays'; weekdays: number[] }
  /** Due on `anchor`, then every `n` days after it. */
  | { kind: 'every_n_days'; n: number; anchor: DateStr }
  /** Due on these days of the month; a day past the month's end falls on its last day. */
  | { kind: 'month_days'; days: number[] }
  /** No particular day. Never part of a day's score; judged only against `target`, if any. */
  | { kind: 'flexible' }

/** "N times per week / month". On a flexible habit this is the whole commitment; on a fixed-day
 *  habit it marks the habit as one of the week's key targets. */
export interface PeriodTarget {
  per: 'week' | 'month'
  count: number
}

/**
 * Where a completion can come from. A habit is complete on a day when ANY of its sources says so.
 * - `manual`   a tick stored in `entries`
 * - `workout`  a finished workout session that day
 * - `cardio`   a finished session that day which included cardio
 * - `learning` a learning session logged from the learning queue
 * - `reading`  a reading session logged against the active book
 * - `journal`  a journal entry written that day
 */
export type CompletionSource = 'manual' | 'workout' | 'cardio' | 'learning' | 'reading' | 'journal'

export type MeasureType = 'boolean' | 'count' | 'duration' | 'numeric' | 'quantity' | 'text' | 'session'

/** How a completion is recorded. `target` is what one completion means ("10" push-ups,
 *  "15" minutes); null means a plain tick. */
export interface Measure {
  type: MeasureType
  target: number | null
  unit: string
}

export interface Dose {
  amount: number | null
  unit: string
}

/**
 * One dated chapter of a habit's configuration. Editing a habit never rewrites a chapter that has
 * already been lived through: it adds a new one starting today. That is what keeps old scores,
 * old names and old schedules exactly as they were.
 */
export interface HabitVersion {
  /** First date this chapter applies to. Ascending and unique within a habit. */
  from: DateStr
  /** false = retired from `from` onward. */
  active: boolean
  name: string
  short_name: string
  area: AreaId
  /** Sub-heading inside the area ("Grooming", "Nutrition"). '' = none. */
  group: string
  day: DayRule
  target: PeriodTarget | null
  sources: CompletionSource[]
}

export interface Habit {
  id?: number
  kind: HabitKind
  polarity: Polarity
  /** First date the habit is tracked. Always equals `versions[0].from`. */
  created_on: DateStr
  sort_order: number
  description: string
  /** Key into ui/icons.ts; '' picks the area's default. */
  icon: string
  measure: Measure
  /** kind 'meal' only: the `meals.slot` that holds what was eaten. */
  meal_slot: string | null
  /** kind 'supplement' only. */
  dose: Dose | null
  versions: HabitVersion[]
  // Copied from the newest version by habitRepo on every write, so lists and old tooling can read
  // a habit without walking its versions. The engine never reads these three.
  name: string
  short_name: string
  retired_on: DateStr | null
}

/** One day's record for one habit. A missing row means "not done"; no row is needed for a miss. */
export interface Entry {
  id?: number
  habit_id: number
  date: DateStr
  done: boolean
  /** What was actually recorded for a measured habit (reps, minutes, litres, dose). */
  value?: number | null
  note?: string
  /** Local wall-clock time of the tick, 'HH:MM'. Display only. */
  time?: string | null
}

// ─── Day routines ────────────────────────────────────────────────────────────────────────────

export type RoutineSlot = 'morning' | 'pre_gym' | 'evening' | 'custom'

/** A step either points at a habit (and then shows that habit's state) or is a plain reminder
 *  line with nothing to tick ("Leave for work"). */
export interface RoutineStep {
  key: string
  habit_id: number | null
  label: string
  /** Intended time 'HH:MM', or '' for none. A guide, never an alarm. */
  time: string
  minutes: number | null
  note: string
}

export interface DayRoutine {
  id?: number
  name: string
  slot: RoutineSlot
  steps: RoutineStep[]
  sort_order: number
  retired_on: DateStr | null
}

// ─── Training ────────────────────────────────────────────────────────────────────────────────

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
  /** Muscles that assist. Each set counts for half on them. Absent on older rows. */
  secondary_muscles?: MuscleGroup[]
  equipment: Equipment
  kind: ExerciseKind
  /** Default step for the plus/minus buttons, in kg. */
  increment_kg: number
  /** Bar weight for plate maths; null means none. */
  bar_weight_kg: number | null
  /** Default rest seconds; null falls back to the app default. */
  rest_seconds: number | null
  is_builtin: boolean
  /** Retired, never deleted - same rule as habits. */
  retired_on: DateStr | null
  sort_order: number
  notes: string
}

/** A reusable workout ("Chest + Triceps"). Stored in the `routines` table. */
export interface WorkoutRoutine {
  id?: number
  name: string
  /** Superseded by `weekdays`; kept so rows written before it still load. */
  day_hint: number | null
  /** The weekly programme: days this routine is the suggested workout. A suggestion only - any
   *  routine can be started on any day. */
  weekdays?: number[]
  sort_order: number
  retired_on: DateStr | null
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

export type SessionKind = 'strength' | 'cardio'

export interface Session {
  id?: number
  date: DateStr
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
  /** What the finished session contained. Written when it is finished (and again if its sets are
   *  edited), so the day's Gym and Cardio state never needs the set table. */
  kinds?: SessionKind[]
  /** true = logged in one tap with no sets ("did 30 min cardio"). */
  quick?: boolean
  /** Minutes, for a quick log that has no start/end clock. */
  minutes?: number | null
  /** Kilometres covered, for a quick cardio log that records it. */
  distance_km?: number | null
}

export interface SetLog {
  id?: number
  session_id: number
  exercise_id: number
  /** Copied from session.date so per-exercise history is one index range query. */
  date: DateStr
  /** Order of the exercise block within the session. */
  position: number
  /** 1..n within that exercise block. */
  set_index: number
  weight_kg: number | null
  reps: number | null
  seconds: number | null
  distance_m: number | null
  /** Reps in reserve, 0-5. null = not recorded. */
  rir: number | null
  kind: 'work' | 'warmup'
  /** false = planned but not performed yet. Excluded from every statistic. */
  done: boolean
  done_at: number | null
  note: string
}

// ─── Nutrition ───────────────────────────────────────────────────────────────────────────────

/** What was eaten. Whether the meal happened is the meal habit's entry, not a field here. */
export interface Meal {
  date: DateStr
  /** 'breakfast' | 'lunch' | 'dinner', or any slot a meal habit names. */
  slot: string
  text: string
  ate_out: boolean
  /** Local 'HH:MM', or null. */
  time?: string | null
}

// ─── Body weight ─────────────────────────────────────────────────────────────────────────────

export interface WeightEntry {
  id?: number
  date: DateStr
  kg: number
  note: string
  created_at: number
}

// ─── Learning ────────────────────────────────────────────────────────────────────────────────

export interface LearningPillar {
  id?: number
  name: string
  description: string
  /** One of the pillar colour tokens: 'mind' | 'body' | 'learning' | 'exercise' | 'accent'. */
  color: string
  sort_order: number
  retired_on: DateStr | null
}

export type ResourceType =
  | 'book' | 'video' | 'article' | 'pdf' | 'course' | 'podcast' | 'note' | 'exercise' | 'project'

/**
 * Where a resource sits. "Next" is not stored: it is whichever queued resource is first in the
 * queue, so two things can never both claim to be next.
 */
export type ResourceStatus = 'inbox' | 'shortlist' | 'queued' | 'in_progress' | 'completed' | 'archived'

export type ProgressUnit = 'pages' | 'minutes' | 'lessons' | 'chapters' | 'percent' | 'none'

export interface LearningResource {
  id?: number
  title: string
  type: ResourceType
  pillar_id: number | null
  topic: string
  author: string
  /** "YouTube", a publisher, a site. */
  source: string
  url: string
  description: string
  estimated_minutes: number | null
  /** 1 = high, 2 = normal, 3 = low. */
  priority: 1 | 2 | 3
  status: ResourceStatus
  /** Order in the queue. Only meaningful while status is 'queued' or 'in_progress'. */
  queue_position: number | null
  progress_unit: ProgressUnit
  progress_current: number
  progress_total: number | null
  /** Free text for where you are: "Book IV", "Lesson 3". */
  position_note: string
  notes: string
  created_on: DateStr
  started_on: DateStr | null
  completed_on: DateStr | null
  archived_on: DateStr | null
}

/** Which daily commitment a session counts toward. Set by where it was logged from: the learning
 *  queue, or the active book. */
export type LearningLane = 'learning' | 'reading'

export interface LearningSession {
  id?: number
  resource_id: number
  date: DateStr
  lane: LearningLane
  minutes: number | null
  progress_before: number
  progress_after: number
  /** This session finished the resource. */
  completed_resource: boolean
  notes: string
  created_at: number
}

// ─── Journal ─────────────────────────────────────────────────────────────────────────────────

export type JournalKind = 'morning' | 'evening' | 'daily' | 'weekly' | 'general'

export interface JournalAnswer {
  prompt: string
  text: string
}

export interface JournalEntry {
  id?: number
  date: DateStr
  kind: JournalKind
  /** Prompted entries. The prompt text is stored with its answer, so changing the configured
   *  prompts later never changes what an old entry was answering. */
  answers: JournalAnswer[]
  /** Free writing. */
  text: string
  created_at: number
  updated_at: number
}

// ─── Quotes ──────────────────────────────────────────────────────────────────────────────────

export interface Quote {
  id?: number
  text: string
  author: string
  category: string
  favorite: boolean
  /** false = retired from the collection, kept for history. */
  active: boolean
  /** Stays in the library but is never picked for a day again. */
  never_show: boolean
  times_shown: number
  last_shown: DateStr | null
  note: string
  created_on: DateStr
  /** Set on built-in quotes only, so re-running the seed can never add one twice. */
  seed_key?: string
}

/** Which quote a day was given. Stored so a day keeps its quote, and so "shown" is a fact. */
export interface QuoteDay {
  date: DateStr
  quote_id: number
  /** true = picked by hand rather than by rotation. */
  manual: boolean
}

// ─── Weekly review ───────────────────────────────────────────────────────────────────────────

export interface AreaScore {
  area: AreaId
  label: string
  done: number
  due: number
}

export interface TargetResult {
  habit_id: number
  name: string
  area: AreaId
  per: 'week' | 'month'
  target: number
  done: number
  /** 'partial' = tracked for only part of the period, so it is reported but not judged.
   *  'open' = the period is still running; never present in a frozen week. */
  outcome: 'met' | 'missed' | 'partial' | 'open'
}

export interface HabitWeekResult {
  habit_id: number
  name: string
  area: AreaId
  done: number
  due: number
}

/** The numbers a week ended on. Written once, when the week locks, and never recomputed. */
export interface WeekStats {
  /** Version of the scoring rules that produced these numbers. */
  engine: number
  week_start: DateStr
  week_end: DateStr
  /** Units done / units expected across the whole week. */
  done: number
  due: number
  areas: AreaScore[]
  targets: TargetResult[]
  habits: HabitWeekResult[]
  /** Per day: done / due, for the week strip. */
  days: { date: DateStr; done: number; due: number }[]
  weight: { kg: number | null; previous_kg: number | null }
  training: { sessions: number; sets: number; volume_kg: number; minutes: number; best: string }
  learning: {
    sessions: number
    minutes: number
    completed: number
    by_pillar: { name: string; sessions: number }[]
  }
  /** Plain-language statements, each backed by the numbers above. */
  observations: string[]
}

export interface WeeklyReview {
  week_start: DateStr
  week_end: DateStr
  reflection_good: string
  reflection_bad: string
  reflection_learned: string
  reflection_change: string
  next_week_notes: string
  /** Weekly notes written before the review system existed, carried over as they were. */
  legacy_notes: string
  /** null while the week can still change. */
  frozen: WeekStats | null
  frozen_on: DateStr | null
  updated_at: number
}

// ─── Settings and bookkeeping ────────────────────────────────────────────────────────────────

export interface AreaConfig {
  id: AreaId
  label: string
  /** Colour token name: 'mind' | 'body' | 'learning' | 'exercise'. */
  color: string
  sort_order: number
}

export type ThemePreference = 'system' | 'light' | 'dark'

export interface JournalPrompts {
  morning: string[]
  evening: string[]
  daily: string[]
  weekly: string[]
}

export interface Settings {
  name: string
  /** One line the user writes about what they are working toward. Shown on the profile. */
  focus: string
  theme: ThemePreference
  /** 0 = Monday … 6 = Sunday. */
  week_start: number
  /** Local hour (0-6) at which a new day begins. 0 = midnight. */
  day_start_hour: number
  weight_unit: 'kg' | 'lb'
  default_increment_kg: number
  default_rest_seconds: number
  /** Weekday the weekly review is put forward on. */
  review_day: number
  /** How many days of history can still be corrected, counting today. */
  edit_window_days: number
  /** Hour from which today's unfinished items are worth pointing out. */
  evening_hour: number
  quote_mode: 'rotate' | 'favorites' | 'manual'
  /** Flag a learning resource that has been in progress this many days. 0 = never. */
  learning_stale_days: number
  areas: AreaConfig[]
  journal_prompts: JournalPrompts
  /** The one book currently being read. */
  active_book_id: number | null
  /** The day this install moved onto the versioned habit model. History before it is replayed
   *  exactly as the old app scored it. null on a fresh install. */
  cutover_date: DateStr | null
  /** Bumped when stored data stops being readable by older builds. */
  data_format: number
}

export interface SettingRow {
  key: string
  value: unknown
}

export interface MigrationRow {
  id: string
  ran_on: DateStr
  ran_at: number
  /** Whatever the step wants to leave behind for later diagnosis. */
  notes?: unknown
}

// ─── Legacy rows ─────────────────────────────────────────────────────────────────────────────
// Shapes that only the migration and the importer still read.

export interface WeeklyRecord {
  id?: number
  week_monday: DateStr
  weight_kg: number | null
  notes: string
}

export interface DailyNote {
  date: DateStr
  text: string
}

export interface LegacySupplement {
  id?: number
  category?: string
  name: string
  dose_text: string
  schedule: 'daily' | 'weekly' | 'as_needed'
  weekly_day: number | null
  time_hint: string
  servings_left: number | null
  low_stock_at: number | null
  created_on: DateStr
  retired_on: DateStr | null
  sort_order: number
}

export interface LegacySupplementLog {
  supplement_id: number
  date: DateStr
  taken: boolean
}

/** A habit row as the pre-versioning app wrote it. */
export interface LegacyHabit {
  id?: number
  name: string
  short_name: string
  polarity: Polarity
  created_on: DateStr
  retired_on: DateStr | null
  sort_order: number
  category?: string
  group?: string
  schedule?: 'daily' | 'weekdays' | 'times_per_week'
  weekdays?: number[]
  times_per_week?: number | null
}
