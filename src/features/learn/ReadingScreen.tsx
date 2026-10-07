import { useMemo, useState } from 'react'
import { Link } from '../../app/router'
import { setActiveBook } from '../../data/learningRepo'
import { formatFullDate } from '../../engine/dates'
import { progressFraction, progressLabel } from '../../engine/learning'
import { periodOf } from '../../engine/periods'
import { useCore } from '../../state/core'
import { Button } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/icons'
import { Page } from '../../ui/Page'
import { ProgressBar } from '../../ui/Progress'
import { useToast } from '../../ui/Toast'
import { useLearningNow, useLearningSessions, usePillars, useResources } from './hooks'
import { LearnTabs, ResourceForm, ResourceRow, SessionSheet } from './shared'

/**
 * Reading: one active book, so a growing collection never turns into "which one tonight?".
 * The book tracks where you are; logging a session here is what completes the Reading habit.
 */
export default function ReadingScreen() {
  const { today, weekStart } = useCore()
  const toast = useToast()
  const now = useLearningNow()
  const { list } = useResources()
  const pillars = usePillars()
  const week = useMemo(() => periodOf('week', today, weekStart), [today, weekStart])
  const sessions = useLearningSessions(week.start, today)
  const [logging, setLogging] = useState(false)
  const [adding, setAdding] = useState(false)

  const book = now.activeBook
  const books = list.filter((resource) => resource.type === 'book')
  const waiting = books.filter((resource) => resource.id !== book?.id && resource.status !== 'completed' && resource.status !== 'archived')
  const finished = books.filter((resource) => resource.status === 'completed').sort((a, b) => ((a.completed_on ?? '') < (b.completed_on ?? '') ? 1 : -1))
  const readingDays = new Set(sessions.filter((session) => session.lane === 'reading').map((session) => session.date)).size
  const fraction = book ? progressFraction(book) : null
  const choose = (id: number) => setActiveBook(id).catch(() => toast.show('That could not be saved.', { tone: 'risk' }))

  return (
    <Page
      title="Learn"
      subtitle={`Read on ${readingDays} ${readingDays === 1 ? 'day' : 'days'} this week`}
      width="default"
      tabs={<LearnTabs current="/learn/reading" />}
      actions={
        <Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>
          Add book
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {book ? (
          <Card className="flex flex-col gap-4 lg:p-6">
            <div>
              <p className="eyebrow">Active book</p>
              <h2 className="mt-1.5 text-[24px] leading-tight font-semibold tracking-tight text-ink">{book.title}</h2>
              {book.author && <p className="mt-1 text-[14px] text-ink-2">{book.author}</p>}
            </div>
            <div>
              {fraction !== null && <ProgressBar value={fraction} max={1} label={`${book.title}: ${progressLabel(book)}`} />}
              <p className="mt-1.5 text-[13px] text-ink-2">{[progressLabel(book), book.position_note].filter(Boolean).join(' · ') || 'Not started'}</p>
              {book.progress_unit === 'pages' && (
                <p className="mt-0.5 text-[12.5px] text-ink-3">
                  Next: from page {book.progress_current + 1}
                  {book.progress_total ? ` of ${book.progress_total}` : ''}
                </p>
              )}
            </div>
            <Button variant="primary" size="lg" block onClick={() => setLogging(true)}>
              Log reading session
            </Button>
            <div className="flex flex-wrap gap-2">
              <Link to={`/learn/resource/${book.id}`} className="inline-flex h-9 items-center rounded-control px-3 text-[13px] font-medium text-accent-ink hover:bg-surface-2">
                Details and notes
              </Link>
              <Button variant="ghost" size="sm" onClick={() => void setActiveBook(null)}>
                Stop reading this
              </Button>
            </div>
            {sessions.some((session) => session.lane === 'reading' && session.date === today) && (
              <p className="flex items-center gap-2 text-[13px] text-ok">
                <Icon name="check-circle" size={16} />
                Reading logged today.
              </p>
            )}
          </Card>
        ) : (
          <EmptyState
            icon="book"
            title="No book is being read."
            body={waiting.length ? 'Choose one from your books below.' : 'Add a book to start reading.'}
            action={
              waiting.length === 0 ? (
                <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                  Add a book
                </Button>
              ) : undefined
            }
          />
        )}

        {waiting.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionTitle>Other books · {waiting.length}</SectionTitle>
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {waiting.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  trailing={
                    <Button variant="secondary" size="sm" onClick={() => choose(resource.id!)} aria-label={`Read ${resource.title} now`}>
                      Read this
                    </Button>
                  }
                />
              ))}
            </Card>
          </section>
        )}

        {finished.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionTitle>Finished · {finished.length}</SectionTitle>
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {finished.map((resource) => (
                <Link
                  key={resource.id}
                  to={`/learn/resource/${resource.id}`}
                  className="flex min-h-[56px] items-center gap-3 px-4 py-2 transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
                >
                  <Icon name="check-circle" size={18} className="shrink-0 text-ok" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] text-ink">{resource.title}</span>
                    <span className="block truncate text-[12.5px] text-ink-3">
                      {[resource.author, resource.completed_on ? `finished ${formatFullDate(resource.completed_on)}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Link>
              ))}
            </Card>
          </section>
        )}
      </div>

      {logging && book && <SessionSheet resource={book} lane="reading" onClose={() => setLogging(false)} />}
      {adding && (
        <ResourceForm
          type="book"
          pillars={pillars}
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            if (!book) void setActiveBook(id)
          }}
        />
      )}
    </Page>
  )
}
