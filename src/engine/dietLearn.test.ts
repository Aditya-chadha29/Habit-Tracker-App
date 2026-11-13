import { describe, expect, it } from 'vitest'
import type { Meal } from '../data/types'
import { favouriteMeals } from '../data/mealRepo'
import { finishEstimate } from './learning'

describe('when a resource would be finished', () => {
  const book = { progress_total: 300, progress_current: 100, status: 'in_progress' as const }
  it('projects the pace since the first session', () => {
    // 100 pages in 10 days: 200 left takes 20 more days.
    expect(finishEstimate(book, [{ date: '2026-11-01', progress_before: 0 }, { date: '2026-11-08', progress_before: 60 }], '2026-11-11')).toBe('2026-12-01')
  })
  it('says nothing without a total, progress, or two sessions', () => {
    expect(finishEstimate({ ...book, progress_total: null }, [{ date: '2026-11-01', progress_before: 0 }, { date: '2026-11-02', progress_before: 5 }], '2026-11-11')).toBeNull()
    expect(finishEstimate(book, [{ date: '2026-11-01', progress_before: 0 }], '2026-11-11')).toBeNull()
    expect(finishEstimate({ ...book, progress_current: 0 }, [{ date: '2026-11-01', progress_before: 0 }, { date: '2026-11-02', progress_before: 0 }], '2026-11-11')).toBeNull()
    expect(finishEstimate(book, [{ date: '2026-11-11', progress_before: 0 }, { date: '2026-11-11', progress_before: 50 }], '2026-11-11')).toBeNull()
  })
})

describe('favourite meals', () => {
  const meal = (date: string, slot: string, text: string) => ({ date, slot, text, ate_out: false }) as Meal
  it('offers what was written at least twice for the slot, most frequent first', () => {
    const meals = [
      meal('2026-11-01', 'breakfast', 'Oats'), meal('2026-11-02', 'breakfast', 'oats '), meal('2026-11-03', 'breakfast', 'Eggs'),
      meal('2026-11-04', 'breakfast', 'Eggs'), meal('2026-11-05', 'breakfast', 'eggs'), meal('2026-11-06', 'breakfast', 'Poha'),
      meal('2026-11-01', 'lunch', 'Dal'), meal('2026-11-02', 'lunch', 'Dal'),
    ]
    expect(favouriteMeals(meals, 'breakfast')).toEqual(['eggs', 'oats'])
    expect(favouriteMeals(meals, 'dinner')).toEqual([])
  })
})
