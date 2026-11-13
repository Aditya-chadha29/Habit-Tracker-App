import type { Table } from 'dexie'
import { BACKUP_DB_NAME, pruneSnapshots, readEverything, removeSnapshot, takeSnapshot } from './backup'
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
  /**
   * Why this file cannot be ADDED to what is on the device (it can still replace it): records
   * about to be added point at something that is a different thing here. Empty when it can.
   */
  merge_blockers: string[]
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
  day_marks: 'date',
  day_plans: 'date',
  measurements: 'date',
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
  return { ok: false, upgraded: false, exported_at: '', tables: {}, counts: {}, problems: [{ level: 'error', table, message }], merge_blockers: [] }
}

// ─── Adding a file to what is already here ───────────────────────────────────────────────────

/** Ticks and a few other tables are unique on something other than their id. */
function naturalKeyOf(table: string): ((row: Row) => string) | null {
  if (table === 'entries') return (row) => `${row.habit_id}|${row.date}`
  if (table === 'quotes') return (row) => (row.seed_key ? `seed|${row.seed_key}` : '')
  if (table === 'weekly_records') return (row) => `week|${row.week_monday}`
  return null
}

interface MergePlan {
  /** Per table, the rows that are not on the device yet. */
  fresh: Record<string, Row[]>
  skipped: Record<string, number>
  /** Rows whose id is taken here by a different record. */
  clashes: string[]
}

/** What adding a file would write. Reads only; call it inside a transaction. */
async function planMerge(database: AppDb, tables: Record<string, unknown[]>): Promise<MergePlan> {
  const fresh: Record<string, Row[]> = {}
  const skipped: Record<string, number> = {}
  const clashes: string[] = []
  for (const table of database.tables) {
    const rows = (tables[table.name] ?? []) as Row[]
    if (!rows.length) continue
    const present = (await table.toArray()) as Row[]
    const existing = new Set(present.map((row) => keyOf(table, row)))
    const identity = ROW_IDENTITY[table.name]
    if (identity) {
      const here = new Map(present.map((row) => [keyOf(table, row), identity.of(row)]))
      for (const row of rows) {
        const mine = here.get(keyOf(table, row))
        if (mine !== undefined && mine !== identity.of(row)) clashes.push(`${identity.what} ${String(row.id)} is a different record in the file and on this device.`)
      }
    }
    const natural = naturalKeyOf(table.name)
    const taken = natural ? new Set(present.map(natural).filter(Boolean)) : null
    const add: Row[] = []
    for (const row of rows) {
      const naturalKey = natural ? natural(row) : ''
      if (existing.has(keyOf(table, row)) || (taken && naturalKey && taken.has(naturalKey))) {
        skipped[table.name] = (skipped[table.name] ?? 0) + 1
        continue
      }
      if (taken && naturalKey) taken.add(naturalKey)
      existing.add(keyOf(table, row))
      add.push(row)
    }
    fresh[table.name] = add
  }
  return { fresh, skipped, clashes }
}

const lower = (value: unknown): string => String(value ?? '').trim().toLowerCase()
const firstName = (habit: Row): unknown => (Array.isArray(habit.versions) && habit.versions.length ? (habit.versions[0] as Row).name : habit.name)

/**
 * Tables whose rows nothing points at and that have no natural key. Two rows with the same id are
 * the same record only if these fields agree; otherwise the file's row is a different record that
 * merely reuses the number, and must not be passed over as "already here".
 */
const ROW_IDENTITY: Record<string, { what: string; of: (row: Row) => string }> = {
  entries: { what: 'Tick', of: (row) => `${row.habit_id}|${row.date}` },
  journal_entries: { what: 'Journal entry', of: (row) => `${row.date}|${row.kind}|${row.created_at}` },
  weight_entries: { what: 'Weight entry', of: (row) => `${row.date}|${row.created_at}` },
  learning_sessions: { what: 'Learning session', of: (row) => `${row.resource_id}|${row.date}|${row.created_at}` },
  sessions: { what: 'Workout', of: (row) => `${row.date}|${row.started_at}` },
  set_logs: { what: 'Set', of: (row) => `${row.session_id}|${row.exercise_id}|${row.position}|${row.set_index}` },
}

/**
 * For each table other records point at: whether two rows with the same id are the same thing.
 * A date of creation never changes and a name can, so either matching is enough for a habit or a
 * resource; things without a creation date are known by their name.
 */
const SAME_THING: Record<string, { what: string; same: (a: Row, b: Row) => boolean; name: (row: Row) => string }> = {
  habits: {
    what: 'Habit',
    // The first chapter's name never changes, so with the day of creation it survives a rename;
    // the day alone is not enough, because a whole starting set is created on one day.
    same: (a, b) => lower(a.name) === lower(b.name) || (a.created_on === b.created_on && lower(firstName(a)) === lower(firstName(b))),
    name: (row) => String(row.name),
  },
  sessions: { what: 'Workout', same: (a, b) => a.date === b.date && a.started_at === b.started_at, name: (row) => `${String(row.title)} on ${String(row.date)}` },
  exercises: { what: 'Exercise', same: (a, b) => lower(a.name) === lower(b.name), name: (row) => String(row.name) },
  routines: { what: 'Workout routine', same: (a, b) => lower(a.name) === lower(b.name), name: (row) => String(row.name) },
  learning_pillars: { what: 'Learning pillar', same: (a, b) => lower(a.name) === lower(b.name), name: (row) => String(row.name) },
  learning_resources: { what: 'Learning resource', same: (a, b) => a.created_on === b.created_on || lower(a.title) === lower(b.title), name: (row) => String(row.title) },
  quotes: { what: 'Quote', same: (a, b) => (!!a.seed_key && a.seed_key === b.seed_key) || a.text === b.text, name: (row) => String(row.text).slice(0, 40) },
}

/** Every pointer from a record to another table that a merge has to keep true. */
const MERGE_LINKS: [string, string, string][] = [
  ...REFERENCES.map(([table, field, target]): [string, string, string] => [table, field, target]),
  ['learning_resources', 'pillar_id', 'learning_pillars'],
  ['sessions', 'routine_id', 'routines'],
]

/**
 * The reasons a file must not be added to this device. An id is only an id: the same number can
 * be one habit in the file and another here (a new phone, a reinstall, another person's export).
 * Adding the file's ticks would then hang them on the wrong habit, silently. So every record about
 * to be added is followed to what it points at, and where that id already exists here it has to
 * be the same thing. A difference nothing depends on is not a reason.
 */
async function mergeBlockers(database: AppDb, tables: Record<string, unknown[]>, plan: MergePlan): Promise<string[]> {
  const reasons = new Map<string, string>()
  const onDevice = new Map<string, Map<unknown, Row>>()
  const inFile = new Map<string, Map<unknown, Row>>()
  for (const parent of Object.keys(SAME_THING)) {
    onDevice.set(parent, new Map(((await database.table(parent).toArray()) as Row[]).map((row) => [row.id, row])))
    inFile.set(parent, new Map(((tables[parent] ?? []) as Row[]).map((row) => [row.id, row])))
  }
  const follow = (parent: string, id: unknown) => {
    if (id === null || id === undefined) return
    const here = onDevice.get(parent)!.get(id)
    const there = inFile.get(parent)!.get(id)
    if (!here || !there) return
    const rule = SAME_THING[parent]
    if (rule.same(there, here)) return
    reasons.set(`${parent}|${String(id)}`, `${rule.what} ${String(id)} is “${rule.name(there)}” in the file and “${rule.name(here)}” on this device.`)
  }
  for (const [table, field, parent] of MERGE_LINKS) {
    for (const row of plan.fresh[table] ?? []) follow(parent, row[field])
  }
  for (const routine of plan.fresh.day_routines ?? []) {
    for (const step of Array.isArray(routine.steps) ? (routine.steps as Row[]) : []) follow('habits', step.habit_id)
  }
  return [...reasons.values(), ...plan.clashes]
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

  // A file in the current shape must say that the move onto dated chapters has happened. Without
  // that record the next start would run the move again, on data that has already been through it.
  if (tables.habits.length && !((tables.migrations ?? []) as Row[]).some((row) => row.id === '001-cutover')) {
    problems.push({ level: 'error', table: 'migrations', message: 'The file has no record of the updates its data has been through, so it cannot be loaded safely.' })
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
  const ok = !problems.some((problem) => problem.level === 'error')
  const blockers = ok ? await schema.transaction('r', schema.tables, async () => mergeBlockers(schema, tables, await planMerge(schema, tables))) : []
  return {
    ok,
    upgraded: legacy,
    exported_at: typeof file.exported_at === 'string' ? file.exported_at : '',
    tables,
    counts,
    problems,
    merge_blockers: blockers,
  }
}

/** Thrown when a file is from a different history and so cannot be added to this one. */
export class MergeBlockedError extends Error {
  readonly reasons: string[]
  constructor(reasons: string[]) {
    super('This file cannot be added to what is on this device: it comes from a different history. It can replace what is here instead.')
    this.name = 'MergeBlockedError'
    this.reasons = reasons
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
    // Older copies are only dropped once the replace has really happened; a replace that fails
    // must not cost a copy, least of all the one being restored from.
    snapshot = await takeSnapshot(database, 'before-import', today, now, backupName, Number.POSITIVE_INFINITY)
    const taken = snapshot
    await database
      .transaction('rw', database.tables, async () => {
      for (const table of database.tables) {
        await table.clear()
        const rows = prepared.tables[table.name] ?? []
        if (rows.length) await table.bulkAdd(rows)
        added[table.name] = rows.length
      }
      })
      .catch(async (error: unknown) => {
        await removeSnapshot(taken, backupName).catch(() => undefined)
        throw error
      })
    await pruneSnapshots(backupName)
    return { mode, added, skipped, snapshot }
  }

  await database.transaction('rw', database.tables, async () => {
    const plan = await planMerge(database, prepared.tables)
    // Checked again here, against the data as it is now, and before anything is written.
    const blockers = await mergeBlockers(database, prepared.tables, plan)
    if (blockers.length) throw new MergeBlockedError(blockers)
    for (const table of database.tables) {
      const rows = plan.fresh[table.name]
      if (!rows) continue
      if (rows.length) await table.bulkAdd(rows)
      added[table.name] = rows.length
    }
    Object.assign(skipped, plan.skipped)
  })
  return { mode, added, skipped, snapshot }
}
