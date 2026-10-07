import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { blankResource, createResource, deletePillar } from './learningRepo'
import { MIGRATIONS, runMigrations } from './migrations'

const open: AppDb[] = []
let counter = 0
afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

async function install(upTo?: string): Promise<AppDb> {
  counter += 1
  const db = createDb(`pillars-test-${counter}`)
  open.push(db)
  const migrations = upTo ? MIGRATIONS.slice(0, MIGRATIONS.findIndex((m) => m.id === upTo) + 1) : MIGRATIONS
  await runMigrations({ db, today: '2026-10-01', now: 1, theme: 'system' }, { migrations, backupName: `pillars-test-backups-${counter}` })
  return db
}
const names = async (db: AppDb) => (await db.learning_pillars.orderBy('sort_order').toArray()).map((pillar) => pillar.name)

describe('learning pillars', () => {
  it('a new install has the four pillars, in order', async () => {
    expect(await names(await install())).toEqual(['Self Growth', 'AI & Technology', 'Construction', 'Manufacturing'])
  })

  it('an install with the earlier four is brought to the same four', async () => {
    const db = await install('006-more-quotes')
    expect(await names(db)).toEqual(['Self Growth', 'AI & Technology', 'Technical / Professional', 'Construction & Manufacturing'])
    await runMigrations({ db, today: '2026-10-07', now: 2, theme: 'system' }, { backupName: `pillars-test-backups-${counter}` })
    expect(await names(db)).toEqual(['Self Growth', 'AI & Technology', 'Construction', 'Manufacturing'])
  })

  it('leaves alone a pillar the user renamed, and one that has things saved under it', async () => {
    const db = await install('006-more-quotes')
    const pillars = await db.learning_pillars.orderBy('sort_order').toArray()
    await db.learning_pillars.update(pillars[3].id!, { name: 'Building things' })
    const id = await createResource({ ...blankResource('book'), title: 'A book', pillar_id: pillars[2].id! }, '2026-10-02', db)
    await runMigrations({ db, today: '2026-10-07', now: 2, theme: 'system' }, { backupName: `pillars-test-backups-${counter}` })

    expect(await names(db)).toEqual(['Self Growth', 'AI & Technology', 'Technical / Professional', 'Building things', 'Construction', 'Manufacturing'])
    expect((await db.learning_resources.get(id))!.pillar_id).toBe(pillars[2].id)
  })

  it('deleting a pillar keeps what was saved under it, without a pillar', async () => {
    const db = await install()
    const pillar = (await db.learning_pillars.toArray())[0]
    const id = await createResource({ ...blankResource('book'), title: 'A book', pillar_id: pillar.id! }, '2026-10-02', db)
    await deletePillar(pillar.id!, db)
    expect(await db.learning_pillars.get(pillar.id!)).toBeUndefined()
    expect((await db.learning_resources.get(id))!).toMatchObject({ title: 'A book', pillar_id: null })
  })
})
