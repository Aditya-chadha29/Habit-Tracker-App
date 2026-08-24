import { db } from './db'
import { todayLocalStr } from './dates'

export async function exportAllData(): Promise<void> {
  const [habits, entries, weekly_records] = await Promise.all([
    db.habits.toArray(),
    db.entries.toArray(),
    db.weekly_records.toArray(),
  ])

  const payload = {
    exported_at: todayLocalStr(),
    schema_version: 1,
    habits,
    entries,
    weekly_records,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `habit-tracker-export-${todayLocalStr()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
