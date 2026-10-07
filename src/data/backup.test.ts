import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { isKeptForever, listSnapshots, readSnapshot, takeSnapshot } from './backup'
import { createDb, type AppDb } from './db'

const open: AppDb[] = []
const backups: string[] = []
let counter = 0

function fresh(): { db: AppDb; backupName: string } {
  counter += 1
  const db = createDb(`backup-test-${counter}`)
  const backupName = `backup-test-${counter}-copies`
  open.push(db)
  backups.push(backupName)
  return { db, backupName }
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
  for (const name of backups.splice(0)) await Dexie.delete(name)
})

describe('automatic copies', () => {
  it('copies every table as it stands and can be read back', async () => {
    const { db, backupName } = fresh()
    await db.settings.put({ key: 'name', value: 'Aditya' })
    await db.entries.add({ habit_id: 1, date: '2026-10-06', done: true })

    const id = await takeSnapshot(db, 'before-import', '2026-10-07', 1000, backupName)
    await db.entries.clear()

    const snapshot = await readSnapshot(id, backupName)
    expect(snapshot?.row_count).toBe(2)
    expect(snapshot?.tables.entries).toEqual([expect.objectContaining({ habit_id: 1, date: '2026-10-06', done: true })])
    expect(snapshot?.tables.settings).toEqual([{ key: 'name', value: 'Aditya' }])
  })

  it('lists copies newest first without their contents', async () => {
    const { db, backupName } = fresh()
    await takeSnapshot(db, 'before-import', '2026-10-07', 1000, backupName)
    await takeSnapshot(db, 'before-006-something', '2026-10-08', 2000, backupName)

    const list = await listSnapshots(backupName)
    expect(list.map((row) => row.label)).toEqual(['before-006-something', 'before-import'])
    expect(list[0]).not.toHaveProperty('tables')
  })

  it('keeps only the most recent few, dropping the oldest first', async () => {
    const { db, backupName } = fresh()
    for (let i = 1; i <= 6; i++) await takeSnapshot(db, 'before-import', '2026-10-07', i * 1000, backupName, 4)

    const list = await listSnapshots(backupName)
    expect(list.map((row) => row.taken_at)).toEqual([6000, 5000, 4000, 3000])
  })

  it('never drops the copy taken before the move off the original app', async () => {
    const { db, backupName } = fresh()
    await takeSnapshot(db, 'before-001-cutover', '2026-10-07', 500, backupName, 4)
    for (let i = 1; i <= 6; i++) await takeSnapshot(db, 'before-import', '2026-10-08', i * 1000, backupName, 4)

    const list = await listSnapshots(backupName)
    expect(list.map((row) => row.label)).toEqual(['before-import', 'before-import', 'before-import', 'before-import', 'before-001-cutover'])
    expect(isKeptForever('before-001-cutover')).toBe(true)
    expect(isKeptForever('before-import')).toBe(false)
  })
})
