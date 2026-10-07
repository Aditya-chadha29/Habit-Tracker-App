import { useRef, useState } from 'react'
import { db } from '../../data/db'
import { applyImport, prepareImport, type ImportSummary, type PreparedImport } from '../../data/importExport'
import { formatFullDate, isValidDateStr } from '../../engine/dates'
import { useCore } from '../../state/core'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { useToast } from '../../ui/Toast'
import { countLines, tableLabel, totalOf } from './transfer'
import { TypedConfirm } from './TypedConfirm'

type Stage =
  | { step: 'idle' }
  | { step: 'reading'; fileName: string }
  | { step: 'report'; fileName: string; prepared: PreparedImport }
  | { step: 'working'; fileName: string }
  | { step: 'done'; summary: ImportSummary }

function Counts({ counts }: { counts: Record<string, number> }) {
  const lines = countLines(counts)
  if (!lines.length) return null
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13.5px]">
      {lines.map((line) => (
        <div key={line.table} className="contents">
          <dt className="min-w-0 truncate text-ink-2">{line.label}</dt>
          <dd className="tnum text-right text-ink">{line.count.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Import, in three steps that never skip one another: read and check the file without touching
 * anything, show exactly what it holds and what is wrong with it, and only then — on an explicit
 * choice — add to or replace what is on the device.
 */
export function ImportCard({ onChanged }: { onChanged: () => void }) {
  const { today } = useCore()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>({ step: 'idle' })
  const [confirming, setConfirming] = useState(false)

  const choose = () => input.current?.click()

  const read = async (file: File) => {
    setStage({ step: 'reading', fileName: file.name })
    try {
      const prepared = await prepareImport(await file.text(), db, today, Date.now())
      setStage({ step: 'report', fileName: file.name, prepared })
    } catch (error) {
      setStage({
        step: 'report',
        fileName: file.name,
        prepared: { ok: false, upgraded: false, exported_at: '', tables: {}, counts: {}, problems: [{ level: 'error', table: 'file', message: error instanceof Error ? error.message : 'The file could not be read.' }] },
      })
    }
  }

  const apply = async (mode: 'merge' | 'replace') => {
    if (stage.step !== 'report') return
    const { fileName, prepared } = stage
    setStage({ step: 'working', fileName })
    try {
      const summary = await applyImport(db, prepared, mode, today, Date.now())
      setStage({ step: 'done', summary })
      onChanged()
    } catch (error) {
      setStage({ step: 'report', fileName, prepared })
      toast.show(`Could not import data. ${error instanceof Error ? error.message : ''} Nothing on this device was changed.`.trim(), { tone: 'risk' })
    }
  }

  const picker = (
    <input
      ref={input}
      type="file"
      accept=".json,application/json"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        const file = event.target.files?.[0]
        // Cleared so choosing the same file again still fires a change.
        event.target.value = ''
        if (file) void read(file)
      }}
    />
  )

  if (stage.step === 'idle') {
    return (
      <Card className="flex flex-col gap-3">
        {picker}
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Bring back an export, from this app or from the earlier Habit Tracker. The file is checked first and nothing changes until you choose what to do with it.
        </p>
        <div>
          <Button variant="secondary" icon="upload" onClick={choose}>
            Choose a file
          </Button>
        </div>
      </Card>
    )
  }

  if (stage.step === 'reading' || stage.step === 'working') {
    return (
      <Card className="flex flex-col gap-1" aria-live="polite">
        {picker}
        <p className="text-[14px] text-ink">{stage.step === 'reading' ? 'Checking the file…' : 'Importing…'}</p>
        <p className="truncate text-[12.5px] text-ink-3">{stage.fileName}</p>
      </Card>
    )
  }

  if (stage.step === 'done') {
    const { summary } = stage
    const added = totalOf(summary.added)
    const skipped = totalOf(summary.skipped)
    return (
      <Card className="flex flex-col gap-3" aria-live="polite">
        {picker}
        <p className="text-[15px] font-medium text-ink">
          {summary.mode === 'replace' ? 'This device now holds what was in the file.' : added === 0 ? 'Nothing new was in the file.' : `${added.toLocaleString()} ${added === 1 ? 'record was' : 'records were'} added.`}
        </p>
        {summary.mode === 'merge' && skipped > 0 && (
          <p className="text-[13.5px] text-ink-2">
            {skipped.toLocaleString()} {skipped === 1 ? 'record was' : 'records were'} already here and left exactly as {skipped === 1 ? 'it is' : 'they are'}.
          </p>
        )}
        {summary.mode === 'replace' && <p className="text-[13.5px] text-ink-2">A copy of what was here before is kept under Automatic copies, and can be restored from there.</p>}
        <Counts counts={summary.added} />
        <div>
          <Button variant="secondary" onClick={() => setStage({ step: 'idle' })}>
            Done
          </Button>
        </div>
      </Card>
    )
  }

  const { prepared, fileName } = stage
  const errors = prepared.problems.filter((problem) => problem.level === 'error')
  const warnings = prepared.problems.filter((problem) => problem.level === 'warning')

  if (!prepared.ok) {
    return (
      <Card className="flex flex-col gap-3" aria-live="polite">
        {picker}
        <p className="text-[15px] font-medium text-risk">Could not import data.</p>
        <p className="truncate text-[12.5px] text-ink-3">{fileName}</p>
        <ul className="flex flex-col gap-1.5 text-[13.5px] leading-relaxed text-ink-2">
          {errors.slice(0, 12).map((problem, i) => (
            <li key={i}>
              {problem.table !== 'file' && <span className="text-ink-3">{tableLabel(problem.table)}: </span>}
              {problem.message}
            </li>
          ))}
          {errors.length > 12 && <li className="text-ink-3">…and {errors.length - 12} more.</li>}
        </ul>
        <p className="text-[12.5px] text-ink-3">Nothing on this device was changed.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="upload" onClick={choose}>
            Choose another file
          </Button>
          <Button variant="ghost" onClick={() => setStage({ step: 'idle' })}>
            Close
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-4" aria-live="polite">
      {picker}
      <div>
        <p className="truncate text-[15px] font-medium text-ink">{fileName}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          {isValidDateStr(prepared.exported_at) ? `Exported ${formatFullDate(prepared.exported_at)}` : 'Export date not recorded'} · {totalOf(prepared.counts).toLocaleString()} records
        </p>
      </div>
      {prepared.upgraded && (
        <p className="rounded-control bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
          This file is from the earlier Habit Tracker. It has been brought up to the current format for this check; every tick in it is kept.
        </p>
      )}
      <Counts counts={prepared.counts} />
      {warnings.length > 0 && (
        <div className="rounded-control bg-warn/10 px-3 py-2.5">
          <p className="text-[13.5px] font-medium text-warn">
            {warnings.length} {warnings.length === 1 ? 'thing' : 'things'} in the file cannot be imported
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-[13px] leading-relaxed text-ink-2">
            {warnings.slice(0, 12).map((problem, i) => (
              <li key={i}>
                <span className="text-ink-3">{tableLabel(problem.table)}: </span>
                {problem.message}
              </li>
            ))}
            {warnings.length > 12 && <li className="text-ink-3">…and {warnings.length - 12} more.</li>}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="primary" block onClick={() => void apply('merge')}>
          Add what is missing
        </Button>
        <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">Adds only records that are not on this device. Anything already here is left exactly as it is, so importing the same file twice changes nothing.</p>
        <Button variant="secondary" block onClick={() => setConfirming(true)}>
          Replace everything on this device…
        </Button>
        <Button variant="ghost" block onClick={() => setStage({ step: 'idle' })}>
          Cancel
        </Button>
      </div>

      <TypedConfirm
        open={confirming}
        title="Replace everything on this device?"
        body={
          <>
            Everything recorded on this device is removed and the contents of <span className="text-ink">{fileName}</span> take its place. A copy of what is here now is taken first and kept under
            Automatic copies.
          </>
        }
        word="REPLACE"
        confirmLabel="Replace everything"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          void apply('replace')
        }}
      />
    </Card>
  )
}
