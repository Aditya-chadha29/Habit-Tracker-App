import { describe, expect, it } from 'vitest'
import type { Quote } from '../data/types'
import { addDays } from './dates'
import { chooseQuote, eligibleQuotes } from './quotes'

function quote(id: number, overrides: Partial<Quote> = {}): Quote {
  return {
    id, text: `Quote ${id}`, author: 'Someone', category: 'Life', favorite: false, active: true, never_show: false,
    times_shown: 0, last_shown: null, note: '', created_on: '2026-10-01', ...overrides,
  }
}

describe('choosing the day’s quote', () => {
  const library = [quote(1), quote(2), quote(3), quote(4)]

  it('is the same every time it is asked for the same day', () => {
    const first = chooseQuote(library, '2026-10-07', 'rotate', null)
    expect(chooseQuote(library, '2026-10-07', 'rotate', null)).toEqual(first)
  })

  it('goes through the whole collection before repeating', () => {
    let quotes: Quote[] = library
    let previous: number | null = null
    const seen: number[] = []
    for (let i = 0; i < 4; i++) {
      const date = addDays('2026-10-07', i)
      const chosen: Quote = chooseQuote(quotes, date, 'rotate', previous)!
      seen.push(chosen.id!)
      quotes = quotes.map((q) => (q.id === chosen.id ? { ...q, last_shown: date, times_shown: q.times_shown + 1 } : q))
      previous = chosen.id!
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4])
  })

  it('prefers the quote shown longest ago', () => {
    const shown = [quote(1, { last_shown: '2026-10-05' }), quote(2, { last_shown: '2026-10-01' }), quote(3, { last_shown: '2026-10-06' })]
    expect(chooseQuote(shown, '2026-10-07', 'rotate', 3)!.id).toBe(2)
  })

  it('never repeats yesterday’s while another is available', () => {
    const two = [quote(1), quote(2, { last_shown: '2026-10-06' })]
    expect(chooseQuote(two, '2026-10-07', 'rotate', 2)!.id).toBe(1)
    expect(chooseQuote([quote(9)], '2026-10-07', 'rotate', 9)!.id).toBe(9)
  })

  it('never picks a retired quote or one marked never show', () => {
    const quotes = [quote(1, { active: false }), quote(2, { never_show: true }), quote(3)]
    for (let i = 0; i < 10; i++) expect(chooseQuote(quotes, addDays('2026-10-07', i), 'rotate', null)!.id).toBe(3)
    expect(chooseQuote(quotes.slice(0, 2), '2026-10-07', 'rotate', null)).toBeNull()
  })

  it('keeps to favourites in favourites mode, and to everything when there are none', () => {
    const quotes = [quote(1), quote(2, { favorite: true }), quote(3, { favorite: true })]
    expect(eligibleQuotes(quotes, 'favorites').map((q) => q.id)).toEqual([2, 3])
    expect(eligibleQuotes([quote(1), quote(2)], 'favorites').map((q) => q.id)).toEqual([1, 2])
  })

  it('carries yesterday’s quote over in manual mode until another is picked', () => {
    expect(chooseQuote(library, '2026-10-08', 'manual', 3)!.id).toBe(3)
    const retired = library.map((q) => (q.id === 3 ? { ...q, active: false } : q))
    expect(chooseQuote(retired, '2026-10-08', 'manual', 3)!.id).not.toBe(3)
  })

  it('can be asked for a different one than the current', () => {
    const chosen = chooseQuote(library, '2026-10-07', 'rotate', null)!
    expect(chooseQuote(library, '2026-10-07', 'rotate', null, chosen.id!)!.id).not.toBe(chosen.id)
  })
})
