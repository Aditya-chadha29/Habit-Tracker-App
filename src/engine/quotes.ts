import type { DateStr, Quote } from '../data/types'

/**
 * Choosing the day's quote.
 *
 * The collection is the owner's own, so the rule is simply fairness: the quote shown longest ago
 * comes next, never yesterday's again when there is another to show, and the same day always
 * gets the same answer.
 */
export type QuoteMode = 'rotate' | 'favorites' | 'manual'

/** Quotes that may be chosen automatically. In favourites mode only favourites — unless there
 *  are none, in which case the mode would mean "no quote at all", so it falls back to all. */
export function eligibleQuotes(quotes: readonly Quote[], mode: QuoteMode): Quote[] {
  const usable = quotes.filter((quote) => quote.active && !quote.never_show && quote.id !== undefined)
  if (mode !== 'favorites') return usable
  const favorites = usable.filter((quote) => quote.favorite)
  return favorites.length ? favorites : usable
}

/** FNV-1a: a stable pseudo-random order that depends on the date, so ties do not always resolve
 *  to the first row in the table. */
function tieBreak(date: DateStr, id: number): number {
  const text = `${date}|${id}`
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * The quote for `date`. `previousId` is the quote shown the day before.
 * In manual mode the previous day's quote simply carries over while it is still usable.
 */
export function chooseQuote(quotes: readonly Quote[], date: DateStr, mode: QuoteMode, previousId: number | null, excludeId: number | null = null): Quote | null {
  const usable = eligibleQuotes(quotes, mode)
  if (!usable.length) return null
  if (mode === 'manual' && previousId !== null && excludeId === null) {
    const carried = quotes.find((quote) => quote.id === previousId && quote.active && !quote.never_show)
    if (carried) return carried
  }
  let pool = usable.filter((quote) => quote.id !== excludeId)
  if (!pool.length) pool = usable
  const fresh = pool.filter((quote) => quote.id !== previousId)
  if (fresh.length) pool = fresh
  return [...pool].sort((a, b) => {
    const aShown = a.last_shown ?? ''
    const bShown = b.last_shown ?? ''
    if (aShown !== bShown) return aShown < bShown ? -1 : 1
    return tieBreak(date, a.id!) - tieBreak(date, b.id!)
  })[0]
}
