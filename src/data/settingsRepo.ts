import { db, type AppDb } from './db'
import type { AreaConfig, JournalPrompts, SettingRow, Settings } from './types'

/** Bumped when stored data stops being readable by an older build of the app. */
export const DATA_FORMAT = 1

export const DEFAULT_AREAS: AreaConfig[] = [
  { id: 'mind', label: 'Mind', color: 'mind', sort_order: 0 },
  { id: 'body', label: 'Body', color: 'body', sort_order: 1 },
  { id: 'learning', label: 'Learning', color: 'learning', sort_order: 2 },
  { id: 'exercise', label: 'Exercise', color: 'exercise', sort_order: 3 },
]

export const DEFAULT_PROMPTS: JournalPrompts = {
  morning: ['What matters today?', 'What am I going to focus on?', 'What must not be neglected?'],
  evening: ['What went well?', 'What didn’t?', 'What did I learn?', 'What should I improve tomorrow?'],
  // The one journal page a day is written in the evening: it looks back and prepares tomorrow.
  daily: ['What went well?', 'What didn’t?', 'What did I learn?', 'What should I improve tomorrow?'],
  weekly: ['What went well?', 'What went badly?', 'What did I learn?', 'What will I change next week?'],
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  focus: '',
  theme: 'system',
  // Sunday. The user moved the week from Monday to Sunday on 2026-10-07.
  week_start: 6,
  day_start_hour: 0,
  weight_unit: 'kg',
  default_increment_kg: 2.5,
  default_rest_seconds: 120,
  review_day: 6,
  edit_window_days: 7,
  evening_hour: 19,
  quote_mode: 'rotate',
  learning_stale_days: 14,
  areas: DEFAULT_AREAS,
  journal_prompts: DEFAULT_PROMPTS,
  active_book_id: null,
  cutover_date: null,
  data_format: DATA_FORMAT,
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}

function stringList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : fallback
}

/**
 * Settings as the app uses them: every key present, every value within range. A row that is
 * missing, or that holds something nonsensical (a hand-edited import, a newer build's value),
 * falls back to the default for that key rather than breaking the screen that reads it.
 */
export function settingsFromRows(rows: readonly SettingRow[]): Settings {
  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const get = (key: keyof Settings): unknown => stored.get(key)
  const d = DEFAULT_SETTINGS

  const rawAreas = get('areas')
  const areas =
    Array.isArray(rawAreas) && rawAreas.length && rawAreas.every((a) => a && typeof a.id === 'string' && typeof a.label === 'string')
      ? (rawAreas as AreaConfig[])
      : d.areas

  const rawPrompts = get('journal_prompts') as Partial<JournalPrompts> | undefined
  const prompts: JournalPrompts = {
    morning: stringList(rawPrompts?.morning, d.journal_prompts.morning),
    evening: stringList(rawPrompts?.evening, d.journal_prompts.evening),
    daily: stringList(rawPrompts?.daily, d.journal_prompts.daily),
    weekly: stringList(rawPrompts?.weekly, d.journal_prompts.weekly),
  }

  const cutover = get('cutover_date')
  const book = get('active_book_id')
  const increment = get('default_increment_kg')

  return {
    name: typeof get('name') === 'string' ? (get('name') as string) : d.name,
    focus: typeof get('focus') === 'string' ? (get('focus') as string) : d.focus,
    theme: oneOf(get('theme'), ['system', 'light', 'dark'] as const, d.theme),
    week_start: clampInt(get('week_start'), 0, 6, d.week_start),
    day_start_hour: clampInt(get('day_start_hour'), 0, 6, d.day_start_hour),
    weight_unit: oneOf(get('weight_unit'), ['kg', 'lb'] as const, d.weight_unit),
    default_increment_kg: typeof increment === 'number' && increment > 0 && increment <= 50 ? increment : d.default_increment_kg,
    default_rest_seconds: clampInt(get('default_rest_seconds'), 15, 900, d.default_rest_seconds),
    review_day: clampInt(get('review_day'), 0, 6, d.review_day),
    edit_window_days: clampInt(get('edit_window_days'), 1, 60, d.edit_window_days),
    evening_hour: clampInt(get('evening_hour'), 12, 23, d.evening_hour),
    quote_mode: oneOf(get('quote_mode'), ['rotate', 'favorites', 'manual'] as const, d.quote_mode),
    learning_stale_days: clampInt(get('learning_stale_days'), 0, 365, d.learning_stale_days),
    areas,
    journal_prompts: prompts,
    active_book_id: typeof book === 'number' ? book : null,
    cutover_date: typeof cutover === 'string' ? cutover : null,
    data_format: clampInt(get('data_format'), 1, 1_000_000, DATA_FORMAT),
  }
}

export async function readSettings(database: AppDb = db): Promise<Settings> {
  return settingsFromRows(await database.settings.toArray())
}

/** Writes only the keys given. Each key is its own row, so two screens changing different
 *  settings can never overwrite each other. */
export async function saveSettings(patch: Partial<Settings>, database: AppDb = db): Promise<void> {
  const rows: SettingRow[] = Object.entries(patch).map(([key, value]) => ({ key, value }))
  if (rows.length) await database.settings.bulkPut(rows)
}
