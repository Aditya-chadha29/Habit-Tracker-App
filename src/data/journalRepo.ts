import { db, type AppDb } from './db'
import type { WriteContext } from './habitRepo'
import type { DateStr, JournalAnswer, JournalEntry, JournalKind } from './types'
import { assertEditable } from '../engine/lock'

/**
 * The journal.
 *
 * Two rules shape everything here. First, an entry with nothing written in it does not exist:
 * saving empty content removes the row and never creates one — because a day having any journal
 * entry is what completes the Writing habit, and a blank page must not count as writing.
 * Second, an answer is stored together with the prompt it answered, so rewording the prompts
 * later never changes what an old entry says.
 */
export interface JournalContent {
  answers: JournalAnswer[]
  text: string
}

/** Kinds with one entry per day. 'general' notes can be many. */
export type DailyKind = Exclude<JournalKind, 'general'>

function tidy(content: JournalContent): JournalContent {
  return {
    text: content.text.trim(),
    answers: content.answers
      .map((answer) => ({ prompt: answer.prompt.trim(), text: answer.text.trim() }))
      .filter((answer) => answer.text !== ''),
  }
}

export function hasContent(content: JournalContent): boolean {
  return content.text.trim() !== '' || content.answers.some((answer) => answer.text.trim() !== '')
}

/**
 * Saves the day's morning, evening, daily or weekly entry. There is at most one of each per
 * day: the lookup and the write share a transaction, so two saves landing together still
 * produce one row. Returns the entry's id, or null when it ended up empty and was removed.
 */
export async function saveJournalEntry(
  date: DateStr,
  kind: DailyKind,
  content: JournalContent,
  ctx: WriteContext,
  now: number,
  database: AppDb = db,
): Promise<number | null> {
  assertEditable(date, ctx.today, ctx.windowDays)
  const clean = tidy(content)
  return database.transaction('rw', database.journal_entries, async () => {
    const existing = await database.journal_entries.where('[date+kind]').equals([date, kind]).first()
    if (!hasContent(clean)) {
      if (existing?.id !== undefined) await database.journal_entries.delete(existing.id)
      return null
    }
    if (existing?.id !== undefined) {
      await database.journal_entries.update(existing.id, { ...clean, updated_at: now })
      return existing.id
    }
    return (await database.journal_entries.add({ date, kind, ...clean, created_at: now, updated_at: now })) as number
  })
}

/** Saves a free note. Pass null as the id to create one. Empty text removes the note. */
export async function saveNote(
  id: number | null,
  date: DateStr,
  text: string,
  ctx: WriteContext,
  now: number,
  database: AppDb = db,
): Promise<number | null> {
  const trimmed = text.trim()
  return database.transaction('rw', database.journal_entries, async () => {
    if (id === null) {
      assertEditable(date, ctx.today, ctx.windowDays)
      if (!trimmed) return null
      return (await database.journal_entries.add({ date, kind: 'general', answers: [], text: trimmed, created_at: now, updated_at: now })) as number
    }
    const existing = await database.journal_entries.get(id)
    if (!existing) return null
    assertEditable(existing.date, ctx.today, ctx.windowDays)
    if (!trimmed) {
      await database.journal_entries.delete(id)
      return null
    }
    await database.journal_entries.update(id, { text: trimmed, updated_at: now })
    return id
  })
}

/** Removes an entry. Only inside the correction window: older entries are part of the record. */
export async function deleteJournalEntry(id: number, ctx: WriteContext, database: AppDb = db): Promise<void> {
  await database.transaction('rw', database.journal_entries, async () => {
    const existing = await database.journal_entries.get(id)
    if (!existing) return
    assertEditable(existing.date, ctx.today, ctx.windowDays)
    await database.journal_entries.delete(id)
  })
}

export async function journalEntriesOn(date: DateStr, database: AppDb = db): Promise<JournalEntry[]> {
  return database.journal_entries.where('date').equals(date).toArray()
}

/**
 * The fields to show for a prompted entry: what was already answered (under the prompt as it was
 * worded then), followed by any configured prompt that has not been answered yet.
 */
export function mergePrompts(prompts: readonly string[], answers: readonly JournalAnswer[]): JournalAnswer[] {
  const rows: JournalAnswer[] = answers.map((answer) => ({ ...answer }))
  const answered = new Set(answers.map((answer) => answer.prompt))
  for (const prompt of prompts) {
    if (!answered.has(prompt)) rows.push({ prompt, text: '' })
  }
  // Configured prompts come in their configured order; anything else (an old wording) follows.
  const order = new Map(prompts.map((prompt, i) => [prompt, i]))
  return rows.sort((a, b) => (order.get(a.prompt) ?? prompts.length) - (order.get(b.prompt) ?? prompts.length))
}
