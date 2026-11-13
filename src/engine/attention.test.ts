import { describe, expect, it } from 'vitest'
import { habit, indexOf, ticks, version } from '../testing/builders'
import type { Exercise, SetLog } from '../data/types'
import { attentionItems, type AttentionInput } from './attention'

const hair = () => habit({ id: 12, name: 'Hair oiling', from: '2026-09-28', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } })

function input(overrides: Partial<AttentionInput>): AttentionInput {
  return {
    habits: [],
    index: indexOf({}),
    today: '2026-10-07',
    hour: 9,
    weekStart: 0,
    eveningHour: 19,
    reviewDay: 6,
    workout: null,
    learning: null,
    lastWeekReviewed: true,
    ...overrides,
  }
}

describe('targets running out of days', () => {
  const index = indexOf({ entries: ticks(12, ['2026-10-05']) })

  it('says nothing on Wednesday with 1 of 2 done', () => {
    expect(attentionItems(input({ habits: [hair()], index, today: '2026-10-07' }))).toEqual([])
  })

  it('points it out on Saturday in plain words', () => {
    const [item] = attentionItems(input({ habits: [hair()], index, today: '2026-10-10' }))
    expect(item).toMatchObject({
      level: 'attention',
      title: 'Hair oiling',
      detail: '1 of 2 complete · 1 session still required · 1 day left',
    })
  })

  it('is at risk on the last day', () => {
    const [item] = attentionItems(input({ habits: [hair()], index, today: '2026-10-11', reviewDay: 5 }))
    expect(item).toMatchObject({ level: 'at_risk', detail: '1 of 2 complete · 1 session still required · last day' })
  })

  it('still shows a flexible target that can no longer be fully met', () => {
    const [item] = attentionItems(input({ habits: [hair()], today: '2026-10-11', reviewDay: 5 }))
    expect(item.level).toBe('at_risk')
    expect(item.detail).toBe('0 of 2 complete · the target can no longer be met this week · 1 session still possible')
  })

  it('does not list a daily habit just because one day of its weekly target was missed', () => {
    const gym = habit({ id: 8, name: 'Gym', from: '2026-09-28', target: { per: 'week', count: 7 }, sources: ['workout'] })
    expect(attentionItems(input({ habits: [gym], today: '2026-10-07', index: indexOf({ workouts: ['2026-10-06'] }) }))).toEqual([])
  })

  it('drops the item the moment the target is met', () => {
    const met = indexOf({ entries: ticks(12, ['2026-10-05', '2026-10-10']) })
    expect(attentionItems(input({ habits: [hair()], index: met, today: '2026-10-10' }))).toEqual([])
  })

  it('ignores retired habits', () => {
    const retired = habit({ id: 12, from: '2026-09-28', day: { kind: 'flexible' }, target: { per: 'week', count: 2 } }, [
      version('2026-10-06', { day: { kind: 'flexible' }, target: { per: 'week', count: 2 } }, { active: false }),
    ])
    expect(attentionItems(input({ habits: [retired], today: '2026-10-11', reviewDay: 5 }))).toEqual([])
  })
})

describe('last week', () => {
  const lastWeekOnce = indexOf({ entries: ticks(12, ['2026-09-29']) })

  it('reports a missed target on Monday and Tuesday until the review is written', () => {
    const monday = attentionItems(input({ habits: [hair()], index: lastWeekOnce, today: '2026-10-05', lastWeekReviewed: false }))
    expect(monday[0]).toMatchObject({
      level: 'missed',
      title: 'Last week',
      detail: 'Hair oiling: 1 of 2. Target missed, 1 short.',
      to: '/review/2026-09-28',
    })
    expect(attentionItems(input({ habits: [hair()], index: lastWeekOnce, today: '2026-10-05', lastWeekReviewed: true }))).toEqual([])
    expect(attentionItems(input({ habits: [hair()], index: lastWeekOnce, today: '2026-10-08', lastWeekReviewed: false }))).toEqual([])
  })

  it('names several missed targets in one line', () => {
    const reading = habit({ id: 6, name: 'Reading', from: '2026-09-21', target: { per: 'week', count: 7 } })
    const [item] = attentionItems(
      input({ habits: [hair(), reading], index: lastWeekOnce, today: '2026-10-05', lastWeekReviewed: false }),
    )
    expect(item.detail).toBe('2 targets missed: Hair oiling, Reading.')
  })
})

describe('late in the day', () => {
  const habits = [
    habit({ id: 1, name: 'Meditation', from: '2026-09-01' }),
    habit({ id: 2, name: 'Reading', from: '2026-09-01' }),
    habit({ id: 3, name: 'Dinner', from: '2026-09-01' }),
    habit({ id: 4, name: 'Journal', from: '2026-09-01' }),
    habit({ id: 8, name: 'Gym', from: '2026-09-01', sources: ['workout'] }),
  ]

  it('does not list unfinished habits in the morning', () => {
    expect(attentionItems(input({ habits, hour: 6 }))).toEqual([])
  })

  it('lists what is still open in the evening, and the workout separately', () => {
    const items = attentionItems(
      input({ habits, hour: 20, index: indexOf({ entries: ticks(1, ['2026-10-07']) }), workout: { scheduled: 'Cardio', doneToday: false } }),
    )
    expect(items.map((i) => i.id)).toEqual(['workout', 'pending-today'])
    expect(items[0]).toMatchObject({ title: 'Cardio', detail: 'Scheduled for today. No session logged yet.', to: '/train' })
    expect(items[1].detail).toBe('3 items: Reading, Dinner, Journal.')
  })

  it('abbreviates a long list and stops mentioning training once a session is logged', () => {
    const many = [...habits, habit({ id: 5, name: 'Stretch', from: '2026-09-01' })]
    const items = attentionItems(
      input({ habits: many, hour: 21, index: indexOf({ workouts: ['2026-10-07'] }), workout: { scheduled: 'Cardio', doneToday: true } }),
    )
    expect(items.map((i) => i.id)).toEqual(['pending-today'])
    expect(items[0].detail).toBe('5 items: Meditation, Reading, Dinner and 2 more.')
  })

  it('mentions training without a programme when the gym habit is still open', () => {
    const items = attentionItems(input({ habits: [habits[4]], hour: 20 }))
    expect(items).toEqual([{ id: 'workout', level: 'attention', title: 'Training', detail: 'No session logged today.', to: '/train' }])
  })
})

describe('learning and review', () => {
  it('flags a learning item only once it has stalled past the configured days', () => {
    const fresh = attentionItems(input({ learning: { title: 'AI Agents', daysInProgress: 5, staleDays: 14 } }))
    const stale = attentionItems(input({ learning: { title: 'AI Agents', daysInProgress: 16, staleDays: 14 } }))
    const off = attentionItems(input({ learning: { title: 'AI Agents', daysInProgress: 90, staleDays: 0 } }))
    expect(fresh).toEqual([])
    expect(off).toEqual([])
    expect(stale[0]).toMatchObject({ level: 'normal', title: 'AI Agents', detail: 'In progress for 16 days.' })
  })

  it('puts the weekly review forward on its day only', () => {
    expect(attentionItems(input({ today: '2026-10-11' })).map((i) => i.id)).toEqual(['review'])
    expect(attentionItems(input({ today: '2026-10-10' }))).toEqual([])
  })

  it('orders by how pressing each item is', () => {
    const items = attentionItems(
      input({
        habits: [hair(), habit({ id: 1, name: 'Meditation', from: '2026-09-01' })],
        today: '2026-10-11',
        hour: 20,
        learning: { title: 'AI Agents', daysInProgress: 30, staleDays: 14 },
      }),
    )
    expect(items.map((i) => i.level)).toEqual(['at_risk', 'attention', 'normal', 'normal'])
  })
})

describe('muscles that have gone untrained', () => {
  const squat = { id: 1, name: 'Squat', primary_muscle: 'quads', kind: 'weight_reps' } as Exercise
  const curl = { id: 2, name: 'Leg curl', primary_muscle: 'hamstrings', kind: 'weight_reps' } as Exercise
  const set = (exercise_id: number, date: string) => ({ exercise_id, date, weight_kg: 40, reps: 10, rir: null, done: true, kind: 'work' }) as SetLog
  const byId = new Map([[1, squat], [2, curl]])

  it('names a muscle worked before but not in fourteen days, and leaves out one never trained', () => {
    const items = attentionItems(input({ today: '2026-10-07', sets: [set(1, '2026-10-05'), set(2, '2026-09-20')], exercisesById: byId }))
    expect(items).toEqual([{ id: 'untrained', level: 'normal', title: 'Not trained in 14 days', detail: 'Hamstrings.', to: '/train' }])
  })

  it('says nothing when everything was trained recently', () => {
    expect(attentionItems(input({ today: '2026-10-07', sets: [set(1, '2026-10-05'), set(2, '2026-09-30')], exercisesById: byId }))).toEqual([])
  })
})

describe('the backup reminder', () => {
  it('appears after thirty days without an export, once the record is a month old', () => {
    expect(attentionItems(input({ today: '2026-10-07', lastExport: null, firstDay: '2026-08-01' })).map((item) => item.id)).toEqual(['export'])
    expect(attentionItems(input({ today: '2026-10-07', lastExport: '2026-09-30', firstDay: '2026-08-01' }))).toEqual([])
    expect(attentionItems(input({ today: '2026-10-07', lastExport: null, firstDay: '2026-09-20' }))).toEqual([])
  })
})
