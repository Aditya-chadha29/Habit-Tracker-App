import type { ReactNode } from 'react'
import type { Tally } from '../engine/score'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'

interface HabitGroupProps {
  title: string
  /** Shown as "3 / 4" beside the title. Omit for a group nothing is scored in. */
  tally?: Tally
  /** A control at the right of the heading (for example "Mark all done"). */
  action?: ReactNode
  /** One quiet line under the title. */
  note?: string
  children: ReactNode
  className?: string
}

/**
 * A titled block of rows. This is what turns a long flat checklist into something that can be
 * read at a glance: a heading, how much of it is done, and its rows inside one surface.
 */
export function HabitGroup({ title, tally, action, note, children, className }: HabitGroupProps) {
  return (
    <section className={cx('flex flex-col gap-2', className)}>
      <div className="flex min-h-8 items-center gap-3 px-1">
        <h2 className="eyebrow min-w-0 flex-1 truncate">{title}</h2>
        {tally && tally.due > 0 && (
          <span className={cx('tnum shrink-0 text-[12.5px] font-medium', tally.done === tally.due ? 'text-ok' : 'text-ink-2')}>
            {tally.done} / {tally.due}
          </span>
        )}
        {action}
      </div>
      {note && <p className="-mt-1 px-1 text-[12.5px] text-ink-3">{note}</p>}
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {children}
      </Card>
    </section>
  )
}

/** A line in a group that is not a habit: a routine's reminder step. Nothing to tick. */
export function NoteRow({ label, lead, hint }: { label: string; lead?: string; hint?: string }) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 px-4 py-2">
      {lead !== undefined && <span className="tnum w-10 shrink-0 text-[12px] text-ink-3">{lead}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-ink-3">{label}</span>
        {hint && <span className="block truncate text-[12px] text-ink-3">{hint}</span>}
      </span>
    </div>
  )
}
