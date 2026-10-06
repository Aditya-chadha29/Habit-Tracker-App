import { db } from './db'
import { todayLocalStr } from './dates'

/** Bump whenever the set of tables, or the shape of a row, changes. */
export const EXPORT_SCHEMA_VERSION = 2

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
  // One read transaction over every table, so the snapshot is consistent: reading each table in
  // its own transaction lets a write land between them and produce a file where a parent row is
  // present but its children aren't. Built from db.tables rather than a hardcoded list so a table
  // added in a later db.version() can't be silently left out of backups — daily_notes was missing
  // from every export before this.
  const rows = await db.transaction('r', db.tables, async () =>
    Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()] as const)),
  )

  const payload = {
    exported_at: todayLocalStr(),
    schema_version: EXPORT_SCHEMA_VERSION,
    db_version: db.verno,
    ...Object.fromEntries(rows),
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
