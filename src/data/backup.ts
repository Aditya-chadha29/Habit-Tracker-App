import Dexie, { type Table } from 'dexie'
import type { AppDb } from './db'
import type { DateStr } from './types'

/**
 * Copies of the whole database, kept in a second IndexedDB database so that nothing the app does
 * to its own tables can touch them. One is taken automatically before any data migration runs;
 * if a migration ever goes wrong, the state from just before it is still on the device and can be
 * exported or restored from the Data screen.
 */
export const BACKUP_DB_NAME = 'habit-tracker-backups'

export interface SnapshotRow {
  id: string
  label: string
  taken_on: DateStr
  taken_at: number
  db_version: number
  row_count: number
  tables: Record<string, unknown[]>
}

export type SnapshotSummary = Omit<SnapshotRow, 'tables'>

type BackupDb = Dexie & { snapshots: Table<SnapshotRow, string> }

function openBackups(name: string): BackupDb {
  const backups = new Dexie(name) as BackupDb
  backups.version(1).stores({ snapshots: 'id, taken_at' })
  return backups
}

/** Reads every table in one transaction, so the copy is a single consistent moment. */
export async function readEverything(database: AppDb): Promise<Record<string, unknown[]>> {
  const rows = await database.transaction('r', database.tables, async () =>
    Promise.all(database.tables.map(async (table) => [table.name, await table.toArray()] as const)),
  )
  return Object.fromEntries(rows)
}

export async function takeSnapshot(
  database: AppDb,
  label: string,
  today: DateStr,
  now: number,
  backupName: string = BACKUP_DB_NAME,
  keep = 4,
): Promise<string> {
  const tables = await readEverything(database)
  const rowCount = Object.values(tables).reduce((total, rows) => total + rows.length, 0)
  const id = `${today}-${now}-${label}`
  const backups = openBackups(backupName)
  try {
    await backups.snapshots.put({
      id,
      label,
      taken_on: today,
      taken_at: now,
      db_version: database.verno,
      row_count: rowCount,
      tables,
    })
    // Old copies are dropped oldest-first so the backup store cannot grow without limit.
    const all = await backups.snapshots.orderBy('taken_at').primaryKeys()
    if (all.length > keep) await backups.snapshots.bulkDelete(all.slice(0, all.length - keep))
  } finally {
    backups.close()
  }
  return id
}

export async function listSnapshots(backupName: string = BACKUP_DB_NAME): Promise<SnapshotSummary[]> {
  const backups = openBackups(backupName)
  try {
    const rows = await backups.snapshots.orderBy('taken_at').reverse().toArray()
    return rows.map(({ tables: _tables, ...summary }) => summary)
  } finally {
    backups.close()
  }
}

export async function readSnapshot(id: string, backupName: string = BACKUP_DB_NAME): Promise<SnapshotRow | undefined> {
  const backups = openBackups(backupName)
  try {
    return await backups.snapshots.get(id)
  } finally {
    backups.close()
  }
}
