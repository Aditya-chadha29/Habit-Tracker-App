import { useState, type ReactNode } from 'react'
import { Link, navigate } from '../../app/router'
import {
  blankResource, createResource, logSession, updateResource, type ResourceInput,
} from '../../data/learningRepo'
import type { DateStr, LearningLane, LearningPillar, LearningResource, ProgressUnit, ResourceStatus, ResourceType } from '../../data/types'
import { addDays, formatMediumDate, relativeDayLabel } from '../../engine/dates'
import { isSafeUrl, progressFraction, progressLabel, RESOURCE_TYPES, STATUS_LABEL, TYPE_LABEL, UNIT_LABEL, defaultUnit } from '../../engine/learning'
import { firstEditableDate } from '../../engine/lock'
import { useCore } from '../../state/core'
import { Button } from '../../ui/Button'
import { areaTone, Chip, type Tone } from '../../ui/Chip'
import { Field, Select, Stepper, Switch, TextArea, TextInput } from '../../ui/Field'
import { Icon, type IconName } from '../../ui/icons'
import { parseNumber } from '../../ui/numbers'
import { Drawer, Modal } from '../../ui/Overlay'
import { ProgressBar } from '../../ui/Progress'
import { Segmented } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'

export const TYPE_ICON: Record<ResourceType, IconName> = {
  book: 'book',
  video: 'video',
  article: 'article',
  pdf: 'file',
  course: 'graduation',
  podcast: 'podcast',
  note: 'pen',
  exercise: 'flask',
  project: 'idea',
}

const STATUS_TONE: Record<ResourceStatus, Tone> = {
  inbox: 'neutral',
  shortlist: 'neutral',
  queued: 'warn',
  in_progress: 'ok',
  completed: 'accent',
  archived: 'neutral',
}

const SECTIONS = [
  { id: '/learn/today', label: 'Today' },
  { id: '/learn/reading', label: 'Reading' },
] as const

/** The two places in Learn, as one strip. The queue and the library are reached from Today. */
export function LearnTabs({ current }: { current: (typeof SECTIONS)[number]['id'] }) {
  return <Segmented options={SECTIONS} value={current} onChange={(to) => navigate(to, { replace: true })} label="Learn section" block />
}

export function StatusChip({ status, head = false }: { status: ResourceStatus; head?: boolean }) {
  return <Chip tone={STATUS_TONE[status]}>{head && status === 'queued' ? 'Next' : STATUS_LABEL[status]}</Chip>
}

/** "YouTube · 38 min" — where it comes from and how long it is. */
export function metaLine(resource: LearningResource): string {
  const parts = [resource.source || TYPE_LABEL[resource.type]]
  if (resource.author) parts.push(resource.author)
  if (resource.estimated_minutes) parts.push(`${resource.estimated_minutes} min`)
  return parts.join(' · ')
}

export function PillarChip({ pillar }: { pillar: LearningPillar | undefined }) {
  if (!pillar) return null
  return <Chip tone={areaTone(pillar.color)}>{pillar.name}</Chip>
}

interface ResourceRowProps {
  resource: LearningResource
  pillar?: LearningPillar
  /** Shows "Next" instead of "Queued" for the head of the queue. */
  head?: boolean
  /** Replaces the status chip at the right. */
  trailing?: ReactNode
}

/** A resource in a list: what it is, where it is from, and where it stands. */
export function ResourceRow({ resource, pillar, head, trailing }: ResourceRowProps) {
  const fraction = progressFraction(resource)
  return (
    <div className="flex items-stretch">
      <Link
        to={`/learn/resource/${resource.id}`}
        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 pl-4 transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-2 text-ink-2">
          <Icon name={TYPE_ICON[resource.type]} size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] text-ink">{resource.title}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
            {metaLine(resource)}
            {pillar ? ` · ${pillar.name}` : ''}
          </span>
          {fraction !== null && fraction > 0 && fraction < 1 && (
            <ProgressBar value={fraction} max={1} height={4} label={`${resource.title}: ${Math.round(fraction * 100)} percent`} className="mt-1.5 max-w-[180px]" />
          )}
        </span>
        {!trailing && <StatusChip status={resource.status} head={head} />}
      </Link>
      {trailing && <div className="flex shrink-0 items-center gap-1 pr-2">{trailing}</div>}
    </div>
  )
}

/** Opens a resource's link in a new tab — only ever an http(s) link. */
export function openResourceLink(resource: LearningResource): boolean {
  if (!resource.url || !isSafeUrl(resource.url)) return false
  window.open(resource.url, '_blank', 'noopener,noreferrer')
  return true
}

// ─── Add / edit a resource ───────────────────────────────────────────────────────────────────

const UNITS: ProgressUnit[] = ['pages', 'minutes', 'lessons', 'chapters', 'percent', 'none']

function toInput(resource: LearningResource): ResourceInput {
  return {
    title: resource.title, type: resource.type, pillar_id: resource.pillar_id, topic: resource.topic, author: resource.author,
    source: resource.source, url: resource.url, description: resource.description, estimated_minutes: resource.estimated_minutes,
    priority: resource.priority, progress_unit: resource.progress_unit, progress_total: resource.progress_total,
    position_note: resource.position_note, notes: resource.notes,
  }
}

interface ResourceFormProps {
  /** An existing resource to edit, or a type to start a new one with. */
  resource?: LearningResource
  type?: ResourceType
  /** For a new resource: the topic it is being added from. */
  pillarId?: number
  pillars: LearningPillar[]
  onClose: () => void
  onSaved?: (id: number) => void
}

export function ResourceForm({ resource, type, pillarId, pillars, onClose, onSaved }: ResourceFormProps) {
  const { today } = useCore()
  const [form, setForm] = useState<ResourceInput>(resource ? toInput(resource) : { ...blankResource(type), pillar_id: pillarId ?? null })
  const [minutes] = useState(resource?.estimated_minutes ? String(resource.estimated_minutes) : '')
  const [total, setTotal] = useState(resource?.progress_total ? String(resource.progress_total) : '')
  const [error, setError] = useState('')
  const set = <K extends keyof ResourceInput>(key: K, value: ResourceInput[K]) => setForm((current) => ({ ...current, [key]: value }))

  const save = async () => {
    const input: ResourceInput = { ...form, estimated_minutes: parseNumber(minutes), progress_total: parseNumber(total) }
    try {
      if (resource) {
        await updateResource(resource.id!, input)
        onSaved?.(resource.id!)
      } else {
        // Saved first, then reported: inside `onSaved?.(…)` the save would be skipped whenever no
        // one is listening, and the form would close having kept nothing.
        const id = await createResource(input, today)
        onSaved?.(id)
      }
      onClose()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.')
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={resource ? 'Edit' : 'Add something to learn'}
      footer={
        <Button variant="primary" onClick={save}>
          {resource ? 'Save' : 'Add'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" error={error || undefined}>
          <TextInput value={form.title} onChange={(event) => set('title', event.target.value)} maxLength={160} placeholder="AI Agents — Lesson 3" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(event) => {
                const next = event.target.value as ResourceType
                setForm((current) => ({ ...current, type: next, progress_unit: resource ? current.progress_unit : defaultUnit(next) }))
              }}
            >
              {RESOURCE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TYPE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Topic">
            <Select value={form.pillar_id ?? ''} onChange={(event) => set('pillar_id', event.target.value ? Number(event.target.value) : null)}>
              <option value="">None</option>
              {pillars.filter((pillar) => !pillar.retired_on || pillar.id === form.pillar_id).map((pillar) => (
                <option key={pillar.id} value={pillar.id}>
                  {pillar.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Link" hint="Optional. Opened in a new tab when you start.">
          <TextInput type="url" inputMode="url" value={form.url} onChange={(event) => set('url', event.target.value)} placeholder="https://" />
        </Field>
        <Field label="Author or source" hint="Optional.">
          <TextInput value={form.author} onChange={(event) => set('author', event.target.value)} maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Progress counted in">
            <Select value={form.progress_unit} onChange={(event) => set('progress_unit', event.target.value as ProgressUnit)}>
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABEL[unit]}
                </option>
              ))}
            </Select>
          </Field>
          {form.progress_unit !== 'none' && form.progress_unit !== 'percent' && (
            <Field label={`Total ${UNIT_LABEL[form.progress_unit].toLowerCase()}`} hint="If known.">
              <TextInput inputMode="numeric" value={total} onChange={(event) => setTotal(event.target.value)} />
            </Field>
          )}
        </div>
        <Field label="Notes">
          <TextArea autoGrow rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </Field>
      </div>
    </Drawer>
  )
}

// ─── Log a session ───────────────────────────────────────────────────────────────────────────

const REACHED: Record<ProgressUnit, string> = {
  pages: 'Page reached',
  minutes: 'Minutes in',
  lessons: 'Lesson reached',
  chapters: 'Chapter reached',
  percent: 'Percent done',
  none: '',
}

interface SessionSheetProps {
  resource: LearningResource
  lane: LearningLane
  /** Start with "this finishes it" switched on (the Mark complete path). */
  finishing?: boolean
  onClose: () => void
}

/** Records a learning or reading session: when, how long, how far, and whether it is finished. */
export function SessionSheet({ resource, lane, finishing = false, onClose }: SessionSheetProps) {
  const { today, settings, write } = useCore()
  const toast = useToast()
  const [date, setDate] = useState<DateStr>(today)
  const [minutes, setMinutes] = useState(resource.estimated_minutes && lane === 'learning' ? Math.min(resource.estimated_minutes, 240) : 30)
  const [reached, setReached] = useState(resource.progress_current)
  const [notes, setNotes] = useState('')
  const [finished, setFinished] = useState(finishing)
  const first = firstEditableDate(today, settings.edit_window_days)
  const days: DateStr[] = []
  for (let day = today; day >= first; day = addDays(day, -1)) days.push(day)
  const counted = resource.progress_unit !== 'none'

  const save = async () => {
    try {
      await logSession(
        { resource_id: resource.id!, date, lane, minutes, progress_after: counted ? reached : null, notes, finished },
        write,
        Date.now(),
      )
      toast.show(finished ? `${resource.title} completed.` : `${lane === 'reading' ? 'Reading' : 'Learning'} session logged.`, { tone: 'ok' })
      onClose()
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={lane === 'reading' ? 'Log reading' : 'Log a learning session'}
      size="sm"
      footer={
        <Button variant="primary" block onClick={save}>
          {finished ? 'Save and mark completed' : 'Save session'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-[15px] font-medium text-ink">{resource.title}</p>
          {counted && <p className="mt-0.5 text-[12.5px] text-ink-3">Was at: {progressLabel(resource) || '—'}</p>}
        </div>
        <Field label="Day">
          <Select value={date} onChange={(event) => setDate(event.target.value)}>
            {days.map((day) => (
              <option key={day} value={day}>
                {relativeDayLabel(day, today)} · {formatMediumDate(day)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Minutes" hint="Set to 0 to leave it out.">
          <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={5} min={0} max={600} unit="min" />
        </Field>
        {counted && !finished && (
          <Field label={REACHED[resource.progress_unit]} hint={resource.progress_total ? `Out of ${resource.progress_total}.` : undefined}>
            <Stepper
              label={REACHED[resource.progress_unit]}
              value={reached}
              onChange={setReached}
              step={resource.progress_unit === 'percent' ? 5 : 1}
              min={0}
              max={resource.progress_total ?? 100000}
            />
          </Field>
        )}
        <Field label="Notes" hint="Optional.">
          <TextInput value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} />
        </Field>
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[14px] text-ink">This finishes it</span>
          <Switch label="This session finishes the resource" checked={finished} onChange={setFinished} />
        </div>
      </div>
    </Modal>
  )
}
