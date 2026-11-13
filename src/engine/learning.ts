import type {
  DateStr, LearningPillar, LearningResource, LearningSession, ProgressUnit, ResourceStatus, ResourceType,
} from '../data/types'
import { daysBetween } from './dates'

/**
 * The learning queue, as pure functions.
 *
 * The queue exists so that nothing has to be decided at four in the morning: it is an ordered
 * list, its head is today's learning, and the one after it is next. "Next" is never stored — it
 * is simply read off the order, so two resources can never both claim it.
 */

export const RESOURCE_TYPES: ResourceType[] = ['book', 'video', 'article', 'pdf', 'course', 'podcast', 'note', 'exercise', 'project']

export const TYPE_LABEL: Record<ResourceType, string> = {
  book: 'Book',
  video: 'Video',
  article: 'Article',
  pdf: 'PDF',
  course: 'Course',
  podcast: 'Podcast',
  note: 'Notes',
  exercise: 'Practical exercise',
  project: 'Project',
}

export const STATUS_LABEL: Record<ResourceStatus, string> = {
  inbox: 'To learn',
  shortlist: 'To learn',
  queued: 'To learn',
  in_progress: 'In progress',
  completed: 'Completed',
  archived: 'Archived',
}

export const UNIT_LABEL: Record<ProgressUnit, string> = {
  pages: 'Pages',
  minutes: 'Minutes',
  lessons: 'Lessons',
  chapters: 'Chapters',
  percent: 'Percent',
  none: 'Not counted',
}

const UNIT_NOUN: Record<ProgressUnit, string> = {
  pages: 'Page',
  minutes: 'Minute',
  lessons: 'Lesson',
  chapters: 'Chapter',
  percent: '',
  none: '',
}

/** The unit a new resource of this type most naturally counts in. */
export function defaultUnit(type: ResourceType): ProgressUnit {
  if (type === 'book' || type === 'pdf') return 'pages'
  if (type === 'video' || type === 'podcast') return 'minutes'
  if (type === 'course') return 'lessons'
  return 'none'
}

/** Everything in the queue, in order. */
export function queueOf(resources: readonly LearningResource[]): LearningResource[] {
  return resources
    .filter((resource) => resource.queue_position !== null && (resource.status === 'queued' || resource.status === 'in_progress'))
    .sort((a, b) => a.queue_position! - b.queue_position! || (a.id ?? 0) - (b.id ?? 0))
}

/** Today's learning (the head of the queue) and what follows it. */
export function currentAndNext(resources: readonly LearningResource[]): {
  current: LearningResource | null
  next: LearningResource | null
  size: number
} {
  const queue = queueOf(resources)
  return { current: queue[0] ?? null, next: queue[1] ?? null, size: queue.length }
}

/** How far through a resource is, 0–1, or null when that cannot be known. */
export function progressFraction(resource: Pick<LearningResource, 'progress_unit' | 'progress_current' | 'progress_total' | 'status'>): number | null {
  if (resource.status === 'completed') return 1
  if (resource.progress_unit === 'percent') return Math.min(1, Math.max(0, resource.progress_current / 100))
  if (resource.progress_unit === 'none' || !resource.progress_total || resource.progress_total <= 0) return null
  return Math.min(1, Math.max(0, resource.progress_current / resource.progress_total))
}

/** "Page 62 of 240", "45%", "Lesson 3 of 12", "24 of 38 minutes", or '' when nothing is counted. */
export function progressLabel(resource: Pick<LearningResource, 'progress_unit' | 'progress_current' | 'progress_total'>): string {
  const { progress_unit: unit, progress_current: current, progress_total: total } = resource
  if (unit === 'none') return ''
  if (unit === 'percent') return `${Math.round(current)}%`
  if (unit === 'minutes') return total ? `${current} of ${total} minutes` : `${current} minutes`
  return total ? `${UNIT_NOUN[unit]} ${current} of ${total}` : `${UNIT_NOUN[unit]} ${current}`
}

/** Days since a resource was started, or null when it has not been. */
export function daysInProgress(resource: Pick<LearningResource, 'started_on' | 'status'>, today: DateStr): number | null {
  if (!resource.started_on || resource.status !== 'in_progress') return null
  return Math.max(0, daysBetween(resource.started_on, today))
}

/** Only web links are ever opened. Anything else — javascript:, data:, file: — is refused. */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export interface LearningStats {
  sessions: number
  minutes: number
  /** Resources finished in the period. */
  completed: number
  by_pillar: { pillar_id: number | null; name: string; sessions: number; minutes: number }[]
  by_type: { type: ResourceType; sessions: number }[]
}

/** What was studied in [from, to]. */
export function learningStats(
  sessions: readonly LearningSession[],
  resources: readonly LearningResource[],
  pillars: readonly LearningPillar[],
  from: DateStr,
  to: DateStr,
): LearningStats {
  const resourceById = new Map(resources.map((resource) => [resource.id!, resource]))
  const pillarName = new Map(pillars.map((pillar) => [pillar.id!, pillar.name]))
  const byPillar = new Map<number | null, { sessions: number; minutes: number }>()
  const byType = new Map<ResourceType, number>()
  let count = 0
  let minutes = 0
  let completed = 0
  for (const session of sessions) {
    if (session.date < from || session.date > to) continue
    count += 1
    minutes += session.minutes ?? 0
    if (session.completed_resource) completed += 1
    const resource = resourceById.get(session.resource_id)
    const pillarId = resource?.pillar_id ?? null
    const bucket = byPillar.get(pillarId) ?? { sessions: 0, minutes: 0 }
    bucket.sessions += 1
    bucket.minutes += session.minutes ?? 0
    byPillar.set(pillarId, bucket)
    if (resource) byType.set(resource.type, (byType.get(resource.type) ?? 0) + 1)
  }
  return {
    sessions: count,
    minutes,
    completed,
    by_pillar: [...byPillar.entries()]
      .map(([pillar_id, bucket]) => ({ pillar_id, name: pillar_id === null ? 'No pillar' : (pillarName.get(pillar_id) ?? 'No pillar'), ...bucket }))
      .sort((a, b) => b.sessions - a.sessions),
    by_type: [...byType.entries()].map(([type, total]) => ({ type, sessions: total })).sort((a, b) => b.sessions - a.sessions),
  }
}

/**
 * When a resource would be finished at the pace of its sessions so far, or null when there is
 * too little to go on: it needs a total, some progress, and two sessions on different days.
 */
export function finishEstimate(
  resource: Pick<LearningResource, 'progress_total' | 'progress_current' | 'status'>,
  sessions: readonly Pick<LearningSession, 'date' | 'progress_before'>[],
  today: DateStr,
): DateStr | null {
  const total = resource.progress_total
  if (!total || resource.progress_current <= 0 || resource.progress_current >= total) return null
  if (resource.status === 'completed' || resource.status === 'archived' || sessions.length < 2) return null
  const first = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.progress_before - b.progress_before))[0]
  const days = daysBetween(first.date, today)
  const gained = resource.progress_current - first.progress_before
  if (days < 1 || gained <= 0) return null
  const left = Math.ceil((total - resource.progress_current) / (gained / days))
  if (left > 3650) return null
  const date = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + left)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
