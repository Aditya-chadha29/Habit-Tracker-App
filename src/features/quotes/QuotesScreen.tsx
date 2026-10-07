import { useMemo, useState } from 'react'
import { db } from '../../data/db'
import {
  addQuote, anotherQuoteForDay, deleteQuoteAddedToday, setQuoteFlags, setQuoteForDay, updateQuote, type QuoteInput,
} from '../../data/quoteRepo'
import { saveSettings } from '../../data/settingsRepo'
import type { Quote } from '../../data/types'
import { formatShortDate } from '../../engine/dates'
import type { QuoteMode } from '../../engine/quotes'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Button, IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Switch, TextArea, TextInput } from '../../ui/Field'
import { Drawer } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'
import { useQuoteOfDay } from './hooks'

const MODES = [
  { id: 'rotate', label: 'Rotate' },
  { id: 'favorites', label: 'Favourites' },
  { id: 'manual', label: 'Manual' },
] as const

const MODE_NOTE: Record<QuoteMode, string> = {
  rotate: 'A different quote each day, least recently shown first.',
  favorites: 'Rotates through favourites only.',
  manual: 'The same quote stays until you pick another.',
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favourites' },
  { id: 'retired', label: 'Retired' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

const NONE: Quote[] = []
const BLANK: QuoteInput = { text: '', author: '', category: '', note: '' }

function QuoteEditor({ quote, onClose }: { quote: Quote | 'new'; onClose: () => void }) {
  const { today } = useCore()
  const toast = useToast()
  const existing = quote === 'new' ? null : quote
  const [form, setForm] = useState<QuoteInput>(existing ? { text: existing.text, author: existing.author, category: existing.category, note: existing.note } : BLANK)
  const [error, setError] = useState('')

  const save = async () => {
    try {
      if (existing) await updateQuote(existing.id!, form)
      else await addQuote(form, today)
      onClose()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.')
    }
  }

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action()
      toast.show(message)
      onClose()
    } catch (problem) {
      toast.show(problem instanceof Error ? problem.message : 'That could not be done.', { tone: 'risk' })
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={existing ? 'Quote' : 'New quote'}
      footer={
        <Button variant="primary" onClick={save}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Quote" error={error || undefined}>
          <TextArea autoGrow rows={3} value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} />
        </Field>
        <Field label="Author">
          <TextInput value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} maxLength={80} />
        </Field>
        <Field label="Category" hint="Optional: Discipline, Stoicism, Learning…">
          <TextInput value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} maxLength={40} />
        </Field>
        <Field label="Your note" hint="Optional. Why it matters to you.">
          <TextArea autoGrow rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
        </Field>

        {existing && (
          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <p className="text-[12.5px] text-ink-3">
              Shown {existing.times_shown} {existing.times_shown === 1 ? 'time' : 'times'}
              {existing.last_shown ? `, last on ${formatShortDate(existing.last_shown)}` : ''}.
            </p>
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-[14px] text-ink">Never show again</span>
              <Switch
                label="Never show this quote again"
                checked={existing.never_show}
                onChange={(next) => void setQuoteFlags(existing.id!, { never_show: next })}
              />
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => run(() => setQuoteForDay(today, existing.id!), 'Set as today’s quote.')}>
                Use today
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  run(() => setQuoteFlags(existing.id!, { active: !existing.active }), existing.active ? 'Quote retired. It stays in the library.' : 'Quote restored.')
                }
              >
                {existing.active ? 'Retire' : 'Restore'}
              </Button>
              {existing.created_on === today && (
                <Button variant="danger" onClick={() => run(() => deleteQuoteAddedToday(existing.id!, today), 'Quote deleted.')}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

/** The owner's own collection of quotes, and how one of them is chosen each day. */
export default function QuotesScreen() {
  const { today, settings } = useCore()
  const toast = useToast()
  const quotes = useLive(() => db.quotes.toArray(), [], NONE)
  const { quote: todays } = useQuoteOfDay(today)
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Quote | 'new' | null>(null)

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return quotes
      .filter((quote) => (filter === 'retired' ? !quote.active : quote.active && (filter === 'all' || quote.favorite)))
      .filter((quote) => !needle || `${quote.text} ${quote.author} ${quote.category}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.text.localeCompare(b.text))
  }, [quotes, filter, query])

  // The editor shows the live row, so a flag flipped inside it is reflected at once.
  const editingLive = editing && editing !== 'new' ? (quotes.find((quote) => quote.id === editing.id) ?? editing) : editing

  return (
    <Page
      title="Quotes"
      subtitle={`${quotes.filter((quote) => quote.active).length} in the collection`}
      width="default"
      actions={
        <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing('new')}>
          Add
        </Button>
      }
    >
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4 lg:sticky lg:top-0 lg:col-span-5">
          <Card className="lg:p-6">
            <p className="eyebrow">Today</p>
            {todays ? (
              <figure className="mt-3">
                <blockquote className="text-[20px] leading-snug font-medium tracking-tight text-ink lg:text-[24px]">“{todays.text}”</blockquote>
                {todays.author && <figcaption className="mt-3 text-[13.5px] text-ink-3">— {todays.author}</figcaption>}
              </figure>
            ) : (
              <p className="mt-3 text-[14px] text-ink-3">No quote available. Add one, or restore a retired one.</p>
            )}
            {todays && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon="undo" onClick={() => void anotherQuoteForDay(today, settings.quote_mode)}>
                  Another
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="star"
                  aria-pressed={todays.favorite}
                  onClick={() => void setQuoteFlags(todays.id!, { favorite: !todays.favorite })}
                >
                  {todays.favorite ? 'Favourite' : 'Add to favourites'}
                </Button>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <p className="eyebrow">How the day’s quote is chosen</p>
            <Segmented options={MODES} value={settings.quote_mode} onChange={(mode) => void saveSettings({ quote_mode: mode })} label="Quote rotation" block />
            <p className="text-[12.5px] text-ink-3">{MODE_NOTE[settings.quote_mode]}</p>
          </Card>
        </div>

        <section className="flex flex-col gap-3 lg:col-span-7">
          <SectionTitle>Library</SectionTitle>
          <TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quotes, authors, categories" aria-label="Search quotes" />
          <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Which quotes" size="sm" />
          {shown.length === 0 ? (
            <EmptyState
              icon="quotes"
              title={query ? 'No quote matches.' : filter === 'favorites' ? 'No favourites yet.' : filter === 'retired' ? 'Nothing retired.' : 'The collection is empty.'}
              body={filter === 'all' && !query ? 'Add the first quote.' : undefined}
            />
          ) : (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {shown.map((quote) => (
                <div key={quote.id} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => setEditing(quote)}
                    className="min-w-0 flex-1 cursor-pointer py-3 pr-2 pl-4 text-left transition-colors duration-100 hover:bg-surface-2"
                  >
                    <span className={cx('line-clamp-3 text-[14.5px] leading-snug', quote.active ? 'text-ink' : 'text-ink-3')}>{quote.text}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                      {quote.author && <span>{quote.author}</span>}
                      {quote.category && <Chip>{quote.category}</Chip>}
                      {quote.never_show && <Chip tone="warn">Never shown</Chip>}
                      {quote.id === todays?.id && <Chip tone="accent">Today</Chip>}
                    </span>
                  </button>
                  <IconButton
                    icon="star"
                    label={quote.favorite ? `Remove from favourites: ${quote.text}` : `Add to favourites: ${quote.text}`}
                    aria-pressed={quote.favorite}
                    onClick={() => {
                      setQuoteFlags(quote.id!, { favorite: !quote.favorite }).catch(() => toast.show('That could not be saved.', { tone: 'risk' }))
                    }}
                    className={cx('self-center', quote.favorite && 'text-warn [&_svg]:fill-current')}
                  />
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>

      {editingLive && <QuoteEditor quote={editingLive} onClose={() => setEditing(null)} />}
    </Page>
  )
}
