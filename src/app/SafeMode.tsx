import Dexie from 'dexie'
import { useState } from 'react'
import { BACKUP_DB_NAME, listSnapshots, readSnapshot, type SnapshotSummary } from '../data/backup'
import { DB_NAME } from '../data/db'

/**
 * Shown instead of the app when it cannot start: the database would not open, or a data
 * migration failed. It promises one thing — a way to get everything off the device — and it
 * depends on as little of the app as possible so that it still works when the app does not.
 *
 * It never deletes or repairs anything on its own.
 */
function download(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Opens the database as whatever is on disk, without this build's schema, and reads every table. */
async function rawDump(): Promise<Record<string, unknown>> {
  const raw = new Dexie(DB_NAME)
  await raw.open()
  try {
    const tables: Record<string, unknown> = {}
    for (const table of raw.tables) tables[table.name] = await table.toArray()
    return { exported_at: new Date().toString(), raw: true, db_version: raw.verno, ...tables }
  } finally {
    raw.close()
  }
}

export function SafeMode({ error, kind }: { error: unknown; kind: 'failed' | 'newer-data' }) {
  const [status, setStatus] = useState('')
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null)
  const message = error instanceof Error ? error.message : String(error ?? '')

  const exportRaw = async () => {
    try {
      download(`personal-os-raw-export.json`, await rawDump())
      setStatus('Export downloaded.')
    } catch (problem) {
      setStatus(`Could not read the database: ${problem instanceof Error ? problem.message : String(problem)}`)
    }
  }

  const findBackups = async () => {
    try {
      const exists = await Dexie.exists(BACKUP_DB_NAME)
      setSnapshots(exists ? await listSnapshots() : [])
    } catch {
      setSnapshots([])
    }
  }

  const exportBackup = async (id: string) => {
    const snapshot = await readSnapshot(id)
    if (snapshot) download(`personal-os-backup-${snapshot.taken_on}.json`, snapshot)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-5 p-6 text-ink">
      <h1 className="text-[22px] font-semibold tracking-tight">
        {kind === 'newer-data' ? 'This copy of the app is out of date' : 'The app could not start'}
      </h1>
      <p className="text-[15px] leading-relaxed text-ink-2">
        {kind === 'newer-data'
          ? 'Your data was last saved by a newer version of the app than the one that just loaded. Reload to get the current version. Nothing has been changed.'
          : 'Your data is still on this device and has not been deleted. You can export it now, before trying anything else.'}
      </p>
      {message && (
        <p className="rounded-control bg-surface-2 px-3 py-2 font-mono text-[12px] break-words text-ink-3">{message}</p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => window.location.reload()} className="h-11 cursor-pointer rounded-control bg-accent px-4 text-[14px] font-medium text-on-accent">
          Reload
        </button>
        <button type="button" onClick={exportRaw} className="h-11 cursor-pointer rounded-control bg-surface-2 px-4 text-[14px] font-medium text-ink">
          Export everything
        </button>
        <button type="button" onClick={findBackups} className="h-11 cursor-pointer rounded-control bg-surface-2 px-4 text-[14px] font-medium text-ink">
          Look for automatic backups
        </button>
      </div>
      {snapshots && (
        <ul className="flex flex-col gap-2">
          {snapshots.length === 0 && <li className="text-[14px] text-ink-3">No automatic backups on this device.</li>}
          {snapshots.map((snapshot) => (
            <li key={snapshot.id} className="flex items-center justify-between gap-3 rounded-control bg-surface px-3 py-2 text-[14px]">
              <span className="text-ink-2">
                {snapshot.taken_on} · {snapshot.row_count} rows · {snapshot.label}
              </span>
              <button type="button" onClick={() => exportBackup(snapshot.id)} className="h-9 cursor-pointer rounded-control bg-surface-2 px-3 text-[13px] font-medium text-ink">
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="min-h-5 text-[13px] text-ink-3">
        {status}
      </p>
    </div>
  )
}
