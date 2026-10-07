import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { listSnapshots, takeSnapshot } from './backup'
import { createDb, type AppDb } from './db'
import { annotateEntry, createHabit, retireHabit } from './habitRepo'
import { applyImport, buildExport, prepareImport } from './importExport'
import { blankResource, createResource, logSession } from './learningRepo'
import { MIGRATIONS, runMigrations } from './migrations'
import { finishSession, startSession } from './workoutRepo'

// Regression tests for defects an independent review of the data layer found before first release.
const open: AppDb[] = []
const backupNames: string[] = []
let counter = 0

async function install(today = '2026-09-01'): Promise<{ db: AppDb; backups: string }> {
  counter += 1
  const db = createDb(`safety-test-${counter}`)
  const backups = `safety-test-backups-${counter}`
  open.push(db)
  backupNames.push(backups)
  await runMigrations({ db, today, now: 1, theme: 'system' }, { backupName: backups })
  return { db, backups }
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
  for (const name of backupNames.splice(0)) await Dexie.delete(name)
})

const TODAY = '2026-10-07'
const ctx = { today: TODAY, windowDays: 7 }

describe('data steps', () => {
  it('a step another start has already run is not run again', async () => {
    counter += 1
    const db = createDb(`safety-test-${counter}`)
    open.push(db)
    let runs = 0
    const step = {
      ...MIGRATIONS[0],
      id: 'test-step',
      run: async () => {
        runs += 1
        return null
      },
    }
    // Two starts that both saw the step as pending.
    await Promise.all([
      runMigrations({ db, today: TODAY, now: 1, theme: 'system' }, { migrations: [step], backupName: `safety-none-${counter}` }),
      runMigrations({ db, today: TODAY, now: 2, theme: 'system' }, { migrations: [step], backupName: `safety-none-${counter}` }),
    ])
    expect(runs).toBe(1)
    expect(await db.migrations.count()).toBe(1)
  })
})

describe('copies', () => {
  it('a permanent copy is taken once, however often the start is retried', async () => {
    const { db, backups } = await install()
    await takeSnapshot(db, 'before-001-cutover', TODAY, 10, backups)
    await db.settings.put({ key: 'name', value: 'changed later' })
    await takeSnapshot(db, 'before-001-cutover', TODAY, 20, backups)
    const copies = (await listSnapshots(backups)).filter((copy) => copy.label === 'before-001-cutover')
    expect(copies).toHaveLength(1)
    expect(copies[0].taken_at).toBe(10)
  })

  it('a replace that fails costs no copy and leaves the data as it was', async () => {
    const { db, backups } = await install()
    for (let i = 1; i <= 4; i++) await takeSnapshot(db, 'before-import', TODAY, i * 100, backups)
    const before = (await listSnapshots(backups)).map((copy) => copy.id)
    const prepared = await prepareImport(JSON.stringify(await buildExport(db, TODAY)), db, TODAY, 5)
    // Two quotes with one seed key break a unique index half-way through the load.
    const quotes = prepared.tables.quotes as { id: number }[]
    const broken = { ...prepared, tables: { ...prepared.tables, quotes: [...quotes, { ...quotes[0], id: 99999 }] } }
    const habits = await db.habits.count()

    await expect(applyImport(db, broken, 'replace', TODAY, 5000, backups)).rejects.toThrow()
    expect((await listSnapshots(backups)).map((copy) => copy.id)).toEqual(before)
    expect(await db.habits.count()).toBe(habits)
  })
})

describe('import', () => {
  it('refuses a current-format file with no record of the updates it has been through', async () => {
    const { db } = await install()
    const file = { ...(await buildExport(db, TODAY)), migrations: [] }
    const prepared = await prepareImport(JSON.stringify(file), db, TODAY, 2)
    expect(prepared.ok).toBe(false)
    expect(prepared.problems[0].message).toMatch(/no record of the updates/)
  })

  it('does not pass over a different record that happens to reuse an id', async () => {
    const source = await install()
    await source.db.weight_entries.add({ id: 1, date: '2026-10-01', kg: 80, note: '', created_at: 111 })
    const file = JSON.stringify(await buildExport(source.db, TODAY))
    const target = await install()
    await target.db.weight_entries.add({ id: 1, date: '2026-10-03', kg: 79, note: '', created_at: 222 })

    const prepared = await prepareImport(file, target.db, TODAY, 2)
    expect(prepared.merge_blockers).toEqual(['Weight entry 1 is a different record in the file and on this device.'])
    await expect(applyImport(target.db, prepared, 'merge', TODAY, 2, target.backups)).rejects.toThrow(/cannot be added/)
    expect((await target.db.weight_entries.get(1))!.kg).toBe(79)
  })
})

describe('writes that must respect history', () => {
  it('a workout left open on a day that has locked cannot be finished into it', async () => {
    const { db } = await install()
    const old = { today: '2026-09-20', windowDays: 7 }
    const id = await startSession(null, '2026-09-20', old, 1, db)
    await expect(finishSession(id, '', ctx, 2, db)).rejects.toThrow()
    expect((await db.sessions.get(id))!.ended_at).toBeNull()
    // Inside the window it still finishes.
    await finishSession(id, '', { today: '2026-09-22', windowDays: 7 }, 4, db)
    expect((await db.sessions.get(id))!.ended_at).not.toBeNull()
  })

  it('a note cannot be put on a day the habit was not tracked', async () => {
    const { db } = await install()
    const id = await createHabit({ name: 'Stretch', area: 'body' }, '2026-10-05', db)
    await expect(annotateEntry(id, '2026-10-03', ctx, { note: 'before it existed' }, db)).rejects.toThrow(/not being tracked/)
    await retireHabit(id, '2026-10-06', db)
    await expect(annotateEntry(id, TODAY, ctx, { note: 'after it was retired' }, db)).rejects.toThrow(/not being tracked/)
    await expect(annotateEntry(9999, TODAY, ctx, { note: 'no such habit' }, db)).rejects.toThrow(/no longer exists/)
    expect(await db.entries.count()).toBe(0)
    await annotateEntry(id, '2026-10-05', ctx, { note: 'fine' }, db)
    expect(await db.entries.count()).toBe(1)
  })

  it('a learning session entered for an earlier day does not wind the resource back', async () => {
    const { db } = await install()
    const id = await createResource({ ...blankResource('book'), title: 'A book', progress_total: 200 }, '2026-10-01', db)
    const session = { resource_id: id, lane: 'reading' as const, minutes: 20, notes: '', finished: false }
    await logSession({ ...session, date: TODAY, progress_after: 80 }, ctx, 10, db)
    await logSession({ ...session, date: '2026-10-06', progress_after: 50 }, ctx, 20, db)

    const resource = (await db.learning_resources.get(id))!
    expect(resource.progress_current).toBe(80)
    expect(resource.started_on).toBe('2026-10-06')
    const backdated = (await db.learning_sessions.toArray()).find((row) => row.date === '2026-10-06')!
    expect([backdated.progress_before, backdated.progress_after]).toEqual([0, 50])
  })
})
