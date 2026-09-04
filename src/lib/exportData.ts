import { db } from './db'
import { todayLocalStr } from './dates'

function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

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

  const json = JSON.stringify(payload, null, 2)
  const filename = `habit-tracker-export-${todayLocalStr()}.json`
  const file = new File([json], filename, { type: 'application/json' })

  // Prefer the native share sheet (AirDrop, email, messaging, cloud drives) on phones that
  // support sharing files — cuts out having to go dig the download out of the Files/Downloads
  // app afterward. navigator.canShare must be checked separately from navigator.share: some
  // browsers implement share() for text/links only, without file support.
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (err) {
      // AbortError means the user dismissed the share sheet themselves — respect that instead
      // of surprising them with a forced download. Any other failure falls through below.
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }

  downloadJson(json, filename)
}
