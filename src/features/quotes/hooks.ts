import { useEffect } from 'react'
import { db } from '../../data/db'
import { ensureQuoteForDay } from '../../data/quoteRepo'
import type { DateStr, Quote } from '../../data/types'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'

/**
 * The quote a day was given. Today's is chosen the first time it is asked for; an earlier day
 * shows what it was given at the time, or nothing — the past is not filled in after the fact.
 */
export function useQuoteOfDay(date: DateStr): { loaded: boolean; quote: Quote | null } {
  const { today, settings } = useCore()
  const { data, loaded } = useKeyedLiveQuery(date, async (day): Promise<Quote | null> => {
    const row = await db.quote_days.get(day)
    if (!row) return null
    return (await db.quotes.get(row.quote_id)) ?? null
  })
  const missing = loaded && data === null
  useEffect(() => {
    if (missing && date === today) void ensureQuoteForDay(date, settings.quote_mode)
  }, [missing, date, today, settings.quote_mode])
  return { loaded, quote: data ?? null }
}
