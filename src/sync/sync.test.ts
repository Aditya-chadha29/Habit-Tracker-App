import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from '../data/db'
import { createHabit, setHabitDone } from '../data/habitRepo'
import { runMigrations } from '../data/migrations'
import { pack, unpack } from './codec'
import { memoryStore, type StateStore } from './state'
import { decide, syncOnce, type Cloud, type CloudMeta, type SyncDeps } from './sync'

const TODAY = '2026-10-08'
let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

interface Device {
  db: AppDb
  store: StateStore
  backups: string
  changes: number
  deps: (extra?: Partial<SyncDeps>) => SyncDeps
}

function fakeCloud() {
  let meta: CloudMeta | null = null
  const parts = new Map<string, Uint8Array[]>()
  let interfere: (() => void) | null = null
  const cloud: Cloud = {
    readMeta: async () => meta,
    readChunks: async (_uid, wanted) => parts.get(wanted.id) ?? [],
    async write(_uid, expectedRev, next, chunks) {
      if (interfere) {
        const act = interfere
        interfere = null
        act()
      }
      if ((meta?.rev ?? null) !== expectedRev) return 'stale'
      parts.set(next.id, chunks)
      meta = { ...next, previous: meta ? { id: meta.id, chunks: meta.chunks } : null }
      return 'ok'
    },
  }
  return {
    cloud,
    meta: () => meta,
    /** Makes another device's save land just before the next write. */
    bumpBeforeNextWrite: () => {
      interfere = () => {
        if (meta) meta = { ...meta, rev: meta.rev + 1 }
      }
    },
  }
}

async function device(cloud: Cloud, name: string): Promise<Device> {
  counter += 1
  const db = createDb(`sync-test-${counter}`)
  open.push(db)
  const backups = `sync-test-backups-${counter}`
  await runMigrations({ db, today: '2026-09-01', now: 1, theme: 'system' }, { backupName: backups })
  const store = memoryStore({ device: name })
  const self: Device = {
    db,
    store,
    backups,
    changes: 0,
    deps: (extra = {}) => ({ db, cloud, uid: 'person', store, today: TODAY, now: 100 + counter, changeCount: () => self.changes, backupName: backups, ...extra }),
  }
  return self
}

async function tick(target: Device, name: string): Promise<void> {
  const id = await createHabit({ name, area: 'body' }, '2026-10-01', target.db)
  await setHabitDone(id, TODAY, true, { today: TODAY, windowDays: 7 }, {}, target.db)
  target.changes += 1
  target.store.write({ dirty: true })
}

describe('which way a copy goes', () => {
  const base = { cloudRev: 3, cloudEmpty: false, localRev: 3, dirty: false, localEmpty: false }
  it('does nothing when the two match', () => expect(decide(base)).toBe('idle'))
  it('saves when this device changed', () => expect(decide({ ...base, dirty: true })).toBe('push'))
  it('takes a newer copy when this device did not change', () => expect(decide({ ...base, cloudRev: 4 })).toBe('pull'))
  it('asks when both changed', () => expect(decide({ ...base, cloudRev: 4, dirty: true })).toBe('choose'))
  it('saves when the cloud has nothing yet', () => expect(decide({ ...base, cloudRev: null, localRev: null })).toBe('push'))
  it('fills a device that has nothing of its own', () => expect(decide({ ...base, localRev: null, localEmpty: true, dirty: true })).toBe('pull'))
  it('asks when a device with its own history meets a cloud copy', () => expect(decide({ ...base, localRev: null, dirty: true })).toBe('choose'))
  it('never lets an empty cloud copy replace a device with history', () => {
    expect(decide({ ...base, localRev: null, cloudEmpty: true, dirty: true })).toBe('push')
    expect(decide({ ...base, cloudRev: 4, cloudEmpty: true })).toBe('choose')
  })
  it('follows the choice once it is made', () => {
    expect(decide({ ...base, cloudRev: 4, dirty: true, choice: 'device' })).toBe('push')
    expect(decide({ ...base, cloudRev: 4, dirty: true, choice: 'cloud' })).toBe('pull')
  })
})

describe('packing the copy', () => {
  it('comes back the same, across several parts and with non-English text', async () => {
    const text = JSON.stringify({ note: 'ध्यान 桜 – “quoted”', filler: Array.from({ length: 4000 }, (_, i) => `row ${i * 7919}`) })
    const packed = await pack(text, 1000)
    expect(packed.chunks.length).toBeGreaterThan(1)
    expect(packed.chunks.every((chunk) => chunk.length <= 1000)).toBe(true)
    expect(await unpack(packed.encoding, packed.chunks)).toBe(text)
  })
  it('reads a copy that was stored without compression', async () => {
    expect(await unpack('plain', [new TextEncoder().encode('{"a":1}')])).toBe('{"a":1}')
  })
})

describe('keeping two devices in step', () => {
  it('the first device saves, and a new empty device takes that copy', async () => {
    const { cloud, meta } = fakeCloud()
    const phone = await device(cloud, 'iPhone')
    await tick(phone, 'Stretch')
    expect((await syncOnce(phone.deps())).kind).toBe('pushed')
    expect(meta()).toMatchObject({ rev: 1, device: 'iPhone', entries: 1, empty: false })
    expect(phone.store.read()).toMatchObject({ rev: 1, dirty: false })

    const fresh = await device(cloud, 'Windows')
    expect(await fresh.db.entries.count()).toBe(0)
    expect((await syncOnce(fresh.deps())).kind).toBe('pulled')
    expect(await fresh.db.entries.count()).toBe(1)
    expect((await fresh.db.habits.toArray()).map((habit) => habit.name)).toContain('Stretch')
    expect(await fresh.db.habits.count()).toBe(await phone.db.habits.count())
    expect(fresh.store.read()).toMatchObject({ rev: 1, dirty: false })
    expect((await syncOnce(fresh.deps())).kind).toBe('idle')
  })

  it('a change on one device reaches the other', async () => {
    const { cloud } = fakeCloud()
    const phone = await device(cloud, 'iPhone')
    await tick(phone, 'Stretch')
    await syncOnce(phone.deps())
    const laptop = await device(cloud, 'Windows')
    await syncOnce(laptop.deps())

    await tick(laptop, 'Read')
    expect((await syncOnce(laptop.deps())).kind).toBe('pushed')
    expect((await syncOnce(phone.deps())).kind).toBe('pulled')
    expect(await phone.db.entries.count()).toBe(2)
  })

  it('stops and asks when both devices changed, and replaces nothing until told', async () => {
    const { cloud } = fakeCloud()
    const phone = await device(cloud, 'iPhone')
    await tick(phone, 'Stretch')
    await syncOnce(phone.deps())
    const laptop = await device(cloud, 'Windows')
    await syncOnce(laptop.deps())

    await tick(laptop, 'Read')
    await syncOnce(laptop.deps())
    await tick(phone, 'Walk')
    const outcome = await syncOnce(phone.deps())
    expect(outcome.kind).toBe('choose')
    expect((await phone.db.habits.toArray()).map((habit) => habit.name)).toContain('Walk')
    expect((await phone.db.habits.toArray()).map((habit) => habit.name)).not.toContain('Read')

    expect((await syncOnce(phone.deps({ choice: 'device' }))).kind).toBe('pushed')
    expect((await syncOnce(laptop.deps())).kind).toBe('pulled')
    expect((await laptop.db.habits.toArray()).map((habit) => habit.name)).toContain('Walk')
  })

  it('a new icon that saved first does not wipe the device holding the history', async () => {
    const { cloud, meta } = fakeCloud()
    const fresh = await device(cloud, 'New icon')
    expect((await syncOnce(fresh.deps())).kind).toBe('pushed')
    expect(meta()).toMatchObject({ empty: true })

    const old = await device(cloud, 'Old icon')
    await tick(old, 'Stretch')
    expect((await syncOnce(old.deps())).kind).toBe('pushed')
    expect(await old.db.entries.count()).toBe(1)
    expect(meta()).toMatchObject({ rev: 2, empty: false, entries: 1 })

    expect((await syncOnce(fresh.deps())).kind).toBe('pulled')
    expect(await fresh.db.entries.count()).toBe(1)
  })

  it('looks again when another device saves in the middle of a save', async () => {
    const { cloud, bumpBeforeNextWrite } = fakeCloud()
    const phone = await device(cloud, 'iPhone')
    await tick(phone, 'Stretch')
    await syncOnce(phone.deps())
    await tick(phone, 'Walk')
    bumpBeforeNextWrite()
    // The cloud moved on while this device had changes of its own: that is a choice, not a save.
    expect((await syncOnce(phone.deps())).kind).toBe('choose')
  })

  it('keeps a copy of the device before a cloud copy replaces it', async () => {
    const { cloud } = fakeCloud()
    const phone = await device(cloud, 'iPhone')
    await tick(phone, 'Stretch')
    await syncOnce(phone.deps())
    const other = await device(cloud, 'Windows')
    await tick(other, 'Mine')
    expect((await syncOnce(other.deps())).kind).toBe('choose')
    await syncOnce(other.deps({ choice: 'cloud' }))
    const { listSnapshots } = await import('../data/backup')
    expect((await listSnapshots(other.backups)).some((row) => row.label === 'before-import')).toBe(true)
  })

  it('marks changes made during a save as still waiting', async () => {
    const { cloud } = fakeCloud()
    const phone = await device(cloud, 'iPhone')
    await tick(phone, 'Stretch')
    let calls = 0
    await syncOnce(phone.deps({ changeCount: () => (calls++ === 0 ? 1 : 2) }))
    expect(phone.store.read().dirty).toBe(true)
  })
})
