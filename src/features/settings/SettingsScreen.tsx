import { useState, type ReactNode } from 'react'
import { Link } from '../../app/router'
import { saveSettings } from '../../data/settingsRepo'
import type { Settings, ThemePreference } from '../../data/types'
import { WEEKDAY_LONG } from '../../engine/dates'
import { useCore } from '../../state/core'
import { Card, SectionTitle } from '../../ui/Card'
import { Select, Stepper } from '../../ui/Field'
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

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-4 py-1.5">
      <span className="min-w-0 flex-1 text-[14px] leading-snug text-ink">{title}</span>
      <span className="shrink-0">{children}</span>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <SectionTitle>{title}</SectionTitle>
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {children}
      </Card>
    </section>
  )
}

function NavRow({ to, icon, title }: { to: string; icon: IconName; title: string }) {
  return (
    <Link to={to} className="flex min-h-[48px] items-center gap-3 px-4 py-1.5 transition-colors duration-100 hover:bg-surface-2">
      <Icon name={icon} size={18} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{title}</span>
      <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />
    </Link>
  )
}

/**
 * Everything adjustable that is not a habit, a routine or a programme. Each control saves as it is
 * changed; there is no Save button to forget.
 */
export default function SettingsScreen() {
  const { settings } = useCore()
  const toast = useToast()
  const [pendingWeekStart, setPendingWeekStart] = useState<number | null>(null)
  const save: Save = (patch) => {
    saveSettings(patch).catch(() => toast.show('That setting could not be saved.', { tone: 'risk' }))
  }

  const editDays = settings.edit_window_days

  return (
    <Page title="Settings" width="narrow">
      <div className="flex flex-col gap-5">
        <Group title="General">
          <Row title="Theme">
            <Segmented options={THEMES} value={settings.theme} onChange={(theme) => save({ theme })} label="Theme" size="sm" />
          </Row>
          <Row title="Week starts on">
            <span className="block w-[136px]">
              <Select aria-label="Week starts on" value={settings.week_start} onChange={(event) => setPendingWeekStart(Number(event.target.value))}>
                {WEEKDAY_LONG.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </Select>
            </span>
          </Row>
          <Row title="Weekly review day">
            <span className="block w-[136px]">
              <Select aria-label="Weekly review day" value={settings.review_day} onChange={(event) => save({ review_day: Number(event.target.value) })}>
                {WEEKDAY_LONG.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </Select>
            </span>
          </Row>
          <Row title="A new day begins at">
            <span className="block w-[136px]">
              <Select aria-label="A new day begins at" value={settings.day_start_hour} onChange={(event) => save({ day_start_hour: Number(event.target.value) })}>
                {[0, 1, 2, 3, 4, 5, 6].map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </Select>
            </span>
          </Row>
          <Row title="Evening starts at">
            <span className="block w-[136px]">
              <Select aria-label="Evening starts at" value={settings.evening_hour} onChange={(event) => save({ evening_hour: Number(event.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => i + 12).map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </Select>
            </span>
          </Row>
          <Row title="Days that can be corrected">
            <Stepper label="Days that can be corrected" value={editDays} onChange={(value) => save({ edit_window_days: value })} min={1} max={60} unit="days" />
          </Row>
        </Group>

        <Group title="Training">
          <Row title="Weight unit">
            <Segmented options={UNITS} value={settings.weight_unit} onChange={(unit) => save({ weight_unit: unit })} label="Weight unit" size="sm" />
          </Row>
          <Row title="Step between loads">
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
          <Row title="Rest between sets">
            <Stepper label="Default rest in seconds" value={settings.default_rest_seconds} onChange={(value) => save({ default_rest_seconds: value })} step={15} min={15} max={900} unit="sec" />
          </Row>
          <NavRow to="/train/setup" icon="train" title="Exercises and programme" />
        </Group>

        <Group title="More">
          <NavRow to="/data" icon="data" title="Data and cloud copy" />
          <NavRow to="/quotes" icon="quotes" title="Quotes" />
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
