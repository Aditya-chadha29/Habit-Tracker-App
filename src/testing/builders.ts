import type {
  CompletionSource, DateStr, DayRule, Entry, Habit, HabitVersion, PeriodTarget,
} from '../data/types'
import { buildCompletionIndex, type CompletionIndex } from '../engine/completion'

/** Small builders so a test reads as the scenario it describes rather than as row plumbing. */

let nextId = 1

export function resetIds(): void {
  nextId = 1
}

export interface HabitSpec {
  id?: number
  name?: string
  from?: DateStr
  area?: string
  group?: string
  day?: DayRule
  target?: PeriodTarget | null
  sources?: CompletionSource[]
  polarity?: Habit['polarity']
  kind?: Habit['kind']
}

export function version(from: DateStr, spec: HabitSpec = {}, overrides: Partial<HabitVersion> = {}): HabitVersion {
  const name = spec.name ?? 'Habit'
  return {
    from,
    active: true,
    name,
    short_name: name,
    area: spec.area ?? 'mind',
    group: spec.group ?? '',
    day: spec.day ?? { kind: 'daily' },
    target: spec.target ?? null,
    sources: spec.sources ?? ['manual'],
    ...overrides,
  }
}

export function habit(spec: HabitSpec = {}, laterVersions: HabitVersion[] = []): Habit {
  const from = spec.from ?? '2026-01-05'
  const versions = [version(from, spec), ...laterVersions]
  const last = versions[versions.length - 1]
  return {
    id: spec.id ?? nextId++,
    kind: spec.kind ?? 'habit',
    polarity: spec.polarity ?? 'do',
    created_on: from,
    sort_order: 0,
    description: '',
    icon: '',
    measure: { type: 'boolean', target: null, unit: '' },
    meal_slot: null,
    dose: null,
    versions,
    name: last.name,
    short_name: last.short_name,
    retired_on: last.active ? null : last.from,
  }
}

export function ticks(habitId: number, dates: DateStr[]): Entry[] {
  return dates.map((date) => ({ habit_id: habitId, date, done: true }))
}

export function indexOf(input: {
  entries?: Entry[]
  workouts?: DateStr[]
  cardio?: DateStr[]
  learning?: DateStr[]
  reading?: DateStr[]
  journal?: DateStr[]
}): CompletionIndex {
  const cardio = new Set(input.cardio ?? [])
  const workoutDates = new Set([...(input.workouts ?? []), ...cardio])
  return buildCompletionIndex({
    entries: input.entries ?? [],
    sessions: [...workoutDates].map((date) => ({
      date,
      ended_at: 1,
      kinds: cardio.has(date) ? ['cardio' as const] : ['strength' as const],
    })),
    learningSessions: [
      ...(input.learning ?? []).map((date) => ({ date, lane: 'learning' as const })),
      ...(input.reading ?? []).map((date) => ({ date, lane: 'reading' as const })),
    ],
    journalDates: input.journal ?? [],
  })
}
