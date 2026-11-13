import { db } from '../data/db'
import { setMissReason } from '../data/habitRepo'
import type { DateStr, Habit, MissReason } from '../data/types'
import { formatMediumDate } from '../engine/dates'
import { nameOn } from '../engine/timeline'
import { useCore } from '../state/core'
import { useKeyedLiveQuery } from '../state/live'
import { cx } from '../ui/cx'
import { Icon } from '../ui/icons'
import { Modal } from '../ui/Overlay'
import { useToast } from '../ui/Toast'

export const REASON_LABEL: Record<MissReason, string> = {
  late_night: 'Late night',
  travel: 'Travel',
  sick: 'Sick',
  forgot: 'Forgot',
  no_time: 'No time',
}
const REASONS = Object.keys(REASON_LABEL) as MissReason[]

/** The five reasons as switches; tapping the chosen one again clears it. Offered, never asked. */
export function ReasonChips({ habitId, date, onSaved }: { habitId: number; date: DateStr; onSaved?: () => void }) {
  const { write } = useCore()
  const toast = useToast()
  const { data: entry, loaded } = useKeyedLiveQuery(`reason|${habitId}|${date}`, async () => {
    return (await db.entries.where('[habit_id+date]').equals([habitId, date]).first()) ?? null
  })
  if (!loaded) return <div className="h-11" aria-hidden="true" />
  const current = entry?.reason ?? null
  const choose = (reason: MissReason) =>
    setMissReason(habitId, date, current === reason ? null : reason, write)
      .then(() => onSaved?.())
      .catch((error: unknown) => toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' }))
  return (
    <div role="group" aria-label="Reason for the miss" className="flex flex-wrap gap-2">
      {REASONS.map((reason) => (
        <button
          key={reason}
          type="button"
          aria-pressed={current === reason}
          onClick={() => choose(reason)}
          className={cx(
            'flex h-11 cursor-pointer items-center gap-1.5 rounded-control px-3.5 text-[13.5px] font-medium',
            current === reason ? 'bg-surface-3 text-ink shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)]' : 'bg-surface-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
          )}
        >
          {current === reason && <Icon name="check" size={14} />}
          {REASON_LABEL[reason]}
        </button>
      ))}
    </div>
  )
}

/** A small sheet for a missed day of an ordinary habit: why, if the user wants to say. */
export function MissReasonSheet({ habit, date, onClose }: { habit: Habit; date: DateStr; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`${nameOn(habit, date)} · ${formatMediumDate(date)}`} size="sm">
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] leading-relaxed text-ink-2">Missed on this day. A reason is optional and only adds to the weekly report.</p>
        <ReasonChips habitId={habit.id!} date={date} onSaved={onClose} />
      </div>
    </Modal>
  )
}
