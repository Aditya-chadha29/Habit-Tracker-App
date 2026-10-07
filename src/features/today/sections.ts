import type { AreaConfig, DateStr, DayRoutine, Habit, RoutineSlot } from '../../data/types'
import type { CompletionIndex } from '../../engine/completion'
import { dueItems, flexibleItems, type DayItem, type FlexibleItem, type Tally } from '../../engine/score'

/**
 * Turns "everything due today" into the grouped list the Today screen shows.
 *
 * A long flat checklist reads as thirty demands at once. Grouped, it reads as a morning, a few
 * practices, three meals and an evening. The order is: the day's routines in their own order,
 * then whatever is left grouped by pillar and group, then the habits with no particular day.
 */
export type DayRow =
  | { type: 'habit'; item: DayItem; lead?: string; hint?: string }
  | { type: 'note'; key: string; label: string; lead?: string; hint?: string }

export interface DaySection {
  key: string
  title: string
  /** Which part of the day it belongs to, for the Morning / Day / Evening filter. */
  part: 'morning' | 'day' | 'evening'
  /** Set when the section is a routine. */
  routineId: number | null
  rows: DayRow[]
  tally: Tally
  /** Habits in the section that are not done yet and can be ticked by hand. */
  openTickable: number[]
}

export interface DayView {
  sections: DaySection[]
  flexible: FlexibleItem[]
}

function partOf(slot: RoutineSlot): DaySection['part'] {
  return slot === 'morning' ? 'morning' : slot === 'evening' ? 'evening' : 'day'
}

function summarise(rows: DayRow[]): Pick<DaySection, 'tally' | 'openTickable'> {
  let done = 0
  let due = 0
  const openTickable: number[] = []
  for (const row of rows) {
    if (row.type !== 'habit') continue
    due += 1
    if (row.item.done) done += 1
    else if (row.item.version.sources.includes('manual') && row.item.habit.id !== undefined) openTickable.push(row.item.habit.id)
  }
  return { tally: { done, due }, openTickable }
}

export function buildDayView(
  habits: readonly Habit[],
  routines: readonly DayRoutine[],
  areas: readonly AreaConfig[],
  date: DateStr,
  index: CompletionIndex,
): DayView {
  const due = dueItems(habits, date, index)
  const byId = new Map(due.map((item) => [item.habit.id!, item]))
  const placed = new Set<number>()
  const sections: DaySection[] = []

  const active = routines.filter((routine) => routine.retired_on === null).sort((a, b) => a.sort_order - b.sort_order)
  for (const routine of active) {
    const rows: DayRow[] = []
    // Once any step has a time, every row keeps the time column so the names line up.
    const timed = routine.steps.some((step) => step.time)
    for (const step of routine.steps) {
      const lead = timed ? step.time : undefined
      // What the routine says about the step: how long it is meant to take, and its note.
      const hint = [step.minutes ? `${step.minutes} min` : '', step.note].filter(Boolean).join(' · ') || undefined
      if (step.habit_id === null) {
        rows.push({ type: 'note', key: step.key, label: step.label, lead, hint })
        continue
      }
      const item = byId.get(step.habit_id)
      // A habit is listed once, under the first routine that names it. A step whose habit is not
      // due today (a Monday-only supplement on a Tuesday) is simply not there today.
      if (!item || placed.has(step.habit_id)) continue
      placed.add(step.habit_id)
      rows.push({ type: 'habit', item, lead, hint })
    }
    if (!rows.some((row) => row.type === 'habit')) continue
    sections.push({
      key: `routine-${routine.id}`,
      title: routine.name,
      part: partOf(routine.slot),
      routineId: routine.id ?? null,
      rows,
      ...summarise(rows),
    })
  }

  const areaOrder = new Map(areas.map((area, i) => [area.id, i]))
  const areaLabel = new Map(areas.map((area) => [area.id, area.label]))
  const groups = new Map<string, { area: string; group: string; rows: DayRow[]; first: number }>()
  due.forEach((item, position) => {
    if (placed.has(item.habit.id!)) return
    const key = `${item.version.area}|${item.version.group}`
    const existing = groups.get(key)
    if (existing) existing.rows.push({ type: 'habit', item })
    else groups.set(key, { area: item.version.area, group: item.version.group, rows: [{ type: 'habit', item }], first: position })
  })
  const ordered = [...groups.values()].sort(
    (a, b) => (areaOrder.get(a.area) ?? 99) - (areaOrder.get(b.area) ?? 99) || a.first - b.first,
  )
  for (const group of ordered) {
    const label = areaLabel.get(group.area) ?? group.area
    sections.push({
      key: `group-${group.area}-${group.group}`,
      title: group.group ? `${label} · ${group.group}` : label,
      part: 'day',
      routineId: null,
      rows: group.rows,
      ...summarise(group.rows),
    })
  }

  return { sections, flexible: flexibleItems(habits, date, index) }
}

/** The next few habits still open, in the order the day is laid out. */
export function nextOpen(view: DayView, limit: number): DayItem[] {
  const open: DayItem[] = []
  for (const section of view.sections) {
    for (const row of section.rows) {
      if (row.type === 'habit' && !row.item.done) open.push(row.item)
      if (open.length >= limit) return open
    }
  }
  return open
}
