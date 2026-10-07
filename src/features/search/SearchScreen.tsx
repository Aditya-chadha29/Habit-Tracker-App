import { useMemo } from 'react'
import { Link, useQueryState } from '../../app/router'
import { db } from '../../data/db'
import type { Exercise, JournalEntry, LearningResource, Meal, Quote, Session } from '../../data/types'
import { formatFullDate } from '../../engine/dates'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { TextInput } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { Page } from '../../ui/Page'
import { search } from './search'

const NO_JOURNAL: JournalEntry[] = []
const NO_MEALS: Meal[] = []
const NO_RESOURCES: LearningResource[] = []
const NO_QUOTES: Quote[] = []
const NO_SESSIONS: Session[] = []
const NO_EXERCISES: Exercise[] = []

/**
 * One box that looks through everything written into the app: habits, journal, meals, learning,
 * quotes, workouts and exercises. It earns its place after months of records, when "when did I
 * last eat that" or "which book mentioned this" has an answer somewhere in here.
 */
export default function SearchScreen() {
  const { habits } = useCore()
  const [query, setQuery] = useQueryState('q', '')
  const journal = useLive(() => db.journal_entries.toArray(), [], NO_JOURNAL)
  const meals = useLive(() => db.meals.toArray(), [], NO_MEALS)
  const resources = useLive(() => db.learning_resources.toArray(), [], NO_RESOURCES)
  const quotes = useLive(() => db.quotes.toArray(), [], NO_QUOTES)
  const sessions = useLive(() => db.sessions.toArray(), [], NO_SESSIONS)
  const exercises = useLive(() => db.exercises.toArray(), [], NO_EXERCISES)

  const groups = useMemo(
    () => search(query, { habits, journal, meals, resources, quotes, sessions, exercises }, formatFullDate),
    [query, habits, journal, meals, resources, quotes, sessions, exercises],
  )
  const total = groups.reduce((count, group) => count + group.hits.length, 0)
  const ready = query.trim().length >= 2

  return (
    <Page title="Search" subtitle="Everything written into the app" width="narrow">
      <div className="flex flex-col gap-5">
        <TextInput
          type="search"
          aria-label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="A habit, a meal, a book, a note…"
          autoFocus
          enterKeyHint="search"
        />
        {!ready ? (
          <p className="px-1 text-[13px] text-ink-3">Type two or more letters. Habits are also found by names they used to have.</p>
        ) : total === 0 ? (
          <EmptyState icon="search" title="Nothing found." body="Nothing written into the app contains those words." />
        ) : (
          groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-2">
              <SectionTitle>
                {group.label} · {group.hits.length}
              </SectionTitle>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {group.hits.map((hit) => (
                  <Link key={hit.key} to={hit.to} className="flex min-h-[52px] items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] text-ink">{hit.title}</span>
                      <span className="block truncate text-[12.5px] text-ink-3">{hit.detail}</span>
                    </span>
                    <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />
                  </Link>
                ))}
              </Card>
            </section>
          ))
        )}
      </div>
    </Page>
  )
}
