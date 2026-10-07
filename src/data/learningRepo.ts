import { db, type AppDb } from './db'
import type { WriteContext } from './habitRepo'
import { saveSettings } from './settingsRepo'
import type {
  DateStr, LearningLane, LearningPillar, LearningResource, ProgressUnit, ResourceStatus, ResourceType,
} from './types'
import { defaultUnit, isSafeUrl, queueOf } from '../engine/learning'
import { assertEditable } from '../engine/lock'

/**
 * Everything that writes the learning system.
 *
 * A resource is persistent; a session is history. Logging a session is one transaction that adds
 * the session and moves the resource on — its progress, its status, and, when the session
 * finishes it, its place in the queue (it leaves, so the next one becomes today's learning).
 * No tick is written anywhere: the Learning and Reading habits complete themselves because a
 * session exists on that day.
 */
export interface ResourceInput {
  title: string
  type: ResourceType
  pillar_id: number | null
  topic: string
  author: string
  source: string
  url: string
  description: string
  estimated_minutes: number | null
  priority: 1 | 2 | 3
  progress_unit: ProgressUnit
  progress_total: number | null
  position_note: string
  notes: string
}

export function blankResource(type: ResourceType = 'video'): ResourceInput {
  return {
    title: '', type, pillar_id: null, topic: '', author: '', source: '', url: '', description: '',
    estimated_minutes: null, priority: 2, progress_unit: defaultUnit(type), progress_total: null, position_note: '', notes: '',
  }
}

function clean(input: ResourceInput): ResourceInput {
  const title = input.title.trim()
  if (!title) throw new Error('A resource needs a title.')
  const url = input.url.trim()
  if (url && !isSafeUrl(url)) throw new Error('The link must start with http:// or https://')
  const positive = (value: number | null) => (value !== null && Number.isFinite(value) && value > 0 ? Math.round(value) : null)
  return {
    ...input,
    title,
    url,
    topic: input.topic.trim(),
    author: input.author.trim(),
    source: input.source.trim(),
    description: input.description.trim(),
    position_note: input.position_note.trim(),
    notes: input.notes.trim(),
    estimated_minutes: positive(input.estimated_minutes),
    progress_total: input.progress_unit === 'percent' ? 100 : input.progress_unit === 'none' ? null : positive(input.progress_total),
    priority: input.priority === 1 || input.priority === 3 ? input.priority : 2,
  }
}

/** A new resource always lands in the inbox. It reaches today's learning only when the owner
 *  moves it into the queue. */
export async function createResource(input: ResourceInput, today: DateStr, database: AppDb = db): Promise<number> {
  return (await database.learning_resources.add({
    ...clean(input),
    status: 'inbox',
    queue_position: null,
    progress_current: 0,
    created_on: today,
    started_on: null,
    completed_on: null,
    archived_on: null,
  })) as number
}

export async function updateResource(id: number, input: ResourceInput, database: AppDb = db): Promise<void> {
  await database.learning_resources.update(id, clean(input))
}

export async function setResourceNotes(id: number, notes: string, database: AppDb = db): Promise<void> {
  await database.learning_resources.update(id, { notes: notes.trim() })
}

async function nextQueuePosition(database: AppDb): Promise<number> {
  const queue = queueOf(await database.learning_resources.toArray())
  return queue.reduce((max, resource) => Math.max(max, resource.queue_position ?? 0), 0) + 1
}

/** Moves a resource to the inbox or the shortlist, taking it out of the queue if it was in it. */
export async function moveResource(id: number, status: 'inbox' | 'shortlist', database: AppDb = db): Promise<void> {
  await database.learning_resources.update(id, { status, queue_position: null, archived_on: null })
}

/** Puts a resource at the end of the queue. Already-queued resources keep their place. */
export async function addToQueue(id: number, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.learning_resources, async () => {
    const resource = await database.learning_resources.get(id)
    if (!resource) throw new Error('That resource no longer exists.')
    if (resource.queue_position !== null && (resource.status === 'queued' || resource.status === 'in_progress')) return
    await database.learning_resources.update(id, {
      status: resource.started_on && resource.status !== 'completed' ? 'in_progress' : 'queued',
      queue_position: await nextQueuePosition(database),
      archived_on: null,
      completed_on: resource.status === 'completed' ? null : resource.completed_on,
    })
  })
}

/** Rewrites the queue order. Ids not in the queue are ignored. */
export async function reorderQueue(orderedIds: number[], database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.learning_resources, async () => {
    const inQueue = new Set(queueOf(await database.learning_resources.toArray()).map((resource) => resource.id!))
    let position = 1
    for (const id of orderedIds) {
      if (!inQueue.has(id)) continue
      await database.learning_resources.update(id, { queue_position: position++ })
    }
  })
}

/** Marks a resource as started. It stays where it is in the queue. */
export async function startResource(id: number, today: DateStr, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.learning_resources, async () => {
    const resource = await database.learning_resources.get(id)
    if (!resource || resource.status === 'completed' || resource.status === 'archived') return
    await database.learning_resources.update(id, { status: 'in_progress', started_on: resource.started_on ?? today })
  })
}

export interface SessionInput {
  resource_id: number
  date: DateStr
  lane: LearningLane
  minutes: number | null
  /** Where the resource now stands, in its own unit. null leaves progress unchanged. */
  progress_after: number | null
  notes: string
  /** This session finished the resource. */
  finished: boolean
}

/**
 * Logs a learning or reading session and moves the resource on, in one transaction.
 * Finishing a resource takes it out of the queue, which is what makes the next one "next".
 */
export async function logSession(input: SessionInput, ctx: WriteContext, now: number, database: AppDb = db): Promise<number> {
  assertEditable(input.date, ctx.today, ctx.windowDays)
  return database.transaction('rw', database.learning_resources, database.learning_sessions, async () => {
    const resource = await database.learning_resources.get(input.resource_id)
    if (!resource) throw new Error('That resource no longer exists.')
    const byDay = (a: { date: DateStr; created_at: number }, b: { date: DateStr; created_at: number }) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at - b.created_at
    const earlier = (await database.learning_sessions.where('resource_id').equals(input.resource_id).toArray()).sort(byDay)
    // Where the resource stood on the day this session is for, not where it stands now.
    const previous = earlier.filter((session) => session.date <= input.date).pop()
    const before = previous ? previous.progress_after : earlier.length ? 0 : resource.progress_current
    let after = input.progress_after ?? before
    if (input.finished && resource.progress_total) after = resource.progress_total
    if (resource.progress_total) after = Math.min(after, resource.progress_total)
    after = Math.max(0, after)

    const sessionId = (await database.learning_sessions.add({
      resource_id: input.resource_id,
      date: input.date,
      lane: input.lane,
      minutes: input.minutes !== null && input.minutes > 0 ? Math.round(input.minutes) : null,
      progress_before: before,
      progress_after: after,
      completed_resource: input.finished,
      notes: input.notes.trim(),
      created_at: now,
    })) as number

    // The resource stands where its latest session by date left it; a session entered for an
    // earlier day must not move it back.
    const later = earlier.filter((session) => session.date > input.date).pop()
    const patch: Partial<LearningResource> = {
      progress_current: input.finished || !later ? after : later.progress_after,
      started_on: resource.started_on && resource.started_on < input.date ? resource.started_on : input.date,
    }
    if (input.finished) {
      patch.status = 'completed'
      patch.completed_on = input.date
      patch.queue_position = null
    } else if (resource.status !== 'completed' && resource.status !== 'archived') {
      patch.status = 'in_progress'
    }
    await database.learning_resources.update(input.resource_id, patch)
    return sessionId
  })
}

/**
 * Removes a session inside the correction window and puts the resource back where the remaining
 * sessions leave it — including un-completing it if this was the session that finished it.
 */
export async function deleteLearningSession(sessionId: number, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.learning_resources, database.learning_sessions, async () => {
    const session = await database.learning_sessions.get(sessionId)
    if (!session) return
    assertEditable(session.date, ctx.today, ctx.windowDays)
    await database.learning_sessions.delete(sessionId)
    const resource = await database.learning_resources.get(session.resource_id)
    if (!resource) return
    const remaining = (await database.learning_sessions.where('resource_id').equals(session.resource_id).toArray()).sort(
      (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at - b.created_at),
    )
    const last = remaining[remaining.length - 1]
    const patch: Partial<LearningResource> = { progress_current: last ? last.progress_after : 0 }
    if (!remaining.length) patch.started_on = null
    if (session.completed_resource && resource.status === 'completed') {
      patch.completed_on = null
      patch.status = remaining.length ? 'in_progress' : 'queued'
      // Back into the queue it left when it was finished — at the end, since its old place is gone.
      if (session.lane === 'learning') patch.queue_position = await nextQueuePosition(database)
      else if (!remaining.length) patch.status = 'shortlist'
    } else if (!remaining.length && resource.status === 'in_progress') {
      patch.status = resource.queue_position !== null ? 'queued' : 'shortlist'
    }
    await database.learning_resources.update(resource.id!, patch)
  })
}

export async function archiveResource(id: number, today: DateStr, database: AppDb = db): Promise<void> {
  await database.learning_resources.update(id, { status: 'archived', archived_on: today, queue_position: null })
}

/** Brings an archived resource back to the shortlist. */
export async function restoreResource(id: number, database: AppDb = db): Promise<void> {
  await database.learning_resources.update(id, { status: 'shortlist', archived_on: null })
}

/** Only a resource added today with no sessions can be deleted; anything else is archived. */
export async function deleteResourceCreatedToday(id: number, today: DateStr, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.learning_resources, database.learning_sessions, async () => {
    const resource = await database.learning_resources.get(id)
    if (!resource) return
    const sessions = await database.learning_sessions.where('resource_id').equals(id).count()
    if (resource.created_on !== today || sessions > 0) throw new Error('Only a resource added today with no sessions can be deleted. Archive it instead.')
    await database.learning_resources.delete(id)
  })
}

/** Sets or clears the one book being read. */
export async function setActiveBook(id: number | null, database: AppDb = db): Promise<void> {
  await saveSettings({ active_book_id: id }, database)
}

// ─── Pillars ─────────────────────────────────────────────────────────────────────────────────

export async function addPillar(name: string, description: string, color: string, database: AppDb = db): Promise<number> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A pillar needs a name.')
  return database.transaction('rw', database.learning_pillars, async () => {
    const all = await database.learning_pillars.toArray()
    const sortOrder = all.reduce((max, pillar) => Math.max(max, pillar.sort_order), -1) + 1
    return (await database.learning_pillars.add({ name: trimmed, description: description.trim(), color, sort_order: sortOrder, retired_on: null })) as number
  })
}

export async function updatePillar(id: number, patch: Partial<Pick<LearningPillar, 'name' | 'description' | 'color'>>, database: AppDb = db): Promise<void> {
  const next = { ...patch }
  if (next.name !== undefined) {
    next.name = next.name.trim()
    if (!next.name) throw new Error('A pillar needs a name.')
  }
  if (next.description !== undefined) next.description = next.description.trim()
  await database.learning_pillars.update(id, next)
}

export async function reorderPillars(orderedIds: number[], database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.learning_pillars, async () => {
    await Promise.all(orderedIds.map((id, i) => database.learning_pillars.update(id, { sort_order: i })))
  })
}

export async function setPillarRetired(id: number, retiredOn: DateStr | null, database: AppDb = db): Promise<void> {
  await database.learning_pillars.update(id, { retired_on: retiredOn })
}

/** Statuses a resource can be moved to by hand from the library. */
export const MOVABLE: ResourceStatus[] = ['inbox', 'shortlist', 'queued']
