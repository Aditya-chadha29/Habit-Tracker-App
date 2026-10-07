import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import {
  addQuote, anotherQuoteForDay, deleteQuoteAddedToday, ensureQuoteForDay, setQuoteFlags, setQuoteForDay,
} from './quoteRepo'

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

const TODAY = '2026-10-07'

async function library(count = 4) {
  const db = createDb(`quote-repo-test-${++counter}`)
  open.push(db)
  const ids: number[] = []
  for (let i = 1; i <= count; i++) ids.push(await addQuote({ text: `Quote ${i}`, author: 'A', category: 'Life', note: '' }, '2026-10-01', db))
  return { db, ids }
}

describe('the quote of the day', () => {
  it('gives a day one quote and counts it once, however often it is asked', async () => {
    const { db } = await library()
    const [a, b] = await Promise.all([ensureQuoteForDay(TODAY, 'rotate', db), ensureQuoteForDay(TODAY, 'rotate', db)])
    const again = await ensureQuoteForDay(TODAY, 'rotate', db)
    expect(b!.id).toBe(a!.id)
    expect(again!.id).toBe(a!.id)
    const shown = (await db.quotes.toArray()).reduce((total, quote) => total + quote.times_shown, 0)
    expect(shown).toBe(1)
    expect(await db.quote_days.count()).toBe(1)
    expect((await db.quotes.get(a!.id!))!.last_shown).toBe(TODAY)
  })

  it('shows a different quote the next day', async () => {
    const { db } = await library()
    const first = await ensureQuoteForDay(TODAY, 'rotate', db)
    const second = await ensureQuoteForDay('2026-10-08', 'rotate', db)
    expect(second!.id).not.toBe(first!.id)
  })

  it('returns nothing when the library is empty', async () => {
    const { db } = await library(0)
    expect(await ensureQuoteForDay(TODAY, 'rotate', db)).toBeNull()
    expect(await db.quote_days.count()).toBe(0)
  })

  it('a quote picked by hand sticks for the day and moves the count', async () => {
    const { db, ids } = await library()
    const auto = await ensureQuoteForDay(TODAY, 'rotate', db)
    const other = ids.find((id) => id !== auto!.id)!
    await setQuoteForDay(TODAY, other, db)
    expect((await ensureQuoteForDay(TODAY, 'rotate', db))!.id).toBe(other)
    expect((await db.quotes.get(auto!.id!))!.times_shown).toBe(0)
    expect((await db.quotes.get(other))!.times_shown).toBe(1)
    expect(await db.quote_days.get(TODAY)).toMatchObject({ quote_id: other, manual: true })
  })

  it('"another" swaps today’s quote for a different one', async () => {
    const { db } = await library()
    const first = await ensureQuoteForDay(TODAY, 'rotate', db)
    const next = await anotherQuoteForDay(TODAY, 'rotate', db)
    expect(next!.id).not.toBe(first!.id)
    expect((await db.quotes.toArray()).reduce((total, quote) => total + quote.times_shown, 0)).toBe(1)
  })

  it('replaces an automatic quote that has since been retired, and never picks never-show', async () => {
    const { db, ids } = await library(2)
    const first = await ensureQuoteForDay(TODAY, 'rotate', db)
    await setQuoteFlags(first!.id!, { active: false }, db)
    const replaced = await ensureQuoteForDay(TODAY, 'rotate', db)
    expect(replaced!.id).not.toBe(first!.id)
    await setQuoteFlags(ids[0], { active: true, never_show: true }, db)
    await setQuoteFlags(ids[1], { never_show: true }, db)
    expect(await ensureQuoteForDay('2026-10-09', 'rotate', db)).toBeNull()
  })

  it('carries the quote over in manual mode', async () => {
    const { db, ids } = await library()
    await setQuoteForDay(TODAY, ids[2], db)
    expect((await ensureQuoteForDay('2026-10-08', 'manual', db))!.id).toBe(ids[2])
  })
})

describe('the library', () => {
  it('trims a quote and strips the quotation marks typed around it', async () => {
    const { db } = await library(0)
    const id = await addQuote({ text: ' “Discipline is remembering what you want.” ', author: ' David Campbell ', category: '', note: '' }, TODAY, db)
    expect(await db.quotes.get(id)).toMatchObject({ text: 'Discipline is remembering what you want.', author: 'David Campbell', active: true })
    await expect(addQuote({ text: '  ', author: '', category: '', note: '' }, TODAY, db)).rejects.toThrow()
  })

  it('deletes only a quote added today', async () => {
    const { db, ids } = await library(1)
    await expect(deleteQuoteAddedToday(ids[0], TODAY, db)).rejects.toThrow()
    const fresh = await addQuote({ text: 'New', author: '', category: '', note: '' }, TODAY, db)
    await setQuoteForDay(TODAY, fresh, db)
    await deleteQuoteAddedToday(fresh, TODAY, db)
    expect(await db.quotes.count()).toBe(1)
    expect(await db.quote_days.count()).toBe(0)
  })
})
