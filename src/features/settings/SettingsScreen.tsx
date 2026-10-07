import { useMemo, useState, type ReactNode } from 'react'
import { Link } from '../../app/router'
import { saveSettings } from '../../data/settingsRepo'
import type { AreaConfig, Settings, ThemePreference } from '../../data/types'
import { formatMediumDate, WEEKDAY_LONG } from '../../engine/dates'
import { isRetired } from '../../engine/timeline'
import { useCore } from '../../state/core'
import { IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { areaTone, toneSolid } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { Field, Select, Stepper, TextArea, TextInput } from '../../ui/Field'
import { Icon, type IconName } from '../../ui/icons'
import { ConfirmationDialog } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'

type Save = (patch: Partial<Settings>) => void

const THEMES: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

const UNITS = [
  { id: 'kg', label: 'kg' },
  { id: 'lb', label: 'lb' },
] as const

function hourLabel(hour: number): string {
  if (hour === 0) return 'Midnight'
  if (hour === 12) return 'Noon'
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
      <span className="min-w-[150px] flex-1">
        <span className="block text-[14px] text-ink">{title}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{hint}</span>}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>{title}</SectionTitle>
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {children}
      </Card>
    </section>
  )
}

function NavRow({ to, icon, title, hint }: { to: string; icon: IconName; title: string; hint: string }) {
  return (
    <Link to={to} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 transition-colors duration-100 hover:bg-surface-2">
      <Icon name={icon} size={18} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-ink">{title}</span>
        <span className="block truncate text-[12.5px] text-ink-3">{hint}</span>
      </span>
      <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />
    </Link>
  )
}

function Profile({ settings, save, summary }: { settings: Settings; save: Save; summary: string }) {
  const [name, setName] = useState(settings.name)
  const [focus, setFocus] = useState(settings.focus)
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Profile</SectionTitle>
      <Card className="flex flex-col gap-4">
        <Field label="Name" hint="Used in the greeting on Home.">
          <TextInput
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (name.trim() !== settings.name) save({ name: name.trim() })
            }}
          />
        </Field>
        <Field label="What I am working toward" hint="One line, in your own words.">
          <TextArea
            autoGrow
            rows={2}
            value={focus}
            maxLength={200}
            onChange={(event) => setFocus(event.target.value)}
            onBlur={() => {
              if (focus.trim() !== settings.focus) save({ focus: focus.trim() })
            }}
          />
        </Field>
        <p className="text-[12.5px] text-ink-3">{summary}</p>
      </Card>
    </section>
  )
}

function Pillars({ areas, save }: { areas: AreaConfig[]; save: Save }) {
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(areas.map((area) => [area.id, area.label])))
  const commit = (next: AreaConfig[]) => save({ areas: next.map((area, i) => ({ ...area, sort_order: i })) })
  const swap = (i: number, j: number) => {
    const next = [...areas]
    ;[next[i], next[j]] = [next[j], next[i]]
    commit(next)
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Pillars</SectionTitle>
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {areas.map((area, i) => (
          <div key={area.id} className="flex min-h-[60px] items-center gap-2 py-2 pr-1 pl-4">
            <span aria-hidden="true" className={cx('h-2.5 w-2.5 shrink-0 rounded-full', toneSolid(areaTone(area.color)))} />
            <TextInput
              aria-label={`Name of the ${area.label} pillar`}
              value={labels[area.id] ?? area.label}
              maxLength={24}
              className="min-w-0 flex-1"
              onChange={(event) => setLabels((current) => ({ ...current, [area.id]: event.target.value }))}
              onBlur={() => {
                const label = (labels[area.id] ?? '').trim()
                if (!label) setLabels((current) => ({ ...current, [area.id]: area.label }))
                else if (label !== area.label) commit(areas.map((a) => (a.id === area.id ? { ...a, label } : a)))
              }}
            />
            <IconButton icon="chevron-up" label={`Move ${area.label} up`} size="sm" variant="ghost" disabled={i === 0} onClick={() => swap(i, i - 1)} />
            <IconButton icon="chevron-down" label={`Move ${area.label} down`} size="sm" variant="ghost" disabled={i === areas.length - 1} onClick={() => swap(i, i + 1)} />
          </div>
        ))}
      </Card>
      <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">Renaming a pillar renames it everywhere, past weeks included. Which pillar a habit belongs to is set on the habit.</p>
    </section>
  )
}

/**
 * Everything adjustable that is not a habit, a routine or a programme. Each control saves as it is
 * changed; there is no Save button to forget.
 */
export default function SettingsScreen() {
  const { settings, areas, habits } = useCore()
  const toast = useToast()
  const [pendingWeekStart, setPendingWeekStart] = useState<number | null>(null)
  const save: Save = (patch) => {
    saveSettings(patch).catch(() => toast.show('That setting could not be saved.', { tone: 'risk' }))
  }

  const summary = useMemo(() => {
    const active = habits.filter((habit) => !isRetired(habit)).length
    const first = habits.reduce<string | null>((earliest, habit) => (earliest === null || habit.created_on < earliest ? habit.created_on : earliest), null)
    return first ? `${active} active habits · tracking since ${formatMediumDate(first)}` : `${active} active habits`
  }, [habits])

  const editDays = settings.edit_window_days

  return (
    <Page title="Settings" subtitle="Saved as you change them" width="narrow">
      <div className="flex flex-col gap-7">
        <Profile settings={settings} save={save} summary={summary} />

        <Group title="Appearance">
          <Row title="Theme" hint="System follows the device.">
            <Segmented options={THEMES} value={settings.theme} onChange={(theme) => save({ theme })} label="Theme" size="sm" />
          </Row>
        </Group>

        <Group title="Weeks and days">
          <Row title="Week starts on">
            <span className="block w-[156px]">
              <Select aria-label="Week starts on" value={settings.week_start} onChange={(event) => setPendingWeekStart(Number(event.target.value))}>
                {WEEKDAY_LONG.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </Select>
            </span>
          </Row>
          <Row title="A new day begins at" hint="If you are often up past midnight, set this later so those hours still count for the day before.">
            <span className="block w-[156px]">
              <Select aria-label="A new day begins at" value={settings.day_start_hour} onChange={(event) => save({ day_start_hour: Number(event.target.value) })}>
                {[0, 1, 2, 3, 4, 5, 6].map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </Select>
            </span>
          </Row>
          <Row title="Weekly review day" hint="The day the review of the week is put forward.">
            <span className="block w-[156px]">
              <Select aria-label="Weekly review day" value={settings.review_day} onChange={(event) => save({ review_day: Number(event.target.value) })}>
                {WEEKDAY_LONG.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </Select>
            </span>
          </Row>
          <Row title="Evening starts at" hint="From this hour, Home points out what is still open today.">
            <span className="block w-[156px]">
              <Select aria-label="Evening starts at" value={settings.evening_hour} onChange={(event) => save({ evening_hour: Number(event.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 12).map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </Select>
            </span>
          </Row>
        </Group>

        <Group title="History">
          <Row
            title="Days that can be corrected"
            hint={editDays === 1 ? 'Only today can be changed. Every earlier day is locked.' : `Today and the ${editDays - 1} ${editDays === 2 ? 'day' : 'days'} before it can be changed. Older days are locked.`}
          >
            <Stepper label="Days that can be corrected" value={editDays} onChange={(value) => save({ edit_window_days: value })} min={1} max={60} unit="days" />
          </Row>
        </Group>

        <Group title="Training">
          <Row title="Weight unit" hint="Body weight and lifts. Stored in kilograms either way.">
            <Segmented options={UNITS} value={settings.weight_unit} onChange={(unit) => save({ weight_unit: unit })} label="Weight unit" size="sm" />
          </Row>
          <Row title="Default step between loads" hint="Used for an exercise that has no step of its own.">
            <Stepper
              label="Default load step in kilograms"
              value={settings.default_increment_kg}
              onChange={(value) => save({ default_increment_kg: value })}
              step={0.5}
              min={0.5}
              max={50}
              unit="kg"
            />
          </Row>
          <Row title="Default rest" hint="The rest timer runs only while the app is open on screen.">
            <Stepper label="Default rest in seconds" value={settings.default_rest_seconds} onChange={(value) => save({ default_rest_seconds: value })} step={15} min={15} max={900} unit="sec" />
          </Row>
          <NavRow to="/train/setup" icon="train" title="Exercises and programme" hint="Routines, which days, the exercise library" />
        </Group>

        <Group title="Learning">
          <Row
            title="Point out a stalled resource after"
            hint={settings.learning_stale_days === 0 ? 'Never pointed out.' : 'Counted from the day it was started.'}
          >
            <Stepper label="Days before a resource counts as stalled" value={settings.learning_stale_days} onChange={(value) => save({ learning_stale_days: value })} min={0} max={365} unit="days" />
          </Row>
          <NavRow to="/learn/library" icon="library" title="Library and pillars" hint="Everything saved to learn from" />
        </Group>

        <Pillars key={areas.map((area) => `${area.id}:${area.label}`).join('|')} areas={areas} save={save} />

        <Group title="Set up">
          <NavRow to="/habits" icon="habits" title="Habits" hint="Add, change, reorder, retire" />
          <NavRow to="/routines" icon="routines" title="Routines" hint="The order of a normal day" />
          <NavRow to="/quotes" icon="quotes" title="Quotes" hint="The library and how the daily quote is chosen" />
          <NavRow to="/journal" icon="journal" title="Journal" hint="Its prompts are changed from the journal itself" />
          <NavRow to="/data" icon="data" title="Data" hint="Export, import, automatic copies" />
        </Group>
      </div>

      <ConfirmationDialog
        open={pendingWeekStart !== null}
        title={`Start the week on ${WEEKDAY_LONG[pendingWeekStart ?? 0]}?`}
        body="Every week, past ones included, is regrouped to start on that day, so weekly scores and targets will read differently. Weekly reviews already written stay saved under the week they were written for and are shown again if you switch back."
        confirmLabel="Change"
        onCancel={() => setPendingWeekStart(null)}
        onConfirm={() => {
          if (pendingWeekStart !== null) save({ week_start: pendingWeekStart })
          setPendingWeekStart(null)
        }}
      />
    </Page>
  )
}
