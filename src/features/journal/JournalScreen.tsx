import { useState } from 'react'
import { navigate, useQueryState } from '../../app/router'
import { DayNav } from '../../components/DayNav'
import { db } from '../../data/db'
import { mergePrompts, saveJournalEntry, type DailyKind } from '../../data/journalRepo'
import { saveSettings } from '../../data/settingsRepo'
import type { DateStr, JournalAnswer, JournalEntry } from '../../data/types'
import { isValidDateStr } from '../../engine/dates'
import { firstEditableDate } from '../../engine/lock'
import { moved, Reorderable } from '../../components/SortableList'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'
import { Button, IconButton } from '../../ui/Button'
import { Field, TextArea, TextInput } from '../../ui/Field'
import { Drawer } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { SceneBand } from '../../components/Scene'
import { saveStateLabel, useAutosave } from '../../state/useAutosave'

function EntryForm({ date, kind, prompts, initial }: { date: DateStr; kind: DailyKind; prompts: string[]; initial: JournalEntry | null }) {
  const { write } = useCore()
  const [rows, setRows] = useState<JournalAnswer[]>(() => mergePrompts(prompts, initial?.answers ?? []))
  const [text, setText] = useState(initial?.text ?? '')
  const state = useAutosave(JSON.stringify([rows, text]), () => saveJournalEntry(date, kind, { answers: rows, text }, write, Date.now()))

  return (
    <div className="flex flex-col gap-5">
      {rows.map((row, index) => (
        <Field key={row.prompt} label={row.prompt}>
          <TextArea
            autoGrow
            rows={2}
            value={row.text}
            onChange={(event) => setRows(rows.map((r, i) => (i === index ? { ...r, text: event.target.value } : r)))}
          />
        </Field>
      ))}
      <Field label={rows.length ? 'Anything else' : 'Write freely'}>
        <TextArea autoGrow rows={rows.length ? 3 : 8} value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      <p aria-live="polite" className="min-h-5 text-[12.5px] text-ink-3">
        {saveStateLabel(state)}
      </p>
    </div>
  )
}

function DailyEntry({ date, kind, prompts }: { date: DateStr; kind: DailyKind; prompts: string[] }) {
  const key = `${date}|${kind}`
  const { data, loaded } = useKeyedLiveQuery(key, async (): Promise<JournalEntry | null> => {
    return (await db.journal_entries.where('[date+kind]').equals([date, kind]).first()) ?? null
  })
  // The form is mounted once per day and kind, from the entry as it was at that moment. It is
  // never re-fed from the database while it is open, so nothing can overwrite what is being typed.
  const [mounted, setMounted] = useState<{ key: string; entry: JournalEntry | null } | null>(null)
  if (loaded && mounted?.key !== key) setMounted({ key, entry: data ?? null })
  if (!mounted || mounted.key !== key) return <div className="h-40 rounded-card bg-surface" aria-hidden="true" />
  return <EntryForm key={key} date={date} kind={kind} prompts={prompts} initial={mounted.entry} />
}

function PromptEditor({ kind, onClose }: { kind: DailyKind; onClose: () => void }) {
  const { settings } = useCore()
  const [prompts, setPrompts] = useState<string[]>(settings.journal_prompts[kind])


  const save = async () => {
    const cleaned = [...new Set(prompts.map((prompt) => prompt.trim()).filter(Boolean))]
    await saveSettings({ journal_prompts: { ...settings.journal_prompts, [kind]: cleaned } })
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${kind.charAt(0).toUpperCase()}${kind.slice(1)} prompts`}
      footer={
        <Button variant="primary" onClick={save}>
          Save prompts
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-ink-3">
          Changing a prompt affects new entries only. An entry already written keeps the question it answered.
        </p>
        <Reorderable items={prompts} nameOf={(_, index) => `prompt ${index + 1}`} onMove={(from, to) => setPrompts(moved(prompts, from, to))} className="flex flex-col gap-3">
          {(prompt, index, handle) => (
          <div className="flex items-center gap-1">
            {handle}
            <TextInput value={prompt} onChange={(event) => setPrompts(prompts.map((p, i) => (i === index ? event.target.value : p)))} aria-label={`Prompt ${index + 1}`} maxLength={140} />
            <IconButton icon="close" size="sm" label="Remove prompt" onClick={() => setPrompts(prompts.filter((_, i) => i !== index))} />
          </div>
          )}
        </Reorderable>
        <Button variant="secondary" icon="plus" onClick={() => setPrompts([...prompts, ''])} className="self-start">
          Add a prompt
        </Button>
        {prompts.length === 0 && <p className="text-[13px] text-ink-3">With no prompts, this entry is a single free-writing page.</p>}
      </div>
    </Drawer>
  )
}

/**
 * The journal: one page a day, with the day's questions. Writing here is
 * what completes the Writing habit; nothing is ticked separately.
 */
export default function JournalScreen() {
  const { today, settings } = useCore()
  const [rawDate, setDate] = useQueryState('d', today)
  const [editingPrompts, setEditingPrompts] = useState(false)
  const first = firstEditableDate(today, settings.edit_window_days)
  const date: DateStr = isValidDateStr(rawDate) && rawDate >= first && rawDate <= today ? rawDate : today
  // One journal a day. Morning and evening entries written earlier are still in the history.
  const kind = 'daily' as const

  return (
    <Page
      title="Journal"
      subtitle="Counts as the day’s writing"
      width="narrow"
      actions={
        <>
          <IconButton icon="sliders" label="Edit the questions" onClick={() => setEditingPrompts(true)} />
          <IconButton icon="history" label="Past entries" onClick={() => navigate('/journal/history')} />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SceneBand name="moonBlossom" position="50% 40%" />
        <DayNav date={date} onChange={setDate} />
        <DailyEntry date={date} kind={kind} prompts={settings.journal_prompts[kind]} />
      </div>
      {editingPrompts && <PromptEditor kind={kind} onClose={() => setEditingPrompts(false)} />}
    </Page>
  )
}
