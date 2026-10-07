import type { Table } from 'dexie'
import { BACKUP_DB_NAME, readEverything, takeSnapshot } from './backup'
import { createDb, type AppDb } from './db'
import { runMigrations } from './migrations'
import { DATA_FORMAT } from './settingsRepo'
import type { DateStr, Habit } from './types'
import { isValidDateStr } from '../engine/dates'
import { habitProblems } from '../engine/timeline'

/**
 * Export and import.
 *
 * Everything lives on one device, so the export file is the owner's only protection. It carries
 * every table. Import never trusts a file: it is parsed, checked and reported on first, and only
 * then applied — either adding what is missing (nothing existing is ever overwritten) or
 * replacing everything, which first puts a full copy of the current data in the backup store.
 *
 * Files from the earlier Habit Tracker (schema 1 and 2, habits without chapters) are brought up
 * to date by running them through the very same migration a phone goes through, in a throwaway
 * database, so an old backup arrives exactly as an upgraded install would have it.
 */
export const EXPORT_APP = 'personal-os'
/** 1 and 2 were the Habit Tracker's formats; 3 is the first Personal OS format. */
export const EXPORT_FORMAT = 3

export interface ImportProblem {
  /** An error blocks the import; a warning is reported and the affected rows are left out. */
  level: 'error' | 'warning'
  table: string
  message: string
}

export interface PreparedImport {
  ok: boolean
  /** The file was from the earlier app and has been upgraded. */
  upgraded: boolean
  exported_at: string
  tables: Record<string, unknown[]>
  counts: Record<string, number>
  problems: ImportProblem[]
}

export interface ImportSummary {
  mode: 'merge' | 'replace'
  added: Record<string, number>
  skipped: Record<string, number>
  snapshot: string | null
}

type Row = Record<string, unknown>

/** Which field of each table must be a real date. */
const DATE_FIELDS: Record<string, string> = {
  entries: 'date',
  sessions: 'date',
  set_logs: 'date',
  meals: 'date',
  weight_entries: 'date',
  learning_sessions: 'date',
  journal_entries: 'date',
  quote_days: 'date',
  weekly_reviews: 'week_start',
  weekly_records: 'week_monday',
  daily_notes: 'date',
}

/** Rows that point at a row in another table: [table, field, target table, what it is]. */
const REFERENCES: [string, string, string, string][] = [
  ['entries', 'habit_id', 'habits', 'a habit'],
  ['set_logs', 'session_id', 'sessions', 'a workout session'],
  ['set_logs', 'exercise_id', 'exercises', 'an exercise'],
  ['routine_items', 'routine_id', 'routines', 'a routine'],
  ['routine_items', 'exercise_id', 'exercises', 'an exercise'],
  ['learning_sessions', 'resource_id', 'learning_resources', 'a learning resource'],
  ['quote_days', 'quote_id', 'quotes', 'a quote'],
]

export async function buildExport(database: AppDb, exportedAt: string): Promise<Record<string, unknown>> {
  const tables = await readEverything(database)
  return {
    app: EXPORT_APP,
    export_format: EXPORT_FORMAT,
    schema_version: EXPORT_FORMAT,
    data_format: DATA_FORMAT,
    db_version: database.verno,
    exported_at: exportedAt,
    ...tables,
  }
}

const keyOf = (table: Table, row: Row): string => {
  const path = table.schema.primKey.keyPath
  return JSON.stringify(Array.isArray(path) ? path.map((part) => row[part]) : row[path as string])
}

function blocked(message: string, table = 'file'): PreparedImport {
  return { ok: false, upgraded: false, exported_at: '', tables: {}, counts: {}, problems: [{ level: 'error', table, message }] }
}

let staging = 0

/** Runs an old-format file through the real migrations in a throwaway database. */
async function upgradeLegacy(tables: Record<string, unknown[]>, today: DateStr, now: number): Promise<Record<string, unknown[]>> {
  staging += 1
  const name = `import-staging-${now}-${staging}`
  const temporary = createDb(name)
  try {
    await temporary.open()
    for (const table of temporary.tables) {
      const rows = tables[table.name]
      if (rows?.length) await table.bulkAdd(rows)
    }
    await runMigrations({ db: temporary, today, now, theme: 'system' }, { backupName: `${name}-backups` })
    return await readEverything(temporary)
  } finally {
    await temporary.delete().catch(() => undefined)
    const backups = createDb(`${name}-backups`)
    await backups.delete().catch(() => undefined)
  }
}

/**
 * Reads a file and reports on it without touching the device's data. `schema` is the database
 * whose table list defines what an export can contain.
 */
export async function prepareImport(text: string, schema: AppDb, today: DateStr, now: number): Promise<PreparedImport> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return blocked('This is not a JSON file, or it is damaged.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return blocked('This file is not an export of this app.')
  const file = parsed as Row
  if (!Array.isArray(file.habits)) return blocked('This file is not an export of this app: it has no list of habits.')
  if (typeof file.data_format === 'number' && file.data_format > DATA_FORMAT) {
    return blocked('This export was made by a newer version of the app. Update the app, then import it.')
  }

  const problems: ImportProblem[] = []
  const known = new Map(schema.tables.map((table) => [table.name, table]))
  let tables: Record<string, unknown[]> = {}
  for (const [key, value] of Object.entries(file)) {
    if (!Array.isArray(value)) continue
    if (!known.has(key)) {
      problems.push({ level: 'warning', table: key, message: `Unknown table “${key}” (${value.length} rows) was ignored.` })
      continue
    }
    if (value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      return blocked(`The table “${key}” contains something that is not a record.`, key)
    }
    tables[key] = value
  }

  const legacy = (tables.habits as Row[]).some((habit) => !Array.isArray(habit.versions))
  if (legacy) {
    try {
      tables = await upgradeLegacy(tables, today, now)
    } catch (error) {
      return blocked(`This older export could not be brought up to date: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Duplicate ids and invalid habits make a file unusable: other rows point at them.
  for (const [name, rows] of Object.entries(tables)) {
    const table = known.get(name)!
    const seen = new Set<string>()
    for (const row of rows as Row[]) {
      const key = keyOf(table, row)
      if (key === undefined || key === 'null') continue
      if (seen.has(key)) problems.push({ level: 'error', table: name, message: `Two records share the id ${key}.` })
      seen.add(key)
    }
  }
  for (const habit of tables.habits as unknown as Habit[]) {
    const reasons = habitProblems(habit)
    if (reasons.length) problems.push({ level: 'error', table: 'habits', message: `“${habit.name ?? 'Unnamed habit'}” is not valid: ${reasons.join('; ')}.` })
  }

  // Invalid dates and dangling references: the affected rows are left out, and said so.
  const drop = (name: string, keep: (row: Row) => boolean, describe: (count: number) => string) => {
    const rows = (tables[name] ?? []) as Row[]
    const kept = rows.filter(keep)
    if (kept.length !== rows.length) {
      problems.push({ level: 'warning', table: name, message: describe(rows.length - kept.length) })
      tables[name] = kept
    }
  }
  for (const [name, field] of Object.entries(DATE_FIELDS)) {
    drop(name, (row) => isValidDateStr(row[field]), (count) => `${count} ${count === 1 ? 'record has' : 'records have'} an invalid date and will be left out.`)
  }
  for (const [name, field, target, what] of REFERENCES) {
    const ids = new Set(((tables[target] ?? []) as Row[]).map((row) => row.id))
    drop(name, (row) => ids.has(row[field]), (count) => `${count} ${count === 1 ? 'record points' : 'records point'} at ${what} that is not in the file and will be left out.`)
  }
  const habitIds = new Set((tables.habits as Row[]).map((row) => row.id))
  tables.day_routines = ((tables.day_routines ?? []) as Row[]).map((routine) => {
    const steps = Array.isArray(routine.steps) ? (routine.steps as Row[]) : []
    const kept = steps.filter((step) => step.habit_id === null || habitIds.has(step.habit_id))
    if (kept.length !== steps.length) {
      problems.push({ level: 'warning', table: 'day_routines', message: `“${String(routine.name)}” had ${steps.length - kept.length} step(s) pointing at a habit that is not in the file; they were removed.` })
    }
    return { ...routine, steps: kept }
  })

  const counts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]))
  return {
    ok: !problems.some((problem) => problem.level === 'error'),
    upgraded: legacy,
    exported_at: typeof file.exported_at === 'string' ? file.exported_at : '',
    tables,
    counts,
    problems,
  }
}

/**
 * Applies a prepared import.
 *
 * `merge` adds only what is not already there: a record whose id (or, for a tick, whose habit and
 * day) already exists is skipped, so importing the same file twice changes nothing the second
 * time. `replace` first copies the whole current database into the backup store, then swaps in
 * the file's contents.
 */
export async function applyImport(
  database: AppDb,
  prepared: PreparedImport,
  mode: 'merge' | 'replace',
  today: DateStr,
  now: number,
  backupName: string = BACKUP_DB_NAME,
): Promise<ImportSummary> {
  if (!prepared.ok) throw new Error('This file has problems that must be fixed before it can be imported.')
  const added: Record<string, number> = {}
  const skipped: Record<string, number> = {}
  let snapshot: string | null = null

  if (mode === 'replace') {
    snapshot = await takeSnapshot(database, 'before-import', today, now, backupName)
    await database.transaction('rw', database.tables, async () => {
      for (const table of database.tables) {
        await table.clear()
        const rows = prepared.tables[table.name] ?? []
        if (rows.length) await table.bulkAdd(rows)
        added[table.name] = rows.length
      }
    })
    return { mode, added, skipped, snapshot }
  }

  await database.transaction('rw', database.tables, async () => {
    for (const table of database.tables) {
      const rows = (prepared.tables[table.name] ?? []) as Row[]
      if (!rows.length) continue
      const existing = new Set((await table.toArray()).map((row: Row) => keyOf(table, row)))
      // Ticks and a few other tables are unique on something other than their id.
      const natural =
        table.name === 'entries'
          ? (row: Row) => `${row.habit_id}|${row.date}`
          : table.name === 'quotes'
            ? (row: Row) => (row.seed_key ? `seed|${row.seed_key}` : '')
            : table.name === 'weekly_records'
              ? (row: Row) => `week|${row.week_monday}`
              : null
      const taken = natural ? new Set((await table.toArray()).map(natural).filter(Boolean)) : null
      const fresh: Row[] = []
      for (const row of rows) {
        const naturalKey = natural ? natural(row) : ''
        if (existing.has(keyOf(table, row)) || (taken && naturalKey && taken.has(naturalKey))) {
          skipped[table.name] = (skipped[table.name] ?? 0) + 1
          continue
        }
        if (taken && naturalKey) taken.add(naturalKey)
        existing.add(keyOf(table, row))
        fresh.push(row)
      }
      if (fresh.length) await table.bulkAdd(fresh)
      added[table.name] = fresh.length
    }
  })
  return { mode, added, skipped, snapshot }
}
