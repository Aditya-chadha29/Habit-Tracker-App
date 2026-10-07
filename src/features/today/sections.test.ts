import { describe, expect, it } from 'vitest'
import type { AreaConfig, DayRoutine } from '../../data/types'
import { habit, indexOf, ticks } from '../../testing/builders'
import { buildDayView, nextOpen } from './sections'

const AREAS: AreaConfig[] = [
  { id: 'mind', label: 'Mind', color: 'mind', sort_order: 0 },
  { id: 'body', label: 'Body', color: 'body', sort_order: 1 },
  { id: 'exercise', label: 'Exercise', color: 'exercise', sort_order: 2 },
]

const step = (key: string, habit_id: number | null, label = '', time = '') => ({ key, habit_id, label, time, minutes: null, note: '' })

function routine(id: number, name: string, slot: DayRoutine['slot'], steps: DayRoutine['steps'], sort_order = id): DayRoutine {
  return { id, name, slot, steps, sort_order, retired_on: null }
}

const habits = [
  habit({ id: 1, name: 'Wake up', area: 'body', group: 'Sleep', from: '2026-09-01' }),
  habit({ id: 2, name: 'Creatine', area: 'body', group: 'Supplements', from: '2026-09-01' }),
  habit({ id: 3, name: 'Meditation', area: 'mind', from: '2026-09-01' }),
  habit({ id: 4, name: 'Vitamin D', area: 'body', group: 'Supplements', from: '2026-09-01', day: { kind: 'weekdays', weekdays: [0] } }),
  habit({ id: 5, name: 'Writing', area: 'mind', from: '2026-09-01' }),
  habit({ id: 6, name: 'Gym', area: 'exercise', from: '2026-09-01', sources: ['workout'] }),
  habit({ id: 7, name: 'Hair oiling', area: 'body', group: 'Grooming', from: '2026-09-01', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } }),
  habit({ id: 8, name: 'Fish oil', area: 'body', group: 'Supplements', from: '2026-09-01' }),
]

const routines = [
  routine(1, 'Morning routine', 'morning', [step('a', 1, '', '04:00'), step('b', 2), step('c', 4), step('d', 5), step('e', null, 'Leave for work')]),
  routine(2, 'Evening routine', 'evening', [step('f', null, 'Return home', '19:00'), step('g', 5), step('h', 3)]),
]

describe('the grouped day', () => {
  const tuesday = '2026-10-06'

  it('lists routines first, then what is left by pillar and group, then flexible habits apart', () => {
    const view = buildDayView(habits, routines, AREAS, tuesday, indexOf({}))
    expect(view.sections.map((s) => s.title)).toEqual(['Morning routine', 'Evening routine', 'Body · Supplements', 'Exercise'])
    expect(view.flexible.map((f) => f.habit.name)).toEqual(['Hair oiling'])
  })

  it('shows a habit once, under the first routine that names it', () => {
    const view = buildDayView(habits, routines, AREAS, tuesday, indexOf({}))
    const names = (title: string) =>
      view.sections.find((s) => s.title === title)!.rows.map((r) => (r.type === 'habit' ? r.item.version.name : `(${r.label})`))
    expect(names('Morning routine')).toEqual(['Wake up', 'Creatine', 'Writing', '(Leave for work)'])
    expect(names('Evening routine')).toEqual(['(Return home)', 'Meditation'])
  })

  it('leaves out a routine step whose habit is not due that day, and shows it when it is', () => {
    const monday = buildDayView(habits, routines, AREAS, '2026-10-05', indexOf({}))
    const morning = monday.sections[0].rows.filter((r) => r.type === 'habit').map((r) => (r.type === 'habit' ? r.item.version.name : ''))
    expect(morning).toContain('Vitamin D')
    const tue = buildDayView(habits, routines, AREAS, tuesday, indexOf({}))
    expect(JSON.stringify(tue.sections)).not.toContain('Vitamin D')
  })

  it('counts each section and knows what can still be ticked', () => {
    const index = indexOf({ entries: ticks(1, [tuesday]) })
    const view = buildDayView(habits, routines, AREAS, tuesday, index)
    const morning = view.sections[0]
    expect(morning.tally).toEqual({ done: 1, due: 3 })
    expect(morning.openTickable).toEqual([2, 5])
    // Gym is open but cannot be ticked by hand.
    expect(view.sections.find((s) => s.title === 'Exercise')!.openTickable).toEqual([])
  })

  it('carries the part of the day, and no clock time', () => {
    const view = buildDayView(habits, routines, AREAS, tuesday, indexOf({}))
    expect(view.sections[0].part).toBe('morning')
    expect(view.sections[1].part).toBe('evening')
    expect(view.sections[2].part).toBe('day')
    // Clock times stay on the routine but are not shown on Today.
    expect(view.sections[0].rows[0]).toMatchObject({ type: 'habit' })
    expect(view.sections[0].rows[0].lead).toBeUndefined()
  })

  it('drops a routine with nothing due in it and ignores retired routines', () => {
    const onlyNotes = [routine(3, 'Empty', 'custom', [step('x', null, 'Stretch')]), { ...routines[0], retired_on: '2026-10-01' }]
    const view = buildDayView(habits, onlyNotes, AREAS, tuesday, indexOf({}))
    expect(view.sections.map((s) => s.title)).toEqual(['Mind', 'Body · Sleep', 'Body · Supplements', 'Exercise'])
  })

  it('offers the next open items in the order of the day', () => {
    const index = indexOf({ entries: ticks(1, [tuesday]) })
    const view = buildDayView(habits, routines, AREAS, tuesday, index)
    expect(nextOpen(view, 3).map((i) => i.version.name)).toEqual(['Creatine', 'Writing', 'Meditation'])
  })
})
