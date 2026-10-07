import { useEffect, useState } from 'react'
import { db } from '../../data/db'
import { buildExport } from '../../data/importExport'
import type { MigrationRow } from '../../data/types'
import { formatFullDate } from '../../engine/dates'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Button } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { Page } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { BackupsCard } from './BackupsCard'
import { ImportCard } from './ImportCard'
import { canShareFiles, downloadJson, formatBytes, shareJson } from './transfer'

const NO_ROWS: MigrationRow[] = []

const STEP_LABEL: Record<string, string> = {
  '001-cutover': 'Habits moved onto dated chapters',
  '002-training-library': 'Exercise library and programme added',
  '003-quotes': 'Quote library added',
  '004-learning-pillars': 'Learning pillars added',
  '005-weekly-records': 'Weights and weekly notes carried over',
  '006-more-quotes': 'Fifty more quotes added',
  '007-four-pillars': 'Learning pillars set to the four',
}

function ExportCard() {
  const { today } = useCore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [records, setRecords] = useState<number | null>(null)
  const shareable = canShareFiles()
  // On a phone the share sheet is the useful route (Files, AirDrop, mail); with a mouse, a download.
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  useEffect(() => {
    let alive = true
    Promise.all(db.tables.map((table) => table.count()))
      .then((counts) => {
        if (alive) setRecords(counts.reduce((total, count) => total + count, 0))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const run = async (how: 'share' | 'download') => {
    setBusy(true)
    try {
      const json = JSON.stringify(await buildExport(db, today), null, 2)
      const filename = `personal-os-export-${today}.json`
      if (how === 'share') {
        const result = await shareJson(json, filename)
        if (result === 'shared') toast.show('Export handed to the share sheet.', { tone: 'ok' })
        if (result === 'downloaded') toast.show('Sharing did not work, so the export was downloaded instead.')
      } else {
        downloadJson(json, filename)
        toast.show('Download started. Check that the file has arrived before relying on it.')
      }
    } catch {
      toast.show('The export could not be made. Nothing was changed.', { tone: 'risk' })
    } finally {
      setBusy(false)
    }
  }

  const share = (
    <Button key="share" variant={touch ? 'primary' : 'secondary'} icon="upload" disabled={busy} onClick={() => void run('share')}>
      Share export
    </Button>
  )
  const download = (
    <Button key="download" variant={touch && shareable ? 'secondary' : 'primary'} icon="download" disabled={busy} onClick={() => void run('download')}>
      Download export
    </Button>
  )

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        One file with everything: habits and their history, routines, meals, workouts and sets, learning, journal, weekly reviews, quotes and settings.
        {records !== null && ` ${records.toLocaleString()} records right now.`}
      </p>
      <div className="flex flex-wrap gap-2">{shareable ? (touch ? [share, download] : [download, share]) : download}</div>
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Everything lives on this device only. Keep an export somewhere else — a cloud drive, an email to yourself — so losing the phone does not lose the record.
      </p>
    </Card>
  )
}

function StorageCard() {
  const toast = useToast()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const storage = navigator.storage
    storage
      ?.persisted?.()
      .then((value) => {
        if (alive) setPersisted(value)
      })
      .catch(() => undefined)
    storage
      ?.estimate?.()
      .then((estimate) => {
        if (alive && typeof estimate.usage === 'number') setUsage(estimate.usage)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const ask = async () => {
    try {
      const granted = (await navigator.storage?.persist?.()) ?? false
      setPersisted(granted)
      toast.show(granted ? 'The browser will not clear this data on its own.' : 'The browser declined for now. Installing the app to the home screen usually changes that.', granted ? { tone: 'ok' } : undefined)
    } catch {
      toast.show('The browser could not be asked.', { tone: 'risk' })
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13.5px]">
        <dt className="text-ink-2">Protected from automatic clearing</dt>
        <dd className="text-right text-ink">{persisted === null ? 'Unknown' : persisted ? 'Yes' : 'Not yet'}</dd>
        {usage !== null && (
          <>
            <dt className="text-ink-2">Space used, app included</dt>
            <dd className="tnum text-right text-ink">{formatBytes(usage)}</dd>
          </>
        )}
      </dl>
      {persisted === false && (
        <div>
          <Button variant="secondary" size="sm" onClick={() => void ask()}>
            Ask the browser to keep it
          </Button>
        </div>
      )}
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        Removing the app from the home screen, or clearing this site’s data in the browser, deletes everything recorded here. Export first.
      </p>
    </Card>
  )
}

/** Export, import, the automatic copies, and what the browser is doing with the storage. */
export default function DataScreen() {
  const { settings } = useCore()
  const [refreshKey, setRefreshKey] = useState(0)
  const ledger = useLive(() => db.migrations.toArray(), [], NO_ROWS)
  const changed = () => setRefreshKey((key) => key + 1)

  return (
    <Page title="Data" subtitle="Yours, on this device" back="/settings" width="narrow">
      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-2">
          <SectionTitle>Export</SectionTitle>
          <ExportCard />
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Import</SectionTitle>
          <ImportCard onChanged={changed} />
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Automatic copies</SectionTitle>
          <BackupsCard refreshKey={refreshKey} onChanged={changed} />
          <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">
            Taken before a data update and before anything replaces the whole record. The four most recent are kept. They are on this device too, so they do not replace an export.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Storage</SectionTitle>
          <StorageCard />
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>About this record</SectionTitle>
          <Card className="flex flex-col gap-3">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13.5px]">
              <dt className="text-ink-2">Data format</dt>
              <dd className="tnum text-right text-ink">{settings.data_format}</dd>
              <dt className="text-ink-2">Database version</dt>
              <dd className="tnum text-right text-ink">{db.verno}</dd>
              {settings.cutover_date && (
                <>
                  <dt className="text-ink-2">On the current model since</dt>
                  <dd className="text-right text-ink">{formatFullDate(settings.cutover_date)}</dd>
                </>
              )}
            </dl>
            {ledger.length > 0 && (
              <ul className="flex flex-col gap-1 border-t border-line pt-3 text-[12.5px] text-ink-3">
                {[...ledger]
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map((row) => (
                    <li key={row.id} className="flex gap-3">
                      <span className="min-w-0 flex-1 truncate">{STEP_LABEL[row.id] ?? row.id}</span>
                      <span className="shrink-0">{formatFullDate(row.ran_on)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </Page>
  )
}
