import { useState } from 'react'
import { db } from '../../data/db'
import { addMeasurement, deleteMeasurement } from '../../data/measurementRepo'
import type { DateStr, Measurement } from '../../data/types'
import { addDays, formatMediumDate, formatShortDate, relativeDayLabel } from '../../engine/dates'
import { firstEditableDate, isEditable } from '../../engine/lock'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Button, IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { LineChart } from '../../ui/Charts'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Select, TextInput } from '../../ui/Field'
import { parseNumber } from '../../ui/numbers'
import { Page } from '../../ui/Page'

const NONE: Measurement[] = []
const MEASURES = [
  { key: 'waist_cm', label: 'Waist' },
  { key: 'chest_cm', label: 'Chest' },
  { key: 'arm_cm', label: 'Arm' },
] as const
type MeasureKey = (typeof MEASURES)[number]['key']

/** Waist, chest and arm in centimetres, over time. A record to look back on, never a requirement. */
export default function MeasurementsScreen() {
  const { today, settings, write } = useCore()
  const all = useLive(() => db.measurements.toArray(), [], NONE)
  const rows = [...all].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at - b.created_at))
  const [date, setDate] = useState<DateStr>(today)
  const [values, setValues] = useState<Record<MeasureKey, string>>({ waist_cm: '', chest_cm: '', arm_cm: '' })
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const first = firstEditableDate(today, settings.edit_window_days)
  const days: DateStr[] = []
  for (let day = today; day >= first; day = addDays(day, -1)) days.push(day)

  const add = async () => {
    const parsed = Object.fromEntries(MEASURES.map(({ key }) => [key, values[key].trim() ? parseNumber(values[key]) : null])) as Record<MeasureKey, number | null>
    if (MEASURES.some(({ key }) => values[key].trim() && parsed[key] === null)) {
      setError('Enter numbers in centimetres, for example 84.5.')
      return
    }
    try {
      await addMeasurement({ date, ...parsed, note }, write, Date.now())
      setValues({ waist_cm: '', chest_cm: '', arm_cm: '' })
      setNote('')
      setError('')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.')
    }
  }

  return (
    <Page title="Body measurements" subtitle={`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · centimetres`} back="/progress/weight" width="narrow">
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <h2 className="eyebrow">Add measurements</h2>
          <div className="grid grid-cols-3 gap-3">
            {MEASURES.map(({ key, label }) => (
              <Field key={key} label={`${label} (cm)`}>
                <TextInput inputMode="decimal" value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} />
              </Field>
            ))}
          </div>
          <Field label="Day" error={error || undefined}>
            <Select value={date} onChange={(event) => setDate(event.target.value)}>
              {days.map((day) => (
                <option key={day} value={day}>
                  {relativeDayLabel(day, today)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" hint="Optional.">
            <TextInput value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} />
          </Field>
          <Button variant="primary" onClick={add} disabled={!MEASURES.some(({ key }) => values[key].trim())}>
            Add measurements
          </Button>
        </Card>

        {MEASURES.map(({ key, label }) => {
          const points = rows.filter((row) => typeof row[key] === 'number').map((row) => ({ x: row.date, y: row[key] as number }))
          if (points.length < 2) return null
          return (
            <Card key={key} className="flex flex-col gap-3">
              <h2 className="eyebrow">{label} (cm)</h2>
              <LineChart series={[{ label, tone: 'accent', points }]} xFormat={formatShortDate} yFormat={(v) => `${Math.round(v * 10) / 10}`} height={180} label={`${label} across ${points.length} entries`} />
            </Card>
          )
        })}

        <section className="flex flex-col gap-2">
          <SectionTitle>Entries</SectionTitle>
          {rows.length === 0 ? (
            <EmptyState icon="scale" title="No measurements yet." body="Once a month is enough to see a change. A line appears from the second entry." />
          ) : (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {[...rows].reverse().map((row) => (
                <div key={row.id} className="flex min-h-[52px] items-center gap-2 py-1.5 pr-1 pl-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-ink">
                      {formatMediumDate(row.date)} {row.date.slice(0, 4)}
                    </span>
                    <span className="tnum block truncate text-[12.5px] text-ink-3">
                      {MEASURES.filter(({ key }) => typeof row[key] === 'number')
                        .map(({ key, label }) => `${label} ${row[key]}`)
                        .join(' · ')}
                      {row.note ? ` · ${row.note}` : ''}
                    </span>
                  </span>
                  {isEditable(row.date, today, settings.edit_window_days) && (
                    <IconButton icon="close" label={`Remove the measurements of ${formatMediumDate(row.date)}`} onClick={() => deleteMeasurement(row.id!, write).catch(() => setError('That could not be removed.'))} />
                  )}
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </Page>
  )
}
