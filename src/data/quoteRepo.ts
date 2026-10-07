import { db, type AppDb } from './db'
import type { DateStr, Quote } from './types'
import { addDays } from '../engine/dates'
import { chooseQuote, type QuoteMode } from '../engine/quotes'

/**
 * The quote library and which quote each day was given.
 *
 * A day keeps the quote it was given: it is stored the first time the day is seen, and the
 * "times shown" count moves with it in the same transaction, so opening the app twice — or React
 * rendering twice — shows one quote and counts it once.
 */

/** Records `quote` as the quote of `date`, moving the shown-count off whatever was there before. */
async function assign(date: DateStr, quote: Quote, manual: boolean, database: AppDb): Promise<void> {
  const existing = await database.quote_days.get(date)
  if (existing && existing.quote_id === quote.id) {
    if (existing.manual !== manual) await database.quote_days.put({ date, quote_id: quote.id!, manual })
    return
  }
  if (existing) {
    const before = await database.quotes.get(existing.quote_id)
    if (before) await database.quotes.update(before.id!, { times_shown: Math.max(0, before.times_shown - 1) })
  }
  await database.quote_days.put({ date, quote_id: quote.id!, manual })
  await database.quotes.update(quote.id!, {
    times_shown: quote.times_shown + 1,
    last_shown: !quote.last_shown || quote.last_shown < date ? date : quote.last_shown,
  })
}

/** The quote for a day, choosing and storing one if the day has none yet. */
export async function ensureQuoteForDay(date: DateStr, mode: QuoteMode, database: AppDb = db): Promise<Quote | null> {
  return database.transaction('rw', database.quotes, database.quote_days, async () => {
    const day = await database.quote_days.get(date)
    if (day) {
      const current = await database.quotes.get(day.quote_id)
      // A hand-picked quote stays even if it is later retired; an automatic one is replaced.
      if (current && (day.manual || (current.active && !current.never_show))) return current
    }
    const yesterday = await database.quote_days.get(addDays(date, -1))
    const chosen = chooseQuote(await database.quotes.toArray(), date, mode, yesterday?.quote_id ?? null)
    if (!chosen) return null
    await assign(date, chosen, false, database)
    return (await database.quotes.get(chosen.id!)) ?? null
  })
}

/** Replaces the day's quote with a different one from the rotation. */
export async function anotherQuoteForDay(date: DateStr, mode: QuoteMode, database: AppDb = db): Promise<Quote | null> {
  return database.transaction('rw', database.quotes, database.quote_days, async () => {
    const day = await database.quote_days.get(date)
    const yesterday = await database.quote_days.get(addDays(date, -1))
    const chosen = chooseQuote(await database.quotes.toArray(), date, mode === 'manual' ? 'rotate' : mode, yesterday?.quote_id ?? null, day?.quote_id ?? null)
    if (!chosen) return null
    await assign(date, chosen, false, database)
    return (await database.quotes.get(chosen.id!)) ?? null
  })
}

/** Sets the day's quote by hand. */
export async function setQuoteForDay(date: DateStr, quoteId: number, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.quotes, database.quote_days, async () => {
    const quote = await database.quotes.get(quoteId)
    if (!quote) throw new Error('That quote no longer exists.')
    await assign(date, quote, true, database)
  })
}

export interface QuoteInput {
  text: string
  author: string
  category: string
  note: string
}

function clean(input: QuoteInput): QuoteInput {
  const text = input.text.trim().replace(/^[“"']+|[”"']+$/g, '').trim()
  if (!text) throw new Error('A quote needs some words.')
  return { text, author: input.author.trim(), category: input.category.trim(), note: input.note.trim() }
}

export async function addQuote(input: QuoteInput, today: DateStr, database: AppDb = db): Promise<number> {
  return (await database.quotes.add({
    ...clean(input),
    favorite: false,
    active: true,
    never_show: false,
    times_shown: 0,
    last_shown: null,
    created_on: today,
  })) as number
}

export async function updateQuote(id: number, input: QuoteInput, database: AppDb = db): Promise<void> {
  await database.quotes.update(id, clean(input))
}

export async function setQuoteFlags(
  id: number,
  flags: Partial<Pick<Quote, 'favorite' | 'active' | 'never_show'>>,
  database: AppDb = db,
): Promise<void> {
  await database.quotes.update(id, flags)
}

/** Only a quote added today, which no earlier day can have shown, may be deleted outright.
 *  Anything older is retired, so the record of what each day showed stays intact. */
export async function deleteQuoteAddedToday(id: number, today: DateStr, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.quotes, database.quote_days, async () => {
    const quote = await database.quotes.get(id)
    if (!quote) return
    if (quote.created_on !== today) throw new Error('Only a quote added today can be deleted. Retire it instead.')
    const days = await database.quote_days.toArray()
    await database.quote_days.bulkDelete(days.filter((day) => day.quote_id === id).map((day) => day.date))
    await database.quotes.delete(id)
  })
}
