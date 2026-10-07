import type { DateStr, Exercise, Habit, JournalEntry, LearningResource, Meal, Quote, Session } from '../../data/types'

export interface SearchHit {
  key: string
  title: string
  /** One quiet line: where it was found, and when. */
  detail: string
  to: string
}

export interface SearchGroup {
  label: string
  hits: SearchHit[]
}

export interface SearchSources {
  habits: readonly Habit[]
  journal: readonly JournalEntry[]
  meals: readonly Meal[]
  resources: readonly LearningResource[]
  quotes: readonly Quote[]
  sessions: readonly Session[]
  exercises: readonly Exercise[]
}

const PER_GROUP = 25

/** A short stretch of `text` around the first match, so a long entry shows why it matched. */
export function excerpt(text: string, words: string, around = 44): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const at = flat.toLowerCase().indexOf(words)
  if (at < 0 || flat.length <= around * 2) return flat.slice(0, around * 2)
  const start = Math.max(0, at - around)
  const end = Math.min(flat.length, at + words.length + around)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

/**
 * Everything written into the app that contains the words, grouped by what it is. Plain
 * case-insensitive containment over rows already on the device: no index to keep in step, and
 * quick enough for years of one person's records. Newest first where a row has a date.
 */
export function search(query: string, sources: SearchSources, formatDate: (date: DateStr) => string): SearchGroup[] {
  const words = query.trim().toLowerCase()
  if (words.length < 2) return []
  const has = (...fields: (string | null | undefined)[]) => fields.some((field) => !!field && field.toLowerCase().includes(words))
  const newest = <T extends { date: DateStr }>(rows: readonly T[]) => [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const groups: SearchGroup[] = []
  const add = (label: string, hits: SearchHit[]) => {
    if (hits.length) groups.push({ label, hits: hits.slice(0, PER_GROUP) })
  }

  add(
    'Habits',
    sources.habits
      .filter((habit) => has(habit.name, habit.description, ...habit.versions.map((version) => version.name)))
      .map((habit) => ({ key: `habit-${habit.id}`, title: habit.name, detail: habit.retired_on ? 'Retired · history kept' : habit.description || (habit.kind === 'supplement' ? 'Supplement' : habit.kind === 'meal' ? 'Meal' : 'Habit'), to: `/progress/habit/${habit.id}` })),
  )
  add(
    'Journal',
    newest(sources.journal)
      .filter((entry) => has(entry.text, ...entry.answers.map((answer) => answer.text)))
      .map((entry) => {
        const body = [entry.text, ...entry.answers.map((answer) => answer.text)].find((text) => text.toLowerCase().includes(words)) ?? ''
        return { key: `journal-${entry.id}`, title: excerpt(body, words), detail: `${formatDate(entry.date)} · ${entry.kind}`, to: '/journal/history' }
      }),
  )
  add(
    'Meals',
    newest(sources.meals)
      .filter((meal) => has(meal.text))
      .map((meal) => ({ key: `meal-${meal.date}-${meal.slot}`, title: excerpt(meal.text, words), detail: `${formatDate(meal.date)} · ${meal.slot}${meal.ate_out ? ' · ate out' : ''}`, to: '/nutrition?tab=history' })),
  )
  add(
    'Learning',
    sources.resources
      .filter((resource) => has(resource.title, resource.author, resource.topic, resource.source, resource.notes, resource.description))
      .map((resource) => ({ key: `resource-${resource.id}`, title: resource.title, detail: [resource.author, resource.topic, resource.status.replace('_', ' ')].filter(Boolean).join(' · '), to: `/learn/resource/${resource.id}` })),
  )
  add(
    'Quotes',
    sources.quotes
      .filter((quote) => has(quote.text, quote.author, quote.category, quote.note))
      .map((quote) => ({ key: `quote-${quote.id}`, title: excerpt(quote.text, words, 60), detail: quote.author || 'Unknown', to: '/quotes' })),
  )
  add(
    'Workouts',
    newest(sources.sessions)
      .filter((session) => session.ended_at !== null && has(session.title, session.notes))
      .map((session) => ({ key: `session-${session.id}`, title: session.title, detail: `${formatDate(session.date)}${session.notes ? ` · ${excerpt(session.notes, words, 30)}` : ''}`, to: `/train/session/${session.id}` })),
  )
  add(
    'Exercises',
    sources.exercises
      .filter((exercise) => has(exercise.name, exercise.notes))
      .map((exercise) => ({ key: `exercise-${exercise.id}`, title: exercise.name, detail: exercise.retired_on ? 'Retired' : exercise.primary_muscle, to: `/train/exercise/${exercise.id}` })),
  )
  return groups
}
