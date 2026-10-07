import { afterEach, describe, expect, it } from 'vitest'
import { listSnapshots } from './backup'
import { createDb, type AppDb } from './db'
import { createHabit, setHabitDone } from './habitRepo'
import { applyImport, buildExport, prepareImport } from './importExport'
import { runMigrations } from './migrations'
import { setDayRoutineRetired, setHabitInRoutine, updateDayRoutine } from './routineRepo'
import { phoneEntries, phoneHabits, phoneWeeklyRecords } from '../testing/fixtures'

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

const TODAY = '2026-10-07'

async function install(): Promise<{ db: AppDb; backups: string }> {
  counter += 1
  const db = createDb(`import-test-${counter}`)
  open.push(db)
  const backups = `import-test-backups-${counter}`
  await runMigrations({ db, today: '2026-09-01', now: 1, theme: 'system' }, { backupName: backups })
  return { db, backups }
}

const legacyFile = () => JSON.stringify({ exported_at: '2026-10-06', schema_version: 1, habits: phoneHabits(), entries: phoneEntries(), weekly_records: phoneWeeklyRecords() })

describe('export', () => {
  it('carries every table and what is needed to read it back', async () => {
    const { db } = await install()
    const file = await buildExport(db, TODAY)
    expect(file).toMatchObject({ app: 'personal-os', export_format: 3, exported_at: TODAY })
    for (const table of db.tables) expect(Array.isArray(file[table.name]), table.name).toBe(true)
    expect((file.habits as unknown[]).length).toBeGreaterThan(15)
    expect((file.migrations as unknown[]).length).toBe(6)
  })

  it('round-trips: export, wipe, import gives the same data back', async () => {
    const { db, backups } = await install()
    const meditation = (await db.habits.toArray()).find((habit) => habit.name.startsWith('Meditation'))!
    await setHabitDone(meditation.id!, TODAY, true, { today: TODAY, windowDays: 7 }, {}, db)
    const before = await buildExport(db, TODAY)

    const other = await install()
    const prepared = await prepareImport(JSON.stringify(before), other.db, TODAY, 5)
    expect(prepared.ok).toBe(true)
    expect(prepared.problems).toEqual([])
    await applyImport(other.db, prepared, 'replace', TODAY, 5, other.backups)
    const after = await buildExport(other.db, TODAY)
    for (const table of db.tables) expect(after[table.name], table.name).toEqual(before[table.name])
    void backups
  })
})

describe('checking a file before anything is touched', () => {
  it('refuses something that is not JSON, or not an export', async () => {
    const { db } = await install()
    expect((await prepareImport('{not json', db, TODAY, 1)).problems[0].message).toContain('not a JSON file')
    expect((await prepareImport('[1,2,3]', db, TODAY, 1)).ok).toBe(false)
    expect((await prepareImport('{"hello":"world"}', db, TODAY, 1)).problems[0].message).toContain('not an export of this app')
    expect((await prepareImport(JSON.stringify({ habits: [], data_format: 999 }), db, TODAY, 1)).problems[0].message).toContain('newer version')
    expect((await prepareImport(JSON.stringify({ habits: [1, 2] }), db, TODAY, 1)).ok).toBe(false)
  })

  it('blocks duplicate ids and an invalid habit frequency', async () => {
    const { db } = await install()
    const file = await buildExport(db, TODAY)
    const habits = file.habits as { id: number; name: string; versions: { day: unknown }[] }[]
    const broken = { ...file, habits: [...habits, { ...habits[0] }] }
    const duplicated = await prepareImport(JSON.stringify(broken), db, TODAY, 1)
    expect(duplicated.ok).toBe(false)
    expect(duplicated.problems.some((p) => p.message.includes('share the id'))).toBe(true)

    const invalid = { ...file, habits: habits.map((h, i) => (i === 0 ? { ...h, versions: [{ ...h.versions[0], day: { kind: 'weekdays', weekdays: [] } }] } : h)) }
    const result = await prepareImport(JSON.stringify(invalid), db, TODAY, 1)
    expect(result.ok).toBe(false)
    expect(result.problems.find((p) => p.table === 'habits')!.message).toContain('is not valid')
  })

  it('leaves out records with invalid dates or dangling references, and says how many', async () => {
    const { db } = await install()
    const file = await buildExport(db, TODAY)
    const habitId = (file.habits as { id: number }[])[0].id
    const tampered = {
      ...file,
      entries: [
        { id: 9001, habit_id: habitId, date: '2026-10-05', done: true },
        { id: 9002, habit_id: habitId, date: '2026-13-40', done: true },
        { id: 9003, habit_id: 424242, date: '2026-10-05', done: true },
      ],
      set_logs: [{ id: 1, session_id: 77, exercise_id: 1, date: '2026-10-05', position: 0, set_index: 1, done: true }],
      mystery: [{ a: 1 }],
    }
    const prepared = await prepareImport(JSON.stringify(tampered), db, TODAY, 1)
    expect(prepared.ok).toBe(true)
    expect(prepared.counts.entries).toBe(1)
    expect(prepared.counts.set_logs).toBe(0)
    const messages = prepared.problems.map((p) => `${p.table}: ${p.message}`)
    expect(messages).toContain('entries: 1 record has an invalid date and will be left out.')
    expect(messages).toContain('entries: 1 record points at a habit that is not in the file and will be left out.')
    expect(messages.some((m) => m.startsWith('mystery:'))).toBe(true)
  })
})

describe('adding what is missing', () => {
  it('adds new records, overwrites nothing, and changes nothing the second time', async () => {
    const source = await install()
    const stretch = await createHabit({ name: 'Stretch', area: 'body' }, '2026-10-01', source.db)
    await setHabitDone(stretch, TODAY, true, { today: TODAY, windowDays: 7 }, {}, source.db)
    const file = JSON.stringify(await buildExport(source.db, TODAY))

    const target = await install()
    const mine = (await target.db.habits.toArray())[0]
    await target.db.habits.update(mine.id!, { description: 'Edited on this device' })

    const first = await applyImport(target.db, await prepareImport(file, target.db, TODAY, 2), 'merge', TODAY, 2, target.backups)
    expect(first.added.habits).toBe(1)
    expect(first.added.entries).toBe(1)
    expect(first.snapshot).toBeNull()
    expect((await target.db.habits.get(mine.id!))!.description).toBe('Edited on this device')
    expect((await target.db.habits.get(stretch))!.name).toBe('Stretch')

    const counts = async () => Object.fromEntries(await Promise.all(target.db.tables.map(async (table) => [table.name, await table.count()])))
    const before = await counts()
    const second = await applyImport(target.db, await prepareImport(file, target.db, TODAY, 3), 'merge', TODAY, 3, target.backups)
    expect(Object.values(second.added).every((count) => count === 0)).toBe(true)
    expect(await counts()).toEqual(before)
  })

  it('never doubles a tick for the same habit and day, whatever its id', async () => {
    const { db, backups } = await install()
    const habit = (await db.habits.toArray())[0]
    await setHabitDone(habit.id!, TODAY, true, { today: TODAY, windowDays: 7 }, {}, db)
    const file = await buildExport(db, TODAY)
    const shifted = { ...file, entries: (file.entries as { id: number }[]).map((entry) => ({ ...entry, id: entry.id + 5000 })) }
    await applyImport(db, await prepareImport(JSON.stringify(shifted), db, TODAY, 2), 'merge', TODAY, 2, backups)
    expect(await db.entries.count()).toBe(1)
  })
})

describe('a file from a different history', () => {
  it('cannot be added to this device, and nothing is written when it is tried', async () => {
    // A new phone: a brand-new install, and the export from the old one. The same ids are
    // different habits on each, so adding the ticks would hang them on the wrong habits.
    const { db, backups } = await install()
    const prepared = await prepareImport(legacyFile(), db, TODAY, 4)
    expect(prepared.ok).toBe(true)
    expect(prepared.merge_blockers.length).toBeGreaterThan(0)
    expect(prepared.merge_blockers[0]).toMatch(/^Habit \d+ is “.+” in the file and “.+” on this device\.$/)

    const before = JSON.stringify(await buildExport(db, TODAY))
    await expect(applyImport(db, prepared, 'merge', TODAY, 4, backups)).rejects.toThrow(/cannot be added/)
    expect(JSON.stringify(await buildExport(db, TODAY))).toBe(before)

    // Replacing is still possible, and is the right way to move onto a new device.
    await applyImport(db, prepared, 'replace', TODAY, 5, backups)
    expect(await db.entries.count()).toBe(phoneEntries().length)
  })

  it('is recognised for workouts, exercises and learning too', async () => {
    const source = await install()
    const bench = (await source.db.exercises.toArray())[0]
    const session = await source.db.sessions.add({ date: TODAY, routine_id: null, title: 'Push', started_at: 10, ended_at: 20, notes: '', rest_started_at: null, rest_seconds: null })
    await source.db.set_logs.add({ session_id: session as number, exercise_id: bench.id!, date: TODAY, position: 0, set_index: 1, weight_kg: 60, reps: 8, seconds: null, distance_m: null, rir: null, kind: 'work', done: true, done_at: 15, note: '' })
    const file = JSON.stringify(await buildExport(source.db, TODAY))

    const target = await install()
    await target.db.exercises.update(bench.id!, { name: 'Something else entirely' })
    const prepared = await prepareImport(file, target.db, TODAY, 2)
    expect(prepared.merge_blockers).toEqual([`Exercise ${bench.id} is “${bench.name}” in the file and “Something else entirely” on this device.`])
  })

  it('is not held against a file when nothing being added depends on the difference', async () => {
    const source = await install()
    const file = JSON.stringify(await buildExport(source.db, TODAY))
    const target = await install()
    // A habit that differs on the two devices, with no tick for it in the file.
    const last = (await target.db.habits.toArray()).pop()!
    await target.db.habits.update(last.id!, { name: 'Something else', created_on: '2026-09-15' })

    const prepared = await prepareImport(file, target.db, TODAY, 2)
    expect(prepared.merge_blockers).toEqual([])
    await applyImport(target.db, prepared, 'merge', TODAY, 2, target.backups)
    expect((await target.db.habits.get(last.id!))!.name).toBe('Something else')
  })

  it('does not mistake a renamed habit for a different one', async () => {
    const { db, backups } = await install()
    const habit = (await db.habits.toArray())[0]
    await setHabitDone(habit.id!, TODAY, true, { today: TODAY, windowDays: 7 }, {}, db)
    const file = JSON.stringify(await buildExport(db, TODAY))
    await db.entries.clear()
    await db.habits.update(habit.id!, { name: 'Renamed since the export' })

    const prepared = await prepareImport(file, db, TODAY, 2)
    expect(prepared.merge_blockers).toEqual([])
    const summary = await applyImport(db, prepared, 'merge', TODAY, 2, backups)
    expect(summary.added.entries).toBe(1)
  })
})

describe('replacing everything', () => {
  it('keeps a copy of the current data first', async () => {
    const source = await install()
    const file = JSON.stringify(await buildExport(source.db, TODAY))
    const target = await install()
    await createHabit({ name: 'Only here', area: 'mind' }, TODAY, target.db)
    const summary = await applyImport(target.db, await prepareImport(file, target.db, TODAY, 9), 'replace', TODAY, 9, target.backups)
    expect(summary.snapshot).not.toBeNull()
    const [snapshot] = await listSnapshots(target.backups)
    expect(snapshot.label).toBe('before-import')
    expect((await target.db.habits.toArray()).some((habit) => habit.name === 'Only here')).toBe(false)
  })

  it('refuses a file that did not pass the checks', async () => {
    const { db, backups } = await install()
    const bad = await prepareImport('{"hello":1}', db, TODAY, 1)
    await expect(applyImport(db, bad, 'replace', TODAY, 1, backups)).rejects.toThrow()
    expect(await db.habits.count()).toBeGreaterThan(0)
  })
})

describe('an export from the earlier Habit Tracker', () => {
  it('is brought up to date and imported with its history intact', async () => {
    const { db, backups } = await install()
    const prepared = await prepareImport(legacyFile(), db, TODAY, 4)
    expect(prepared.ok).toBe(true)
    expect(prepared.upgraded).toBe(true)
    expect(prepared.counts.entries).toBe(phoneEntries().length)
    const names = (prepared.tables.habits as { name: string; retired_on: string | null }[]).filter((h) => h.retired_on === null).map((h) => h.name)
    expect(names).toContain('Hair oiling')
    expect(names).toContain('Gym')
    expect(names).not.toContain('Hair care')

    await applyImport(db, prepared, 'replace', TODAY, 4, backups)
    const gym = (await db.habits.toArray()).find((habit) => habit.name === 'Gym')!
    expect(gym.id).toBe(8)
    expect(gym.versions[0].name).toBe('Gym / Exercise')
    expect(await db.entries.count()).toBe(phoneEntries().length)
    expect(await db.weight_entries.count()).toBe(8)
    // The staging database used for the upgrade leaves nothing behind.
    const leftovers = (await indexedDB.databases()).filter((d) => d.name?.startsWith('import-staging-'))
    expect(leftovers).toEqual([])
  })
})

describe('day routines', () => {
  it('adds and removes a habit, drops empty reminder lines and tidies times', async () => {
    const { db } = await install()
    const [morning] = await db.day_routines.orderBy('sort_order').toArray()
    const habit = await createHabit({ name: 'Stretch', area: 'body' }, TODAY, db)
    await setHabitInRoutine(morning.id!, habit, true, db)
    await setHabitInRoutine(morning.id!, habit, true, db)
    let routine = (await db.day_routines.get(morning.id!))!
    expect(routine.steps.filter((step) => step.habit_id === habit)).toHaveLength(1)
    await setHabitInRoutine(morning.id!, habit, false, db)
    routine = (await db.day_routines.get(morning.id!))!
    expect(routine.steps.some((step) => step.habit_id === habit)).toBe(false)

    await updateDayRoutine(
      morning.id!,
      {
        name: '  Early morning ',
        steps: [
          { key: 'a', habit_id: null, label: '  Stretch for a minute ', time: '4:5', minutes: 0, note: '' },
          { key: 'a', habit_id: null, label: '   ', time: '', minutes: null, note: '' },
          { key: 'b', habit_id: habit, label: '', time: '04:10', minutes: 5, note: ' gently ' },
        ],
      },
      db,
    )
    routine = (await db.day_routines.get(morning.id!))!
    expect(routine.name).toBe('Early morning')
    expect(routine.steps).toHaveLength(2)
    expect(routine.steps[0]).toMatchObject({ label: 'Stretch for a minute', time: '', minutes: null })
    expect(routine.steps[1]).toMatchObject({ habit_id: habit, time: '04:10', minutes: 5, note: 'gently' })
    await expect(updateDayRoutine(morning.id!, { name: ' ' }, db)).rejects.toThrow()
    await setDayRoutineRetired(morning.id!, TODAY, db)
    expect((await db.day_routines.get(morning.id!))!.retired_on).toBe(TODAY)
  })
})
