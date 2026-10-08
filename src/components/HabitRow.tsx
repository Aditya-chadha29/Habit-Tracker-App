import { useState, type ReactNode } from 'react'
import { navigate } from '../app/router'
import { toggleHabit } from '../data/habitRepo'
import type { DateStr, Habit } from '../data/types'
import { completedBy } from '../engine/completion'
import { clockHHMM, formatMediumDate } from '../engine/dates'
import { describeSource, routeForSources } from '../engine/describe'
import { isEditable } from '../engine/lock'
import { dayStatus, statusLabel, type DayStatus } from '../engine/status'
import { versionOn } from '../engine/timeline'
import { useCore } from '../state/core'
import { IconButton } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/icons'
import { Tick } from '../ui/Tick'
import { useToast } from '../ui/Toast'
import { EntrySheet } from './EntrySheet'

const STATUS_TEXT: Record<DayStatus, string> = {
  done: 'text-ok',
  pending: 'text-ink-3',
  missed: 'text-risk',
  not_due: 'text-ink-3',
  inactive: 'text-ink-3',
  upcoming: 'text-ink-3',
}

interface HabitRowProps {
  habit: Habit
  date: DateStr
  /** A leading label, such as a routine step's intended time. */
  lead?: string
  /** Replaces the default second line. */
  sub?: ReactNode
  /** What a routine says about this step (its length, a note). Added to the second line. */
  hint?: string
  /** Extra content at the right edge, after the tick (a history link, a count). */
  trailing?: ReactNode
  /** Hide the status word, where the surrounding layout already says it. */
  quiet?: boolean
}

/**
 * One habit on one day: its name, what it amounts to, its state in words, and the tick.
 *
 * The whole row is the control. A habit that can be ticked toggles; a habit that only a session
 * can complete (Gym) goes to where that session is logged instead. A day outside the correction
 * window says that it is locked rather than pretending to respond.
 */
export function HabitRow({ habit, date, lead, sub, hint, trailing, quiet = false }: HabitRowProps) {
  const { index, today, write, settings } = useCore()
  const toast = useToast()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const version = versionOn(habit, date)
  if (!version || habit.id === undefined) return null

  const habitId = habit.id
  const via = completedBy(habit, date, index)
  const done = via !== null
  const status = dayStatus(habit, date, today, index)
  const editable = isEditable(date, today, settings.edit_window_days)
  const tickable = version.sources.includes('manual')
  const destination = routeForSources(version.sources)
  const measured = habit.measure.type !== 'boolean' && habit.measure.type !== 'session'

  const own =
    sub ??
    (done && via !== 'manual' && via !== null
      ? describeSource(via)
      : null)
  const secondLine = hint && (!own || typeof own === 'string') ? [own, hint].filter(Boolean).join(' · ') : own

  const activate = () => {
    if (!editable) {
      toast.show(`${formatMediumDate(date)} is locked. Only the last ${settings.edit_window_days} days can be changed.`)
      return
    }
    if (done && via !== 'manual') {
      toast.show(
        `${version.name}: ${describeSource(via!).toLowerCase()}.`,
        destination ? { action: { label: 'Open', onClick: () => navigate(destination) } } : undefined,
      )
      return
    }
    if (!tickable) {
      if (destination) navigate(destination)
      return
    }
    toggleHabit(habitId, date, write, { time: date === today ? clockHHMM(new Date()) : null }).catch((error: unknown) => {
      toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })
    })
  }

  const stateWord = statusLabel(status, habit.polarity)

  return (
    <div className="flex min-h-[56px] items-stretch">
      <button
        type="button"
        onClick={activate}
        aria-pressed={tickable ? done : undefined}
        aria-label={`${version.name}: ${stateWord}${secondLine && typeof secondLine === 'string' ? `. ${secondLine}` : ''}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 pr-3 pl-4 text-left transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
      >
        {lead !== undefined && <span className="tnum w-10 shrink-0 text-[12px] text-ink-3">{lead}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] leading-snug text-ink">{version.name}</span>
          {secondLine && <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{secondLine}</span>}
        </span>
        {!quiet && <span className={cx('shrink-0 text-[11.5px] font-medium', STATUS_TEXT[status])}>{stateWord}</span>}
        {tickable || done ? (
          <span aria-hidden="true" className="shrink-0">
            <Tick checked={done} readOnly label="" />
          </span>
        ) : (
          <Icon name="chevron-right" size={18} className="shrink-0 text-ink-3" />
        )}
      </button>
      {measured && tickable && editable && (
        <IconButton
          icon="more"
          size="md"
          label={`Value and note for ${version.name}`}
          onClick={() => setDetailsOpen(true)}
          className="self-center"
        />
      )}
      {trailing}
      {detailsOpen && <EntrySheet habit={habit} date={date} onClose={() => setDetailsOpen(false)} />}
    </div>
  )
}
