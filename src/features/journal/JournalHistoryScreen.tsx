import { useMemo, useState } from 'react'
import { Link } from '../../app/router'
import { db } from '../../data/db'
import type { JournalEntry, JournalKind } from '../../data/types'
import { formatMediumDate, formatMonthTitle } from '../../engine/dates'
import { isEditable } from '../../engine/lock'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Card, SectionTitle } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { TextInput } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { Page } from '../../ui/Page'

const KIND_LABEL: Record<JournalKind, string> = {
  morning: 'Morning',
  evening: 'Evening',
  daily: 'Daily',
  weekly: 'Weekly',
  general: 'Note',
}

const NONE: JournalEntry[] = []

function matches(entry: JournalEntry, needle: string): boolean {
  if (!needle) return true
  const haystack = [entry.text, ...entry.answers.flatMap((answer) => [answer.prompt, answer.text])].join(' ').toLowerCase()
  return haystack.includes(needle)
}

/** Everything ever written, newest first. Entries older than the correction window are part of
 *  the record and are shown read-only. */
export default function JournalHistoryScreen() {
  const { today, settings } = useCore()
  const [query, setQuery] = useState('')
  const entries = useLive(() => db.journal_entries.orderBy('date').toArray().then((rows) => rows.reverse()), [], NONE)

  const months = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const groups = new Map<string, JournalEntry[]>()
    for (const entry of entries) {
      if (!matches(entry, needle)) continue
      const month = entry.date.slice(0, 7)
      const list = groups.get(month)
      if (list) list.push(entry)
      else groups.set(month, [entry])
    }
    return [...groups.entries()]
  }, [entries, query])

  return (
    <Page title="Past entries" subtitle={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`} back="/journal" width="narrow">
      <div className="flex flex-col gap-5">
        {entries.length > 0 && (
          <TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search what you wrote" aria-label="Search the journal" />
        )}
        {entries.length === 0 && <EmptyState icon="journal" title="Nothing written yet." body="Entries appear here from the day they are written." />}
        {entries.length > 0 && months.length === 0 && <EmptyState title="No entry matches." />}
        {months.map(([month, list]) => (
          <section key={month} className="flex flex-col gap-2">
            <SectionTitle>{formatMonthTitle(`${month}-01`)}</SectionTitle>
            {list.map((entry) => {
              const editable = isEditable(entry.date, today, settings.edit_window_days)
              return (
                <Card key={entry.id} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-ink">{formatMediumDate(entry.date)}</h3>
                    <Chip>{KIND_LABEL[entry.kind]}</Chip>
                    {editable && entry.kind !== 'weekly' ? (
                      <Link to={`/journal?d=${entry.date}&kind=${entry.kind}`} className="ml-auto text-[13px] font-medium text-cream underline underline-offset-2">
                        Open
                      </Link>
                    ) : (
                      <span className="ml-auto flex items-center gap-1 text-[12px] text-ink-3">
                        <Icon name="lock" size={13} />
                        Locked
                      </span>
                    )}
                  </div>
                  {entry.answers.map((answer) => (
                    <div key={answer.prompt}>
                      <p className="text-[12.5px] font-medium text-ink-3">{answer.prompt}</p>
                      <p className="mt-0.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink">{answer.text}</p>
                    </div>
                  ))}
                  {entry.text && <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink">{entry.text}</p>}
                </Card>
              )
            })}
          </section>
        ))}
      </div>
    </Page>
  )
}
