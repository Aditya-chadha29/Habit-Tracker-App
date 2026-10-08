import { useMemo, useState } from 'react'
import { goBack, Link, navigate, type RouteProps } from '../../app/router'
import { changeHabit, createHabit, deleteHabitCreatedToday, retireHabit, restoreHabit, updateHabitDetails } from '../../data/habitRepo'
import type { CompletionSource, DateStr, DayRule, Habit, HabitKind, Measure, PeriodTarget } from '../../data/types'
import { WEEKDAY_LONG } from '../../engine/dates'
import { describeFrequency } from '../../engine/describe'
import { currentVersion, isRetired } from '../../engine/timeline'
import { useCore } from '../../state/core'
import { Button } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { cx } from '../../ui/cx'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Select, Stepper, Switch, TextArea, TextInput, WeekdayPicker } from '../../ui/Field'
import { HABIT_ICON_CHOICES, Icon, isIconName } from '../../ui/icons'
import { parseNumber } from '../../ui/numbers'
import { ConfirmationDialog } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'
import { Tick } from '../../ui/Tick'
import { useToast } from '../../ui/Toast'

type Frequency = 'daily' | 'weekdays' | 'times_week' | 'weekly_on' | 'every_n' | 'month_days' | 'times_month' | 'as_needed'

const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Specific weekdays' },
  { id: 'times_week', label: 'A number of times per week' },
  { id: 'weekly_on', label: 'Weekly, on one day' },
  { id: 'every_n', label: 'Every few days' },
  { id: 'month_days', label: 'Monthly, on chosen dates' },
  { id: 'times_month', label: 'A number of times per month' },
  { id: 'as_needed', label: 'As needed (never scored)' },
]

const KINDS = [
  { id: 'habit', label: 'Habit' },
  { id: 'supplement', label: 'Supplement' },
  { id: 'meal', label: 'Meal' },
] as const

const POLARITIES = [
  { id: 'do', label: 'Something to do' },
  { id: 'abstain', label: 'Something to avoid' },
] as const

const MEASURES: { id: Measure['type']; label: string; unit: string }[] = [
  { id: 'boolean', label: 'A plain tick', unit: '' },
  { id: 'count', label: 'A count', unit: 'reps' },
  { id: 'duration', label: 'A duration', unit: 'min' },
  { id: 'numeric', label: 'An amount', unit: '' },
]

const SOURCES: { id: CompletionSource; label: string }[] = [
  { id: 'manual', label: 'Ticking it' },
  { id: 'workout', label: 'Finishing a workout in Train' },
  { id: 'cardio', label: 'A workout that included cardio' },
  { id: 'learning', label: 'A learning session from the queue' },
  { id: 'reading', label: 'A reading session on the active book' },
  { id: 'journal', label: 'Writing in the journal' },
]

interface Form {
  name: string
  short_name: string
  description: string
  kind: HabitKind
  polarity: 'do' | 'abstain'
  area: string
  group: string
  icon: string
  frequency: Frequency
  weekdays: number[]
  weeklyDay: number
  timesWeek: number
  everyN: number
  monthDays: string
  timesMonth: number
  keyTarget: boolean
  keyTargetCount: number
  measure: Measure['type']
  measureTarget: string
  measureUnit: string
  doseAmount: string
  doseUnit: string
  sources: CompletionSource[]
}

function blank(area: string): Form {
  return {
    name: '', short_name: '', description: '', kind: 'habit', polarity: 'do', area, group: '', icon: '', frequency: 'daily',
    weekdays: [0, 2, 4], weeklyDay: 0, timesWeek: 2, everyN: 2, monthDays: '1', timesMonth: 1, keyTarget: false, keyTargetCount: 7,
    measure: 'boolean', measureTarget: '', measureUnit: '', doseAmount: '', doseUnit: '', sources: ['manual'],
  }
}

function fromHabit(habit: Habit): Form {
  const version = currentVersion(habit)
  const form = blank(version.area)
  const { day, target } = version
  let frequency: Frequency = 'daily'
  if (day.kind === 'weekdays') {
    frequency = day.weekdays.length === 1 ? 'weekly_on' : 'weekdays'
    form.weekdays = day.weekdays
    form.weeklyDay = day.weekdays[0] ?? 0
  } else if (day.kind === 'every_n_days') {
    frequency = 'every_n'
    form.everyN = day.n
  } else if (day.kind === 'month_days') {
    frequency = 'month_days'
    form.monthDays = day.days.join(', ')
  } else if (day.kind === 'flexible') {
    frequency = !target ? 'as_needed' : target.per === 'week' ? 'times_week' : 'times_month'
    if (target?.per === 'week') form.timesWeek = target.count
    if (target?.per === 'month') form.timesMonth = target.count
  }
  const measured = habit.measure.type === 'count' || habit.measure.type === 'duration' || habit.measure.type === 'numeric' || habit.measure.type === 'quantity'
  return {
    ...form,
    name: version.name,
    short_name: version.short_name === version.name ? '' : version.short_name,
    description: habit.description,
    kind: habit.kind,
    polarity: habit.polarity,
    group: version.group,
    icon: habit.icon,
    frequency,
    keyTarget: day.kind !== 'flexible' && target !== null,
    keyTargetCount: day.kind !== 'flexible' && target ? target.count : 7,
    measure: measured ? (habit.measure.type === 'quantity' ? 'numeric' : habit.measure.type) : 'boolean',
    measureTarget: habit.measure.target !== null ? String(habit.measure.target) : '',
    measureUnit: habit.measure.unit,
    doseAmount: habit.dose?.amount !== null && habit.dose?.amount !== undefined ? String(habit.dose.amount) : '',
    doseUnit: habit.dose?.unit ?? '',
    sources: [...version.sources],
  }
}

/** The schedule a form describes. Throws a readable message when it cannot be one. */
function scheduleOf(form: Form, today: DateStr, existing: DayRule | null): { day: DayRule; target: PeriodTarget | null } {
  const keyTarget = (max: number): PeriodTarget | null => (form.keyTarget ? { per: 'week', count: Math.min(max, Math.max(1, form.keyTargetCount)) } : null)
  switch (form.frequency) {
    case 'daily':
      return { day: { kind: 'daily' }, target: keyTarget(7) }
    case 'weekdays':
      if (!form.weekdays.length) throw new Error('Choose at least one weekday.')
      return { day: { kind: 'weekdays', weekdays: form.weekdays }, target: keyTarget(form.weekdays.length) }
    case 'weekly_on':
      return { day: { kind: 'weekdays', weekdays: [form.weeklyDay] }, target: null }
    case 'times_week':
      return { day: { kind: 'flexible' }, target: { per: 'week', count: form.timesWeek } }
    case 'times_month':
      return { day: { kind: 'flexible' }, target: { per: 'month', count: form.timesMonth } }
    case 'as_needed':
      return { day: { kind: 'flexible' }, target: null }
    case 'every_n':
      // The rhythm keeps counting from where it started unless the interval itself changes.
      return { day: { kind: 'every_n_days', n: form.everyN, anchor: existing?.kind === 'every_n_days' && existing.n === form.everyN ? existing.anchor : today }, target: null }
    case 'month_days': {
      const days = [...new Set(form.monthDays.split(/[\s,]+/).filter(Boolean).map(Number))].sort((a, b) => a - b)
      if (!days.length || days.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) throw new Error('Enter days of the month between 1 and 31, separated by commas.')
      return { day: { kind: 'month_days', days }, target: null }
    }
  }
}

/** Where a new meal keeps its notes. Never one already in use: two meals must not share a note. */
function freeMealSlot(name: string, habits: readonly Habit[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'meal'
  const taken = new Set(habits.map((habit) => habit.meal_slot))
  let slot = base
  for (let n = 2; taken.has(slot); n++) slot = `${base}-${n}`
  return slot
}

function Editor({ habit }: { habit: Habit | null }) {
  const { today, areas, habits } = useCore()
  const toast = useToast()
  const [form, setForm] = useState<Form>(() => (habit ? fromHabit(habit) : blank(areas[0]?.id ?? 'body')))
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<'retire' | 'delete' | null>(null)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }))
  const retired = habit ? isRetired(habit) : false
  const existingDay = habit ? currentVersion(habit).day : null
  const groupsInUse = useMemo(() => [...new Set(habits.map((h) => currentVersion(h).group).filter(Boolean))].sort(), [habits])
  const fixedDay = form.frequency === 'daily' || form.frequency === 'weekdays'

  const preview = (() => {
    try {
      return describeFrequency(scheduleOf(form, today, existingDay))
    } catch {
      return ''
    }
  })()

  const save = async () => {
    try {
      const name = form.name.trim()
      if (!name) throw new Error('Give it a name.')
      if (!form.sources.length) throw new Error('Choose at least one way it can be completed.')
      const schedule = scheduleOf(form, today, existingDay)
      const target = parseNumber(form.measureTarget)
      const measure: Measure = form.measure === 'boolean' ? { type: 'boolean', target: null, unit: '' } : { type: form.measure, target, unit: form.measureUnit.trim() }
      const dose = form.kind === 'supplement' ? { amount: parseNumber(form.doseAmount), unit: form.doseUnit.trim() } : null
      const versioned = { name, short_name: form.short_name.trim() || undefined, area: form.area, group: form.group.trim(), ...schedule, sources: form.sources }

      if (habit) {
        await changeHabit(habit.id!, versioned, today)
        await updateHabitDetails(habit.id!, { description: form.description.trim(), icon: form.icon, measure, dose, polarity: form.polarity })
        toast.show('Saved. Changes apply from today.', { tone: 'ok' })
      } else {
        await createHabit(
          {
            ...versioned,
            kind: form.kind,
            polarity: form.polarity,
            description: form.description,
            icon: form.icon,
            measure,
            dose,
            meal_slot: form.kind === 'meal' ? freeMealSlot(name, habits) : null,
          },
          today,
        )
        toast.show(`${name} added. It is tracked from today.`, { tone: 'ok' })
      }
      goBack('/habits')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.')
    }
  }

  const confirm = async () => {
    if (!habit) return
    const action = confirming
    setConfirming(null)
    try {
      if (action === 'retire') await retireHabit(habit.id!, today)
      if (action === 'delete') await deleteHabitCreatedToday(habit.id!, today)
      navigate('/habits', { replace: true })
    } catch (problem) {
      toast.show(problem instanceof Error ? problem.message : 'That could not be done.', { tone: 'risk' })
    }
  }

  return (
    <Page
      title={habit ? habit.name : 'New habit'}
      subtitle={habit ? (retired ? 'Retired' : 'Changes apply from today') : 'Tracked from today'}
      back="/habits"
      width="narrow"
      actions={
        <Button variant="primary" size="sm" onClick={save}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {error && (
          <p role="alert" className="rounded-control bg-risk/12 px-3 py-2.5 text-[13.5px] text-risk">
            {error}
          </p>
        )}

        <section className="flex flex-col gap-4">
          <SectionTitle>Basics</SectionTitle>
          {!habit && (
            <Field label="Kind" hint="A supplement has a dose; a meal has a place to write what was eaten. This cannot be changed later.">
              <Segmented options={KINDS} value={form.kind} onChange={(kind) => set('kind', kind)} label="Kind" block />
            </Field>
          )}
          <Field label="Name">
            <TextInput value={form.name} onChange={(event) => set('name', event.target.value)} maxLength={60} placeholder={form.kind === 'supplement' ? 'Creatine' : form.kind === 'meal' ? 'Breakfast' : 'Meditation'} />
          </Field>
          <Field label="Short name" hint="Optional. Used where space is tight.">
            <TextInput value={form.short_name} onChange={(event) => set('short_name', event.target.value)} maxLength={22} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pillar">
              <Select value={form.area} onChange={(event) => set('area', event.target.value)}>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Group" hint="Optional sub-heading.">
              <TextInput value={form.group} onChange={(event) => set('group', event.target.value)} maxLength={30} list="habit-groups" placeholder="Grooming" />
              <datalist id="habit-groups">
                {groupsInUse.map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </Field>
          </div>
          {form.kind === 'habit' && (
            <Field label="This is" hint="For something to avoid, a done day reads “held” and a miss reads “broken”.">
              <Segmented options={POLARITIES} value={form.polarity} onChange={(polarity) => set('polarity', polarity)} label="Do or avoid" block />
            </Field>
          )}
          <Field label="Description" hint="Optional.">
            <TextArea autoGrow rows={2} value={form.description} onChange={(event) => set('description', event.target.value)} />
          </Field>
          <Field label="Icon">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Icon">
              {HABIT_ICON_CHOICES.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  aria-pressed={form.icon === name}
                  onClick={() => set('icon', form.icon === name ? '' : name)}
                  className={cx(
                    'flex h-11 w-11 cursor-pointer items-center justify-center rounded-control transition-colors duration-100',
                    form.icon === name ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-2 hover:bg-surface-3',
                  )}
                >
                  <Icon name={isIconName(name) ? name : 'check'} size={18} />
                </button>
              ))}
            </div>
          </Field>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle>How often</SectionTitle>
          <Field label="Frequency" hint={preview ? `Reads as: ${preview}` : undefined}>
            <Select value={form.frequency} onChange={(event) => set('frequency', event.target.value as Frequency)}>
              {FREQUENCIES.map((frequency) => (
                <option key={frequency.id} value={frequency.id}>
                  {frequency.label}
                </option>
              ))}
            </Select>
          </Field>
          {form.frequency === 'weekdays' && (
            <Field label="On these days">
              <WeekdayPicker label="Days of the week" value={form.weekdays} onChange={(days) => set('weekdays', days)} />
            </Field>
          )}
          {form.frequency === 'weekly_on' && (
            <Field label="Day">
              <Select value={form.weeklyDay} onChange={(event) => set('weeklyDay', Number(event.target.value))}>
                {WEEKDAY_LONG.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {form.frequency === 'times_week' && (
            <Field label="Times per week" hint="Done on any days you choose. Never counted as missed on a particular day; judged when the week ends.">
              <Stepper label="Times per week" value={form.timesWeek} onChange={(value) => set('timesWeek', value)} min={1} max={7} />
            </Field>
          )}
          {form.frequency === 'times_month' && (
            <Field label="Times per month" hint="Judged when the month ends.">
              <Stepper label="Times per month" value={form.timesMonth} onChange={(value) => set('timesMonth', value)} min={1} max={31} />
            </Field>
          )}
          {form.frequency === 'every_n' && (
            <Field label="Every how many days" hint="Counted from today, or from when this interval was first set.">
              <Stepper label="Interval in days" value={form.everyN} onChange={(value) => set('everyN', value)} min={2} max={90} unit="days" />
            </Field>
          )}
          {form.frequency === 'month_days' && (
            <Field label="Days of the month" hint="For example 1, 15. A day past the end of a short month falls on its last day.">
              <TextInput value={form.monthDays} onChange={(event) => set('monthDays', event.target.value)} inputMode="numeric" />
            </Field>
          )}
          {fixedDay && (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] text-ink">Show as a key weekly target</span>
                  <span className="block text-[12.5px] text-ink-3">Lists it under “This week” on Home and in the weekly review.</span>
                </span>
                <Switch label="Key weekly target" checked={form.keyTarget} onChange={(value) => set('keyTarget', value)} />
              </div>
              {form.keyTarget && (
                <Stepper
                  label="Target per week"
                  value={form.keyTargetCount}
                  onChange={(value) => set('keyTargetCount', value)}
                  min={1}
                  max={form.frequency === 'weekdays' ? Math.max(1, form.weekdays.length) : 7}
                  unit="per week"
                />
              )}
            </Card>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle>What one completion records</SectionTitle>
          {form.kind === 'supplement' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dose">
                <TextInput inputMode="decimal" value={form.doseAmount} onChange={(event) => set('doseAmount', event.target.value)} placeholder="5" />
              </Field>
              <Field label="Unit">
                <TextInput value={form.doseUnit} onChange={(event) => set('doseUnit', event.target.value)} placeholder="g" maxLength={16} />
              </Field>
            </div>
          ) : form.kind === 'meal' ? (
            <p className="text-[13.5px] text-ink-3">A tick, a description of what was eaten, and whether it was eaten out.</p>
          ) : (
            <>
              <Field label="Recorded as">
                <Select
                  value={form.measure}
                  onChange={(event) => {
                    const next = event.target.value as Measure['type']
                    setForm((current) => ({ ...current, measure: next, measureUnit: current.measureUnit || MEASURES.find((m) => m.id === next)?.unit || '' }))
                  }}
                >
                  {MEASURES.map((measure) => (
                    <option key={measure.id} value={measure.id}>
                      {measure.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {form.measure !== 'boolean' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Counts as done at" hint="One tap records this.">
                    <TextInput inputMode="decimal" value={form.measureTarget} onChange={(event) => set('measureTarget', event.target.value)} placeholder="10" />
                  </Field>
                  <Field label="Unit">
                    <TextInput value={form.measureUnit} onChange={(event) => set('measureUnit', event.target.value)} maxLength={16} />
                  </Field>
                </div>
              )}
            </>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>What completes it</SectionTitle>
          <Card padded={false} className="divide-y divide-line overflow-hidden">
            {SOURCES.map((source) => {
              const on = form.sources.includes(source.id)
              return (
                <div key={source.id} className="flex min-h-[48px] items-center gap-3 pr-1 pl-4">
                  <span className="min-w-0 flex-1 text-[14px] text-ink">{source.label}</span>
                  <Tick
                    checked={on}
                    label={source.label}
                    onChange={(next) => set('sources', next ? [...form.sources, source.id] : form.sources.filter((id) => id !== source.id))}
                  />
                </div>
              )
            })}
          </Card>
          <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">
            Any one of these is enough. Without “Ticking it”, the habit cannot be ticked by hand: it is completed only by the session.
          </p>
        </section>


        <p className="rounded-control bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
          {habit ? 'Saving applies from today. Earlier days keep the name, schedule and record they had.' : 'A new habit is tracked from today. Days before today are not counted against it.'}
        </p>

        {habit && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link to={`/progress/habit/${habit.id}`} className="inline-flex h-11 items-center rounded-control px-4 text-[14px] font-medium text-accent-ink hover:bg-surface-2">
              History
            </Link>
            {retired ? (
              <Button
                variant="secondary"
                onClick={() =>
                  restoreHabit(habit.id!, today)
                    .then(() => navigate('/habits', { replace: true }))
                    .catch(() => toast.show('That could not be restored.', { tone: 'risk' }))
                }
              >
                Restore from today
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming('retire')}>
                Retire
              </Button>
            )}
            {habit.created_on === today && (
              <Button variant="danger" onClick={() => setConfirming('delete')}>
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={confirming === 'retire'}
        title={`Retire ${habit?.name ?? ''}?`}
        body="From today it leaves Today and every score. Everything recorded so far stays exactly as it is, and it can be restored at any time from the Retired list."
        confirmLabel="Retire"
        onCancel={() => setConfirming(null)}
        onConfirm={confirm}
      />
      <ConfirmationDialog
        open={confirming === 'delete'}
        title={`Delete ${habit?.name ?? ''}?`}
        body="It was created today, so no finished day depends on it. Deleting removes it and anything ticked for it today. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setConfirming(null)}
        onConfirm={confirm}
      />
    </Page>
  )
}

/** Create a habit (`/habits/new`) or change one. Everything that is part of a habit's history —
 *  name, pillar, schedule, target, what completes it — is saved as a new chapter starting today. */
export default function HabitEditorScreen({ params }: RouteProps) {
  const { habits } = useCore()
  if (params.id === 'new') return <Editor key="new" habit={null} />
  const habit = habits.find((candidate) => candidate.id === Number(params.id))
  if (!habit) {
    return (
      <Page title="Habit" back="/habits">
        <EmptyState title="That habit does not exist." />
      </Page>
    )
  }
  return <Editor key={habit.id} habit={habit} />
}
