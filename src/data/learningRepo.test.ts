import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import {
  addToQueue, archiveResource, blankResource, createResource, deleteLearningSession, deleteResourceCreatedToday,
  logSession, moveResource, reorderQueue, restoreResource, startResource, updateResource,
} from './learningRepo'
import { buildCompletionIndex } from '../engine/completion'
import { currentAndNext, isSafeUrl, learningStats, progressFraction, progressLabel, queueOf } from '../engine/learning'
import { LockedError } from '../engine/lock'
import { periodOf } from '../engine/periods'
import { dayScore } from '../engine/score'
import { targetProgress } from '../engine/targets'
import { habit } from '../testing/builders'

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

const TODAY = '2026-10-07'
const ctx = { today: TODAY, windowDays: 7 }

function fresh(): AppDb {
  const db = createDb(`learning-repo-test-${++counter}`)
  open.push(db)
  return db
}

async function queueOfFour(db: AppDb) {
  const titles: [string, 'video' | 'book' | 'pdf'][] = [
    ['AI Agents - Lesson 3', 'video'],
    ['RAG Fundamentals', 'video'],
    ['Meditations - Book IV', 'book'],
    ['RCC Basics', 'pdf'],
  ]
  const ids: number[] = []
  for (const [title, type] of titles) {
    const id = await createResource({ ...blankResource(type), title, estimated_minutes: 38 }, '2026-10-01', db)
    await addToQueue(id, db)
    ids.push(id)
  }
  return ids
}

async function indexOf(db: AppDb) {
  return buildCompletionIndex({ entries: [], sessions: [], learningSessions: await db.learning_sessions.toArray(), journalDates: [] })
}

describe('the learning-queue acceptance scenario', () => {
  it('completing today’s item advances the queue and updates everything that depends on it', async () => {
    const db = fresh()
    const [agents, rag] = await queueOfFour(db)
    const learning = habit({ id: 7, name: 'Learning', from: '2026-09-01', sources: ['manual', 'learning'], target: { per: 'week', count: 7 } })
    const week = periodOf('week', TODAY)

    let state = currentAndNext(await db.learning_resources.toArray())
    expect(state.current!.title).toBe('AI Agents - Lesson 3')
    expect(state.next!.title).toBe('RAG Fundamentals')
    expect(state.size).toBe(4)
    expect(dayScore([learning], TODAY, await indexOf(db)).done).toBe(0)
    const before = targetProgress(learning, week, TODAY, await indexOf(db))!.done

    const sessionId = await logSession(
      { resource_id: agents, date: TODAY, lane: 'learning', minutes: 38, progress_after: null, notes: 'Agent loops', finished: true },
      ctx,
      1_000,
      db,
    )

    // The resource is completed…
    expect(await db.learning_resources.get(agents)).toMatchObject({ status: 'completed', completed_on: TODAY, queue_position: null, started_on: TODAY })
    // …a session is in the history…
    expect(await db.learning_sessions.get(sessionId)).toMatchObject({ resource_id: agents, date: TODAY, lane: 'learning', minutes: 38, completed_resource: true })
    // …the queue has advanced, and RAG Fundamentals is next up…
    state = currentAndNext(await db.learning_resources.toArray())
    expect(state.current!.id).toBe(rag)
    expect(state.next!.title).toBe('Meditations - Book IV')
    expect(state.size).toBe(3)
    // …the statistics have moved…
    const stats = learningStats(await db.learning_sessions.toArray(), await db.learning_resources.toArray(), [], week.start, week.end)
    expect(stats).toMatchObject({ sessions: 1, minutes: 38, completed: 1 })
    // …today's Learning is done, and the week's count went up.
    const index = await indexOf(db)
    expect(dayScore([learning], TODAY, index)).toMatchObject({ done: 1, due: 1 })
    expect(targetProgress(learning, week, TODAY, index)!.done).toBe(before + 1)
    // And no tick was written to do any of it.
    expect(await db.entries.count()).toBe(0)
  })
})

describe('progress', () => {
  it('keeps partial progress across sessions', async () => {
    const db = fresh()
    const id = await createResource({ ...blankResource('book'), title: 'Meditations', progress_total: 240 }, '2026-10-01', db)
    await logSession({ resource_id: id, date: '2026-10-05', lane: 'reading', minutes: 20, progress_after: 48, notes: '', finished: false }, ctx, 1, db)
    await logSession({ resource_id: id, date: TODAY, lane: 'reading', minutes: 25, progress_after: 62, notes: '', finished: false }, ctx, 2, db)
    const resource = (await db.learning_resources.get(id))!
    expect(resource).toMatchObject({ status: 'in_progress', progress_current: 62, started_on: '2026-10-05' })
    expect(progressLabel(resource)).toBe('Page 62 of 240')
    expect(progressFraction(resource)).toBeCloseTo(62 / 240)
    const sessions = await db.learning_sessions.where('resource_id').equals(id).sortBy('date')
    expect(sessions.map((s) => [s.progress_before, s.progress_after])).toEqual([[0, 48], [48, 62]])
  })

  it('a reading session counts as reading, not as learning', async () => {
    const db = fresh()
    const id = await createResource({ ...blankResource('book'), title: 'Meditations' }, '2026-10-01', db)
    await logSession({ resource_id: id, date: TODAY, lane: 'reading', minutes: 20, progress_after: 10, notes: '', finished: false }, ctx, 1, db)
    const index = await indexOf(db)
    expect(index.reading.has(TODAY)).toBe(true)
    expect(index.learning.has(TODAY)).toBe(false)
    // Reading the active book does not put it into the learning queue.
    expect(queueOf(await db.learning_resources.toArray())).toEqual([])
  })

  it('finishing fills the progress to its total and never runs past it', async () => {
    const db = fresh()
    const id = await createResource({ ...blankResource('course'), title: 'Course', progress_total: 12 }, '2026-10-01', db)
    await logSession({ resource_id: id, date: TODAY, lane: 'learning', minutes: null, progress_after: 99, notes: '', finished: false }, ctx, 1, db)
    expect((await db.learning_resources.get(id))!.progress_current).toBe(12)
    await logSession({ resource_id: id, date: TODAY, lane: 'learning', minutes: null, progress_after: 3, notes: '', finished: true }, ctx, 2, db)
    expect(await db.learning_resources.get(id)).toMatchObject({ progress_current: 12, status: 'completed' })
  })

  it('deleting a session restores the earlier progress, and un-completes when it was the finishing one', async () => {
    const db = fresh()
    const [first] = await queueOfFour(db)
    const a = await logSession({ resource_id: first, date: '2026-10-06', lane: 'learning', minutes: 10, progress_after: 10, notes: '', finished: false }, ctx, 1, db)
    const b = await logSession({ resource_id: first, date: TODAY, lane: 'learning', minutes: 28, progress_after: 38, notes: '', finished: true }, ctx, 2, db)
    expect((await db.learning_resources.get(first))!.status).toBe('completed')
    await deleteLearningSession(b, ctx, db)
    let resource = (await db.learning_resources.get(first))!
    expect(resource).toMatchObject({ status: 'in_progress', progress_current: 10, completed_on: null })
    expect(queueOf(await db.learning_resources.toArray()).map((r) => r.id)).toContain(first)
    await deleteLearningSession(a, ctx, db)
    resource = (await db.learning_resources.get(first))!
    expect(resource).toMatchObject({ status: 'queued', progress_current: 0, started_on: null })
  })

  it('refuses a session on a locked day', async () => {
    const db = fresh()
    const [first] = await queueOfFour(db)
    await expect(
      logSession({ resource_id: first, date: '2026-09-20', lane: 'learning', minutes: 10, progress_after: null, notes: '', finished: false }, ctx, 1, db),
    ).rejects.toBeInstanceOf(LockedError)
    expect(await db.learning_sessions.count()).toBe(0)
  })
})

describe('the queue and the library', () => {
  it('a new resource lands in the inbox, never in today’s learning', async () => {
    const db = fresh()
    const id = await createResource({ ...blankResource(), title: 'Something interesting' }, TODAY, db)
    expect(await db.learning_resources.get(id)).toMatchObject({ status: 'inbox', queue_position: null })
    expect(currentAndNext(await db.learning_resources.toArray()).current).toBeNull()
  })

  it('reordering persists, and leaving the queue closes the gap', async () => {
    const db = fresh()
    const [a, b, c, d] = await queueOfFour(db)
    await reorderQueue([c, a, d, b], db)
    expect(queueOf(await db.learning_resources.toArray()).map((r) => r.id)).toEqual([c, a, d, b])
    await moveResource(a, 'shortlist', db)
    expect(queueOf(await db.learning_resources.toArray()).map((r) => r.id)).toEqual([c, d, b])
    await addToQueue(a, db)
    expect(queueOf(await db.learning_resources.toArray()).map((r) => r.id)).toEqual([c, d, b, a])
    await addToQueue(a, db) // already queued: keeps its place
    expect(queueOf(await db.learning_resources.toArray())).toHaveLength(4)
  })

  it('starting keeps the place in the queue', async () => {
    const db = fresh()
    const [a, b] = await queueOfFour(db)
    await startResource(b, TODAY, db)
    expect((await db.learning_resources.get(b))!).toMatchObject({ status: 'in_progress', started_on: TODAY })
    expect(currentAndNext(await db.learning_resources.toArray()).current!.id).toBe(a)
  })

  it('archives and restores without losing sessions', async () => {
    const db = fresh()
    const [a] = await queueOfFour(db)
    await logSession({ resource_id: a, date: TODAY, lane: 'learning', minutes: 10, progress_after: null, notes: '', finished: false }, ctx, 1, db)
    await archiveResource(a, TODAY, db)
    expect(await db.learning_resources.get(a)).toMatchObject({ status: 'archived', queue_position: null, archived_on: TODAY })
    await restoreResource(a, db)
    expect((await db.learning_resources.get(a))!.status).toBe('shortlist')
    expect(await db.learning_sessions.count()).toBe(1)
  })

  it('deletes only a resource added today that has no sessions', async () => {
    const db = fresh()
    const [old] = await queueOfFour(db)
    await expect(deleteResourceCreatedToday(old, TODAY, db)).rejects.toThrow()
    const fresh1 = await createResource({ ...blankResource(), title: 'Mistake' }, TODAY, db)
    await deleteResourceCreatedToday(fresh1, TODAY, db)
    expect(await db.learning_resources.get(fresh1)).toBeUndefined()
  })

  it('rejects an empty title and an unsafe link', async () => {
    const db = fresh()
    await expect(createResource({ ...blankResource(), title: '  ' }, TODAY, db)).rejects.toThrow()
    await expect(createResource({ ...blankResource(), title: 'X', url: 'javascript:alert(1)' }, TODAY, db)).rejects.toThrow()
    const id = await createResource({ ...blankResource(), title: 'X', url: ' https://example.com/a ' }, TODAY, db)
    expect((await db.learning_resources.get(id))!.url).toBe('https://example.com/a')
    await expect(updateResource(id, { ...blankResource(), title: 'X', url: 'data:text/html,hi' }, db)).rejects.toThrow()
    expect(isSafeUrl('http://example.com')).toBe(true)
    expect(isSafeUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeUrl('not a url')).toBe(false)
  })
})
