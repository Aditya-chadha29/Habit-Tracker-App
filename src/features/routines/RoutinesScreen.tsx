import { useMemo } from 'react'
import { Link, navigate } from '../../app/router'
import { SortableList } from '../../components/SortableList'
import { db } from '../../data/db'
import { reorderDayRoutines, setDayRoutineRetired } from '../../data/routineRepo'
import type { DayRoutine } from '../../data/types'
import { isComplete } from '../../engine/completion'
import { formatMediumDate } from '../../engine/dates'
import { isDueOn } from '../../engine/timeline'
import { useCore } from '../../state/core'
import { useLive } from '../../state/live'
import { Button } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { cx } from '../../ui/cx'
import { EmptyState } from '../../ui/EmptyState'
import { Page } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { slotLabel } from './labels'

const NONE: DayRoutine[] = []

/**
 * The day's routines: named, ordered lists of steps. They decide how Today is laid out and
 * nothing else — a routine holds no history of its own, so changing one never changes a score.
 */
export default function RoutinesScreen() {
  const { today, habits, index } = useCore()
  const toast = useToast()
  const routines = useLive(() => db.day_routines.orderBy('sort_order').toArray(), [], NONE)
  const active = useMemo(() => routines.filter((routine) => routine.retired_on === null), [routines])
  const retired = useMemo(() => routines.filter((routine) => routine.retired_on !== null), [routines])
  const byId = useMemo(() => new Map(habits.map((habit) => [habit.id!, habit])), [habits])

  const describe = (routine: DayRoutine) => {
    let due = 0
    let done = 0
    for (const step of routine.steps) {
      const habit = step.habit_id === null ? undefined : byId.get(step.habit_id)
      if (!habit || !isDueOn(habit, today)) continue
      due += 1
      if (isComplete(habit, today, index)) done += 1
    }
    return { due, done }
  }

  return (
    <Page
      title="Routines"
      subtitle="The order of a normal day"
      actions={
        <Button variant="primary" size="sm" icon="plus" onClick={() => navigate('/routines/new')}>
          Add
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {active.length === 0 ? (
          <EmptyState
            icon="routines"
            title="No routines yet."
            body="A routine puts habits in the order you do them, so Today reads like your morning or evening."
            action={
              <Button variant="primary" icon="plus" onClick={() => navigate('/routines/new')}>
                Add a routine
              </Button>
            }
          />
        ) : (
          <SortableList
            items={active}
            idOf={(routine) => routine.id!}
            nameOf={(routine) => routine.name}
            onReorder={(ids) => {
              reorderDayRoutines([...ids, ...retired.map((routine) => routine.id!)]).catch(() => toast.show('The order could not be saved.', { tone: 'risk' }))
            }}
          >
            {(routine) => {
              const { due, done } = describe(routine)
              return (
                <Link to={`/routines/${routine.id}`} className="flex min-h-[64px] items-center gap-3 py-2.5 pr-3 transition-colors duration-100 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">{routine.name}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                      {slotLabel(routine.slot)} · {routine.steps.length} {routine.steps.length === 1 ? 'step' : 'steps'}
                    </span>
                  </span>
                  {due > 0 && (
                    <span className={cx('tnum shrink-0 text-[12.5px] font-medium', done === due ? 'text-ok' : 'text-ink-2')}>
                      {done} / {due} today
                    </span>
                  )}
                </Link>
              )
            }}
          </SortableList>
        )}

        {retired.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionTitle>Retired</SectionTitle>
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {retired.map((routine) => (
                <div key={routine.id} className="flex min-h-[56px] items-center gap-2 py-2 pr-2 pl-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] text-ink-2">{routine.name}</span>
                    <span className="block text-[12.5px] text-ink-3">Retired {routine.retired_on ? formatMediumDate(routine.retired_on) : ''}</span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDayRoutineRetired(routine.id!, null).catch(() => toast.show('That could not be restored.', { tone: 'risk' }))}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </Card>
          </section>
        )}

        <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">
          A step that is a habit shows that habit on Today, where it is ticked as usual. A reminder line has nothing to tick. A habit is listed once, under the first routine
          that names it; habits in no routine are listed by pillar. A time is a guide for you — the app never sounds an alarm.
        </p>
      </div>
    </Page>
  )
}
