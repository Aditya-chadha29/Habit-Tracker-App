import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { deleteJournalEntry, journalEntriesOn, mergePrompts, saveJournalEntry, saveNote } from './journalRepo'
import { buildCompletionIndex } from '../engine/completion'
import { LockedError } from '../engine/lock'
import { habit } from '../testing/builders'
import type { DateStr } from './types'

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

function fresh(): AppDb {
  const db = createDb(`journal-repo-test-${++counter}`)
  open.push(db)
  return db
}

const TODAY = '2026-10-07'
const ctx = { today: TODAY, windowDays: 7 }
const morning = (text: string) => ({ answers: [{ prompt: 'What matters today?', text }], text: '' })

describe('prompted entries', () => {
  it('stores the answer together with the prompt it answered', async () => {
    const db = fresh()
    const id = await saveJournalEntry(TODAY, 'morning', morning('  Finish the chapter. '), ctx, 100, db)
    expect(await db.journal_entries.get(id!)).toMatchObject({
      date: TODAY,
      kind: 'morning',
      answers: [{ prompt: 'What matters today?', text: 'Finish the chapter.' }],
      created_at: 100,
      updated_at: 100,
    })
  })

  it('keeps one entry per kind per day, even when two saves land together', async () => {
    const db = fresh()
    await Promise.all([
      saveJournalEntry(TODAY, 'morning', morning('first'), ctx, 1, db),
      saveJournalEntry(TODAY, 'morning', morning('second'), ctx, 2, db),
    ])
    await saveJournalEntry(TODAY, 'morning', morning('third'), ctx, 3, db)
    await saveJournalEntry(TODAY, 'evening', morning('evening'), ctx, 4, db)
    const entries = await journalEntriesOn(TODAY, db)
    expect(entries.map((entry) => entry.kind).sort()).toEqual(['evening', 'morning'])
    expect(entries.find((entry) => entry.kind === 'morning')).toMatchObject({ created_at: 1, updated_at: 3, answers: [{ text: 'third' }] })
  })

  it('never stores an empty entry, and clearing one removes it', async () => {
    const db = fresh()
    expect(await saveJournalEntry(TODAY, 'morning', morning('   '), ctx, 1, db)).toBeNull()
    expect(await db.journal_entries.count()).toBe(0)
    await saveJournalEntry(TODAY, 'morning', morning('something'), ctx, 2, db)
    expect(await saveJournalEntry(TODAY, 'morning', { answers: [{ prompt: 'What matters today?', text: '' }], text: ' ' }, ctx, 3, db)).toBeNull()
    expect(await db.journal_entries.count()).toBe(0)
  })

  it('a written entry makes the day a writing day; an emptied one does not', async () => {
    const db = fresh()
    const writing = habit({ id: 20, from: '2026-09-01', sources: ['manual', 'journal'] })
    const index = async () =>
      buildCompletionIndex({
        entries: [],
        sessions: [],
        learningSessions: [],
        journalDates: (await db.journal_entries.orderBy('date').uniqueKeys()) as DateStr[],
      })
    await saveJournalEntry(TODAY, 'evening', morning('A good day.'), ctx, 1, db)
    expect((await index()).journal.has(TODAY)).toBe(true)
    expect(writing.versions[0].sources).toContain('journal')
    await saveJournalEntry(TODAY, 'evening', morning(''), ctx, 2, db)
    expect((await index()).journal.has(TODAY)).toBe(false)
  })

  it('refuses a day outside the correction window', async () => {
    const db = fresh()
    await expect(saveJournalEntry('2026-09-20', 'morning', morning('late'), ctx, 1, db)).rejects.toBeInstanceOf(LockedError)
    await saveJournalEntry('2026-10-01', 'morning', morning('in time'), ctx, 1, db)
    expect(await db.journal_entries.count()).toBe(1)
  })
})

describe('free notes', () => {
  it('allows several in a day, edits one in place and removes it when emptied', async () => {
    const db = fresh()
    const a = await saveNote(null, TODAY, 'First thought', ctx, 1, db)
    const b = await saveNote(null, TODAY, 'Second thought', ctx, 2, db)
    expect(await saveNote(null, TODAY, '   ', ctx, 3, db)).toBeNull()
    await saveNote(a, TODAY, 'First thought, revised', ctx, 4, db)
    expect((await db.journal_entries.get(a!))!.text).toBe('First thought, revised')
    expect(await saveNote(b, TODAY, '', ctx, 5, db)).toBeNull()
    expect(await db.journal_entries.count()).toBe(1)
  })

  it('locks old notes against edits and deletion', async () => {
    const db = fresh()
    const id = await saveNote(null, '2026-10-01', 'Old note', ctx, 1, db)
    const later = { today: '2026-10-20', windowDays: 7 }
    await expect(saveNote(id, '2026-10-01', 'changed', later, 2, db)).rejects.toBeInstanceOf(LockedError)
    await expect(deleteJournalEntry(id!, later, db)).rejects.toBeInstanceOf(LockedError)
    await deleteJournalEntry(id!, ctx, db)
    expect(await db.journal_entries.count()).toBe(0)
  })
})

describe('prompts and old answers', () => {
  it('shows answered prompts as they were worded, then the unanswered configured ones', () => {
    const rows = mergePrompts(
      ['What matters today?', 'What must not be neglected?'],
      [{ prompt: 'What am I going to focus on?', text: 'Deep work' }, { prompt: 'What matters today?', text: 'Health' }],
    )
    expect(rows).toEqual([
      { prompt: 'What matters today?', text: 'Health' },
      { prompt: 'What must not be neglected?', text: '' },
      { prompt: 'What am I going to focus on?', text: 'Deep work' },
    ])
  })
})
