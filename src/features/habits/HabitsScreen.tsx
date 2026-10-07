import { useMemo } from 'react'
import { Link, navigate, useQueryState } from '../../app/router'
import { SortableList } from '../../components/SortableList'
import { reorderHabits, restoreHabit } from '../../data/habitRepo'
import type { Habit } from '../../data/types'
import { formatMediumDate } from '../../engine/dates'
import { describeAmount, describeFrequency } from '../../engine/describe'
import { currentVersion, isRetired } from '../../engine/timeline'
import { useCore } from '../../state/core'
import { Button } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/icons'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'

function summary(habit: Habit): string {
  const version = currentVersion(habit)
  const parts = [describeFrequency(version)]
  if (version.target && version.day.kind !== 'flexible') parts.push(`target ${version.target.count} per ${version.target.per}`)
  const amount = describeAmount(habit)
  if (amount) parts.push(amount)
  // A supplement or a meal is already labelled as one; its group would only repeat that.
  if (version.group && habit.kind === 'habit') parts.push(version.group)
  return parts.join(' · ')
}

/**
 * Where everything recurring is set up: habits, supplements and meals, by pillar. Nothing about
 * the personal system is fixed in code — every one of these can be renamed, re-scheduled,
 * reordered, retired or added to.
 */
export default function HabitsScreen() {
  const { today, areas, habits } = useCore()
  const toast = useToast()
  const [rawTab, setTab] = useQueryState('tab', 'active')
  const tab = rawTab === 'retired' ? 'retired' : 'active'
  const active = useMemo(() => habits.filter((habit) => !isRetired(habit)), [habits])
  const retired = useMemo(() => habits.filter(isRetired), [habits])

  const groups = useMemo(() => {
    const known = new Set(areas.map((area) => area.id))
    const list = areas.map((area) => ({ id: area.id, label: area.label, habits: active.filter((habit) => currentVersion(habit).area === area.id) }))
    const strays = active.filter((habit) => !known.has(currentVersion(habit).area))
    if (strays.length) list.push({ id: '', label: 'No pillar', habits: strays })
    return list.filter((group) => group.habits.length)
  }, [areas, active])

  /** Reordering inside one pillar: its habits take their new order in the slots they held. */
  const reorder = (members: readonly Habit[], orderedIds: number[]) => {
    const queue = [...orderedIds]
    const moved = new Set(members.map((habit) => habit.id!))
    const next = active.map((habit) => (moved.has(habit.id!) ? queue.shift()! : habit.id!))
    reorderHabits([...next, ...retired.map((habit) => habit.id!)]).catch(() => toast.show('The order could not be saved.', { tone: 'risk' }))
  }

  return (
    <Page
      title="Habits"
      subtitle={`${active.length} active · ${retired.length} retired`}
      width="default"
      tabs={
        <Segmented
          options={[
            { id: 'active', label: 'Active', count: active.length },
            { id: 'retired', label: 'Retired', count: retired.length },
          ]}
          value={tab}
          onChange={setTab}
          label="Which habits"
          block
        />
      }
      actions={
        <Button variant="primary" size="sm" icon="plus" onClick={() => navigate('/habits/new')}>
          Add
        </Button>
      }
    >
      {tab === 'active' ? (
        <div className="flex flex-col gap-6">
          {active.length === 0 && (
            <EmptyState
              icon="habits"
              title="No habits yet."
              body="Add the first thing you want to do regularly."
              action={
                <Button variant="primary" icon="plus" onClick={() => navigate('/habits/new')}>
                  Add a habit
                </Button>
              }
            />
          )}
          {groups.map((group) => (
            <section key={group.id || 'none'} className="flex flex-col gap-2">
              <SectionTitle>
                {group.label} · {group.habits.length}
              </SectionTitle>
              <SortableList items={group.habits} idOf={(habit) => habit.id!} nameOf={(habit) => habit.name} onReorder={(ids) => reorder(group.habits, ids)}>
                {(habit) => (
                  <Link to={`/habits/${habit.id}`} className="flex min-h-[58px] items-center gap-3 py-2 pr-1 transition-colors duration-100 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] text-ink">{habit.name}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{summary(habit)}</span>
                    </span>
                    {habit.kind !== 'habit' && <Chip>{habit.kind === 'meal' ? 'Meal' : 'Supplement'}</Chip>}
                    {habit.polarity === 'abstain' && <Chip>Avoid</Chip>}
                  </Link>
                )}
              </SortableList>
            </section>
          ))}
          {active.length > 0 && (
            <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">
              Drag the handle, or use the arrows, to change the order within a pillar. A habit is never deleted: retiring it takes it off Today and keeps all of its history.
            </p>
          )}
        </div>
      ) : retired.length === 0 ? (
        <EmptyState title="Nothing is retired." body="A retired habit leaves Today and every score from the day it is retired, and keeps its history." />
      ) : (
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          {retired.map((habit) => (
            <div key={habit.id} className="flex min-h-[60px] items-center gap-2 py-2 pr-2 pl-4">
              <Link to={`/progress/habit/${habit.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] text-ink-2">{habit.name}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
                  <Icon name="history" size={13} />
                  Retired {habit.retired_on ? formatMediumDate(habit.retired_on) : ''} · history kept
                </span>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  restoreHabit(habit.id!, today)
                    .then(() => toast.show(`${habit.name} is active again from today. The days it was retired stay untracked.`))
                    .catch(() => toast.show('That could not be restored.', { tone: 'risk' }))
                }
              >
                Restore
              </Button>
            </div>
          ))}
        </Card>
      )}
    </Page>
  )
}
