/** How a file reached the user. */
export type Delivery = 'shared' | 'downloaded' | 'cancelled'

export function canShareFiles(): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [new File(['{}'], 'check.json', { type: 'application/json' })] })
  } catch {
    return false
  }
}

export function downloadJson(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Not at once: the browser starts reading the file after this returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Hands a file to the share sheet (AirDrop, Files, mail, a cloud drive). Closing the sheet is the
 * user's decision and is respected; any other failure falls back to a plain download so an export
 * is never silently lost.
 */
export async function shareJson(json: string, filename: string): Promise<Delivery> {
  try {
    await navigator.share({ files: [new File([json], filename, { type: 'application/json' })], title: filename })
    return 'shared'
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
    downloadJson(json, filename)
    return 'downloaded'
  }
}

const TABLE_LABEL: Record<string, string> = {
  habits: 'Habits, supplements and meals',
  entries: 'Ticks',
  day_routines: 'Day routines',
  meals: 'Meal notes',
  weight_entries: 'Weight entries',
  sessions: 'Workout sessions',
  set_logs: 'Sets',
  exercises: 'Exercises',
  routines: 'Workout routines',
  routine_items: 'Exercises in routines',
  learning_resources: 'Learning resources',
  learning_sessions: 'Learning sessions',
  learning_pillars: 'Learning pillars',
  journal_entries: 'Journal entries',
  weekly_reviews: 'Weekly reviews',
  quotes: 'Quotes',
  quote_days: 'Quotes shown by day',
  day_marks: 'Days off',
  day_plans: 'Plans for the next day',
  measurements: 'Body measurements',
  settings: 'Settings',
  migrations: 'Update records',
  weekly_records: 'Weekly records from the earlier app',
  daily_notes: 'Daily notes from the earlier app',
  supplements: 'Supplement list from the earlier app',
  supplement_logs: 'Supplement ticks from the earlier app',
}

export function tableLabel(table: string): string {
  return TABLE_LABEL[table] ?? table
}

/** Tables with something in them, largest first, under the names a person would use. */
export function countLines(counts: Record<string, number>): { table: string; label: string; count: number }[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => ({ table, label: tableLabel(table), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function totalOf(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
