import { describe, expect, it } from 'vitest'
import { habit, indexOf, ticks } from '../testing/builders'
import { dateRange } from './dates'
import { compareWindows } from './trend'

describe('the improving / declining indicator', () => {
  const h = habit({ id: 1, from: '2026-09-01', area: 'mind' })
  const today = '2026-10-15'

  it('compares the last seven finished days with the seven before', () => {
    // previous window 1–7 Oct: 3 of 7; current window 8–14 Oct: 6 of 7
    const index = indexOf({
      entries: ticks(1, ['2026-10-01', '2026-10-02', '2026-10-03', ...dateRange('2026-10-08', '2026-10-13')]),
    })
    const result = compareWindows([h], index, today)
    expect(result.previous).toEqual({ done: 3, due: 7 })
    expect(result.current).toEqual({ done: 6, due: 7 })
    expect(result.delta).toBe(43)
    expect(result.direction).toBe('up')
  })

  it('leaves today out, so an unfinished morning is not a decline', () => {
    const index = indexOf({ entries: ticks(1, dateRange('2026-10-01', '2026-10-14')) })
    expect(compareWindows([h], index, today).direction).toBe('flat')
  })

  it('reports a small change as flat', () => {
    const many = Array.from({ length: 10 }, (_, i) => habit({ id: i + 1, from: '2026-09-01' }))
    const entries = many.flatMap((m) => ticks(m.id!, dateRange('2026-10-01', '2026-10-14')))
    entries.pop() // one tick fewer in the current window: 69 of 70 against 70 of 70
    expect(compareWindows(many, indexOf({ entries }), today)).toMatchObject({ delta: -1, direction: 'flat' })
  })

  it('gives no direction without enough history', () => {
    const young = habit({ id: 2, from: '2026-10-10' })
    const result = compareWindows([young], indexOf({}), today)
    expect(result.direction).toBeNull()
    expect(result.delta).toBeNull()
  })

  it('can look at one pillar on its own', () => {
    const body = habit({ id: 3, from: '2026-09-01', area: 'body' })
    const index = indexOf({ entries: ticks(3, dateRange('2026-10-08', '2026-10-14')) })
    expect(compareWindows([h, body], index, today, 7, 'body').direction).toBe('up')
    expect(compareWindows([h, body], index, today, 7, 'mind').direction).toBe('flat')
  })
})
