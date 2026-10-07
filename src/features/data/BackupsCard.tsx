import { useEffect, useState } from 'react'
import { isKeptForever, listSnapshots, readSnapshot, type SnapshotSummary } from '../../data/backup'
import { db } from '../../data/db'
import { applyImport, prepareImport } from '../../data/importExport'
import { clockHHMM, formatFullDate } from '../../engine/dates'
import { useCore } from '../../state/core'
import { Button, IconButton } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { useToast } from '../../ui/Toast'
import { canShareFiles, downloadJson, shareJson } from './transfer'
import { TypedConfirm } from './TypedConfirm'

function titleOf(label: string): string {
  if (label === 'before-001-cutover') return 'Before the move to IKIKATA'
  if (label === 'before-import') return 'Before an import replaced everything'
  if (label.startsWith('before-')) return 'Before an update to the app'
  return label
}

/** A snapshot as a file an import can read: the tables at the top level, like an export. */
function asFile(snapshot: { label: string; taken_on: string; db_version: number; tables: Record<string, unknown[]> }): string {
  return JSON.stringify({ exported_at: snapshot.taken_on, db_version: snapshot.db_version, snapshot: snapshot.label, ...snapshot.tables }, null, 2)
}

/**
 * The copies the app takes on its own: before a data update, and before anything replaces the
 * whole database. They live on this device only — they protect against a bad update or a wrong
 * import, not against losing the phone. That is what Export is for.
 */
export function BackupsCard({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { today } = useCore()
  const toast = useToast()
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null)
  const [restoring, setRestoring] = useState<SnapshotSummary | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    listSnapshots()
      .then((rows) => {
        if (alive) setSnapshots(rows)
      })
      .catch(() => {
        if (alive) setSnapshots([])
      })
    return () => {
      alive = false
    }
  }, [refreshKey])

  const download = async (summary: SnapshotSummary) => {
    const snapshot = await readSnapshot(summary.id)
    if (!snapshot) {
      toast.show('That copy is no longer there.', { tone: 'risk' })
      return
    }
    const filename = `personal-os-copy-${snapshot.taken_on}.json`
    // On a phone the share sheet is the dependable way to get a file out of an installed app.
    if (canShareFiles() && window.matchMedia('(pointer: coarse)').matches) await shareJson(asFile(snapshot), filename)
    else downloadJson(asFile(snapshot), filename)
  }

  const restore = async (summary: SnapshotSummary) => {
    setBusy(true)
    try {
      const snapshot = await readSnapshot(summary.id)
      if (!snapshot) throw new Error('That copy is no longer there.')
      const prepared = await prepareImport(asFile(snapshot), db, today, Date.now())
      if (!prepared.ok) throw new Error(prepared.problems.find((problem) => problem.level === 'error')?.message ?? 'The copy could not be read.')
      await applyImport(db, prepared, 'replace', today, Date.now())
      const leftOut = prepared.problems.filter((problem) => problem.level === 'warning').length
      toast.show(
        `Restored the copy from ${formatFullDate(snapshot.taken_on)}.` + (leftOut ? ` ${leftOut} ${leftOut === 1 ? 'kind of record in it was' : 'kinds of record in it were'} damaged and left out.` : ''),
        { tone: 'ok' },
      )
      onChanged()
    } catch (error) {
      toast.show(`Could not restore. ${error instanceof Error ? error.message : ''} Nothing on this device was changed.`.trim(), { tone: 'risk' })
    } finally {
      setBusy(false)
    }
  }

  if (snapshots === null) return <Card className="text-[13.5px] text-ink-3">Looking for copies…</Card>
  if (snapshots.length === 0) {
    return <Card className="text-[13.5px] leading-relaxed text-ink-3">No copies yet. One is taken automatically before a data update and before an import replaces everything.</Card>
  }

  return (
    <>
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {snapshots.map((snapshot) => (
          <div key={snapshot.id} className="flex min-h-[64px] items-center gap-2 py-2.5 pr-2 pl-4">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] text-ink">{titleOf(snapshot.label)}</span>
              <span className="tnum mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                {formatFullDate(snapshot.taken_on)}, {clockHHMM(new Date(snapshot.taken_at))} · {snapshot.row_count.toLocaleString()} records
                {isKeptForever(snapshot.label) && <Chip>Kept permanently</Chip>}
              </span>
            </span>
            <IconButton icon="download" label={`Download the copy from ${formatFullDate(snapshot.taken_on)}`} variant="ghost" onClick={() => void download(snapshot)} />
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setRestoring(snapshot)}>
              Restore
            </Button>
          </div>
        ))}
      </Card>

      <TypedConfirm
        open={restoring !== null}
        title="Restore this copy?"
        body={
          restoring && (
            <>
              Everything on this device goes back to how it was on <span className="text-ink">{formatFullDate(restoring.taken_on)}</span> at {clockHHMM(new Date(restoring.taken_at))}. A copy of what is
              here now is taken first, so this can be undone from this list.
            </>
          )
        }
        word="RESTORE"
        confirmLabel="Restore"
        onCancel={() => setRestoring(null)}
        onConfirm={() => {
          const target = restoring
          setRestoring(null)
          if (target) void restore(target)
        }}
      />
    </>
  )
}
