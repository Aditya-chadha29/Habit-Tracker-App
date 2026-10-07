// The four-item queue from the spec's third acceptance test, plus an active book.
export default async (page) => {
  await page.evaluate(async () => {
    const db = window.__db
    const pillars = await db.table('learning_pillars').toArray()
    const pillar = (name) => pillars.find((p) => p.name.startsWith(name))?.id ?? null
    const base = {
      topic: '', author: '', source: '', url: '', description: '', priority: 2, progress_current: 0, progress_total: null, position_note: '',
      notes: '', created_on: '2026-10-01', started_on: null, completed_on: null, archived_on: null,
    }
    const rows = [
      { ...base, title: 'AI Agents - Lesson 3', type: 'video', pillar_id: pillar('AI'), source: 'YouTube', estimated_minutes: 38, status: 'queued', queue_position: 1, progress_unit: 'minutes', progress_total: 38 },
      { ...base, title: 'RAG Fundamentals', type: 'video', pillar_id: pillar('AI'), source: 'YouTube', estimated_minutes: 42, status: 'queued', queue_position: 2, progress_unit: 'minutes' },
      { ...base, title: 'Meditations - Book IV', type: 'book', pillar_id: pillar('Self'), author: 'Marcus Aurelius', estimated_minutes: null, status: 'queued', queue_position: 3, progress_unit: 'pages' },
      { ...base, title: 'RCC Basics', type: 'pdf', pillar_id: pillar('Construction'), estimated_minutes: 45, status: 'queued', queue_position: 4, progress_unit: 'pages', progress_total: 60 },
      { ...base, title: 'Building a Second Brain', type: 'book', pillar_id: pillar('Self'), author: 'Tiago Forte', status: 'inbox', queue_position: null, progress_unit: 'pages', estimated_minutes: null },
      { ...base, title: 'Meditations', type: 'book', pillar_id: pillar('Self'), author: 'Marcus Aurelius', status: 'in_progress', queue_position: null, progress_unit: 'pages', progress_current: 62, progress_total: 240, position_note: 'Book IV', started_on: '2026-09-20', estimated_minutes: null },
    ]
    const ids = await db.table('learning_resources').bulkAdd(rows, { allKeys: true })
    await db.table('settings').put({ key: 'active_book_id', value: ids[5] })
  })
}
