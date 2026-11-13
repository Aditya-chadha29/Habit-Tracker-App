import { useMemo, useState } from 'react'
import { Link } from '../../app/router'
import { db } from '../../data/db'
import { saveSettings } from '../../data/settingsRepo'
import type { DateStr, WeightEntry } from '../../data/types'
import { addWeight, deleteWeight, sortWeights, toDisplay, toKg, updateWeight } from '../../data/weightRepo'
import { addDays, formatMediumDate, formatShortDate, relativeDayLabel } from '../../engine/dates'
import { firstEditableDate, isEditable } from '../../engine/lock'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Button, IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { LineChart } from '../../ui/Charts'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Select, TextInput } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { MetricCard } from '../../ui/Metric'
import { parseNumber } from '../../ui/numbers'
import { ConfirmationDialog, Modal } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'

const SPANS = [
  { id: '30', label: '30D' },
  { id: '90', label: '90D' },
  { id: '182', label: '6M' },
  { id: '365', label: '1Y' },
  { id: 'all', label: 'All' },
] as const

const NONE: WeightEntry[] = []
/** How many weigh-ins the trend line averages over. */
const AVERAGE_OVER = 7

/** Body weight over time. Not a daily requirement — a record to look back on. */
export default function WeightScreen() {
  const { today, settings, write } = useCore()
  const toast = useToast()
  const unit = settings.weight_unit
  const all = useLive(() => db.weight_entries.toArray(), [], NONE)
  const entries = useMemo(() => sortWeights(all), [all])
  const [span, setSpan] = useState<(typeof SPANS)[number]['id']>('90')
  const [date, setDate] = useState<DateStr>(today)
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<WeightEntry | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editNote, setEditNote] = useState('')
  const [removing, setRemoving] = useState<WeightEntry | null>(null)

  const first = firstEditableDate(today, settings.edit_window_days)
  const days: DateStr[] = []
  for (let day = today; day >= first; day = addDays(day, -1)) days.push(day)
  const from = span === 'all' ? '' : addDays(today, -Number(span))
  const shown = entries.filter((entry) => entry.date >= from)
  const latest = entries[entries.length - 1]
  const before = entries[entries.length - 2]
  const change = latest && before ? Math.round((toDisplay(latest.kg, unit) - toDisplay(before.kg, unit)) * 10) / 10 : null
  const spanChange = shown.length >= 2 ? Math.round((toDisplay(shown[shown.length - 1].kg, unit) - toDisplay(shown[0].kg, unit)) * 10) / 10 : null
  const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`
  const goal = settings.goal_weight_kg
  // The average of each weigh-in and the six before it: the line under the day-to-day noise.
  const averageAt = (entry: WeightEntry): number | null => {
    const at = entries.indexOf(entry)
    if (at < AVERAGE_OVER - 1) return null
    const window = entries.slice(at - AVERAGE_OVER + 1, at + 1)
    return toDisplay(window.reduce((total, row) => total + row.kg, 0) / window.length, unit)
  }
  const saveGoal = (raw: string) => {
    const parsed = raw.trim() ? parseNumber(raw) : null
    const kg = parsed === null ? null : toKg(parsed, unit)
    if (kg !== null && (kg < 20 || kg > 400)) return toast.show('That goal does not look right.', { tone: 'risk' })
    if (kg !== goal) saveSettings({ goal_weight_kg: kg }).catch(() => toast.show('The goal could not be saved.', { tone: 'risk' }))
  }

  const add = async () => {
    const parsed = parseNumber(value)
    if (parsed === null) {
      setError('Enter a number, for example 70.8.')
      return
    }
    try {
      await addWeight({ date, kg: toKg(parsed, unit), note }, write, Date.now())
      setValue('')
      setNote('')
      setError('')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.')
    }
  }

  const saveEdit = async () => {
    const parsed = parseNumber(editValue)
    if (!editing || parsed === null) return
    try {
      await updateWeight(editing.id!, { kg: toKg(parsed, unit), note: editNote }, write)
      setEditing(null)
    } catch (problem) {
      toast.show(problem instanceof Error ? problem.message : 'That could not be saved.', { tone: 'risk' })
    }
  }

  return (
    <Page title="Body weight" subtitle={`${entries.length} ${entries.length === 1 ? 'weigh-in' : 'weigh-ins'}`} back="/progress" width="default">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Current" value={latest ? toDisplay(latest.kg, unit) : '—'} unit={latest ? unit : undefined} hint={latest ? formatMediumDate(latest.date) : 'No weigh-in yet'} />
            <MetricCard label="Change" value={change === null ? '—' : signed(change)} unit={change === null ? undefined : unit} hint="since the one before" />
            <MetricCard label="Before" value={before ? toDisplay(before.kg, unit) : '—'} unit={before ? unit : undefined} hint={before ? formatMediumDate(before.date) : undefined} />
          </div>

          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="eyebrow min-w-0 flex-1">Weight ({unit})</h2>
              <Segmented options={SPANS} value={span} onChange={setSpan} label="Period" size="sm" />
            </div>
            {shown.length >= 2 ? (
              <>
                <LineChart
                  series={[
                    { label: 'Weight', tone: 'accent', points: shown.map((entry) => ({ x: entry.date, y: toDisplay(entry.kg, unit) })) },
                    ...(shown.length >= AVERAGE_OVER ? [{ label: `Average of ${AVERAGE_OVER}`, tone: 'neutral' as const, points: shown.map((entry) => ({ x: entry.date, y: averageAt(entry) })) }] : []),
                    ...(goal !== null ? [{ label: 'Goal', tone: 'warn' as const, points: shown.map((entry) => ({ x: entry.date, y: toDisplay(goal, unit) })) }] : []),
                  ]}
                  xFormat={formatShortDate}
                  yFormat={(v) => `${Math.round(v * 10) / 10}`}
                  height={220}
                  label={`Body weight across ${shown.length} weigh-ins`}
                />
                {spanChange !== null && (
                  <p className="text-[13px] text-ink-2">
                    {spanChange === 0 ? 'Unchanged' : `${signed(spanChange)} ${unit}`} across {shown.length} weigh-ins in this period.
                  </p>
                )}
              </>
            ) : (
              <p className="py-6 text-[13.5px] text-ink-3">Need more history. A line appears with two weigh-ins in the period; {shown.length} so far.</p>
            )}
            <label className="flex items-center gap-3 border-t border-line pt-3 text-[13.5px] text-ink-2">
              <span className="min-w-0 flex-1">Goal weight ({unit}), drawn as a line</span>
              <input
                key={`${goal}-${unit}`}
                type="text"
                inputMode="decimal"
                defaultValue={goal === null ? '' : String(toDisplay(goal, unit))}
                placeholder="None"
                aria-label={`Goal weight in ${unit}`}
                onBlur={(event) => saveGoal(event.target.value)}
                className="tnum h-11 w-24 rounded-control bg-surface-2 px-3 text-right text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
              />
            </label>
          </Card>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <Card className="flex flex-col gap-4">
            <h2 className="eyebrow">Add a weigh-in</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Weight (${unit})`} error={error || undefined}>
                <TextInput inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder={unit === 'kg' ? '70.8' : '156.0'} />
              </Field>
              <Field label="Day">
                <Select value={date} onChange={(event) => setDate(event.target.value)}>
                  {days.map((day) => (
                    <option key={day} value={day}>
                      {relativeDayLabel(day, today)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Note" hint="Optional.">
              <TextInput value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} />
            </Field>
            <Button variant="primary" onClick={add} disabled={!value.trim()}>
              Add weigh-in
            </Button>
          </Card>

          <Link to="/progress/measurements" className="inline-flex min-h-11 items-center self-start px-1 text-[13.5px] font-medium text-cream underline underline-offset-2">
            Body measurements
          </Link>

          <section className="flex flex-col gap-2">
            <SectionTitle>Weigh-ins</SectionTitle>
            {entries.length === 0 ? (
              <EmptyState icon="scale" title="No weigh-ins yet." body="Add one above. Once a week is enough for a trend." />
            ) : (
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {[...entries].reverse().slice(0, 60).map((entry) => {
                  const editable = isEditable(entry.date, today, settings.edit_window_days)
                  return (
                    <div key={entry.id} className="flex min-h-[52px] items-center gap-2 py-1.5 pr-1 pl-4">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] text-ink">{formatMediumDate(entry.date)} {entry.date.slice(0, 4)}</span>
                        {entry.note && <span className="block truncate text-[12.5px] text-ink-3">{entry.note}</span>}
                      </span>
                      <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                        {toDisplay(entry.kg, unit)} <span className="text-[12px] font-medium text-ink-3">{unit}</span>
                      </span>
                      {editable ? (
                        <>
                          <IconButton
                            icon="edit"
                            size="sm"
                            label={`Correct the weigh-in of ${formatMediumDate(entry.date)}`}
                            onClick={() => {
                              setEditing(entry)
                              setEditValue(String(toDisplay(entry.kg, unit)))
                              setEditNote(entry.note)
                            }}
                          />
                          <IconButton icon="close" size="sm" label={`Remove the weigh-in of ${formatMediumDate(entry.date)}`} onClick={() => setRemoving(entry)} />
                        </>
                      ) : (
                        <span className="flex h-9 w-[72px] items-center justify-end pr-3 text-ink-3">
                          <Icon name="lock" size={13} label="Locked" />
                        </span>
                      )}
                    </div>
                  )
                })}
              </Card>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Correct a weigh-in"
        size="sm"
        footer={
          <Button variant="primary" onClick={saveEdit}>
            Save
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={`Weight (${unit})`}>
            <TextInput inputMode="decimal" value={editValue} onChange={(event) => setEditValue(event.target.value)} />
          </Field>
          <Field label="Note">
            <TextInput value={editNote} onChange={(event) => setEditNote(event.target.value)} maxLength={120} />
          </Field>
        </div>
      </Modal>
      <ConfirmationDialog
        open={removing !== null}
        title="Remove this weigh-in?"
        body={removing ? `${toDisplay(removing.kg, unit)} ${unit} on ${formatMediumDate(removing.date)} will be removed from the record.` : undefined}
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const entry = removing
          setRemoving(null)
          if (entry) deleteWeight(entry.id!, write).catch(() => toast.show('That could not be removed.', { tone: 'risk' }))
        }}
      />
    </Page>
  )
}
