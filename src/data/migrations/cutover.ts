import type {
  DateStr, DayRoutine, DayRule, Dose, Entry, Exercise, Habit, HabitVersion, LegacyHabit,
  LegacySupplement, LegacySupplementLog, Measure, PeriodTarget, RoutineStep, Session, SessionKind,
  SetLog,
} from '../types'
import { buildCompletionIndex, entryKey } from '../../engine/completion'
import { addDays } from '../../engine/dates'
import { legacyDayScore } from '../../engine/legacy'
import { dayScore } from '../../engine/score'
import { appendVersion, habitProblems, type VersionPatch } from '../../engine/timeline'
import {
  ADDED_BY_PATCH, DAY_ROUTINE_SEED, LAYOUT, NAMES_BEFORE_PATCH, SUPERSEDED_WEEKLY_DAY, UNREQUESTED_SUPPLEMENTS, type LayoutRule,
} from './layout'

/**
 * The cutover: the one-time move from "a habit row is its current settings" to "a habit row is a
 * list of dated chapters".
 *
 * Everything here is a pure function from the rows that were on the device to the rows that
 * should be. Nothing is read from a clock or a database inside, so the whole transformation can
 * be run against a copy of real data in a test before it ever touches a phone.
 *
 * Two starting states are handled, and they must end identical in every way that matters:
 *   A. the original app — every active habit due every day;
 *   B. the same data after the 6 October 2026 build ran, which renamed and re-scheduled some
 *      habits, retired two in favour of a supplements list, and added four.
 *
 * The promise it keeps: every day before the cutover scores exactly as the user last saw it —
 * with one deliberate exception. The 6 October build made "Hair care" a twice-a-week habit with
 * no start date, which silently removed it from every past day's score. Here that change is given
 * the date it actually happened, so the days before it read as they originally did.
 */

const TICK: Measure = { type: 'boolean', target: null, unit: '' }

export interface CutoverInput {
  today: DateStr
  now: number
  habits: LegacyHabit[]
  entries: Entry[]
  supplements: LegacySupplement[]
  supplementLogs: LegacySupplementLog[]
  sessions: Session[]
  setLogs: SetLog[]
  exercises: Exercise[]
}

export interface PlannedHabit {
  /** Which layout role the habit fills, or null for anything the layout does not know. */
  role: string | null
  /** `id` is set for a row that already exists and absent for one to be created. */
  habit: Habit
}

export interface ParityMismatch {
  date: DateStr
  before: string
  after: string
}

export interface CutoverReport {
  kind: 'fresh' | 'existing'
  cutover_date: DateStr
  /** The day the 6 October build first ran on this device, when it did. */
  patch_date: DateStr | null
  converted: number
  added: string[]
  renamed: string[]
  reactivated: string[]
  supplements_converted: string[]
  supplements_left_behind: string[]
  ticks_from_supplement_logs: number
  parity: { days_checked: number; mismatches: ParityMismatch[] }
}

export interface CutoverPlan {
  habits: PlannedHabit[]
  /** Ticks to create, each pointing at an index into `habits` (new habits have no id yet). */
  ticksToAdd: { habitIndex: number; date: DateStr }[]
  /** Existing "not done" rows that a supplement log says were in fact done. */
  entryIdsToMarkDone: number[]
  sessionKinds: { id: number; kinds: SessionKind[] }[]
  /** A workout to record for today, when Gym was ticked by hand before the update arrived. */
  quickSession: Omit<Session, 'id'> | null
  report: CutoverReport
}

const lower = (text: string): string => text.trim().toLowerCase()

function legacyArea(row: LegacyHabit): string {
  if (row.category === 'mind' || row.category === 'exercise') return row.category
  return 'body'
}

function legacyDay(row: LegacyHabit): DayRule {
  if (row.schedule === 'weekdays' && row.weekdays?.length) return { kind: 'weekdays', weekdays: [...row.weekdays] }
  if (row.schedule === 'times_per_week') return { kind: 'flexible' }
  return { kind: 'daily' }
}

function legacyTarget(row: LegacyHabit): PeriodTarget | null {
  if (row.schedule !== 'times_per_week') return null
  const count = Math.min(7, Math.max(1, Math.round(row.times_per_week ?? 1)))
  return { per: 'week', count }
}

/** "5 g" → 5 g, "60,000 IU" → 60000 IU, "1 scoop" → 1 scoop. Unparseable text keeps its words. */
export function parseDose(text: string): Dose | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const match = /^([\d.,]+)\s*(.*)$/.exec(trimmed)
  if (!match) return { amount: null, unit: trimmed }
  const amount = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(amount) ? { amount, unit: match[2].trim() } : { amount: null, unit: trimmed }
}

/**
 * The schedule a supplement had on the old list. A weekly day that is still the first build's
 * seeded default was corrected by a later build; an install that never received that correction
 * gets the layout's day here. Any other day was chosen by the user and is kept.
 */
function supplementDay(supplement: LegacySupplement, rule: LayoutRule | undefined): DayRule {
  if (supplement.schedule === 'as_needed') return { kind: 'flexible' }
  if (supplement.schedule !== 'weekly') return { kind: 'daily' }
  if (rule && supplement.weekly_day === SUPERSEDED_WEEKLY_DAY[rule.role]) return rule.day
  return { kind: 'weekdays', weekdays: [supplement.weekly_day ?? 0] }
}

/**
 * The day the 6 October build first ran here, or null if it never did. That build left no record
 * of when it ran, but it created four habits on the spot, so their creation date is that day.
 */
export function detectPatchDate(habits: LegacyHabit[], today: DateStr): DateStr | null {
  const patched = habits.some((h) => h.category !== undefined || h.schedule !== undefined)
  if (!patched) return null
  const created = habits
    .filter((h) => ADDED_BY_PATCH.includes(lower(h.name)))
    .map((h) => h.created_on)
    .sort()
  const inferred = created[0] ?? today
  return inferred > today ? today : inferred
}

function fold(base: HabitVersion, events: { from: DateStr; patch: VersionPatch }[]): HabitVersion[] {
  // Stable sort: events on the same day apply in the order they were listed.
  const ordered = events
    .map((event, order) => ({ ...event, order }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.order - b.order))
  let versions: HabitVersion[] = [base]
  for (const event of ordered) {
    if (event.from <= versions[0].from && versions.length === 1) {
      versions = [{ ...versions[0], ...event.patch }]
      continue
    }
    versions = appendVersion(versions, event.from, event.patch)
  }
  return versions
}

function finish(habit: Omit<Habit, 'name' | 'short_name' | 'retired_on'>): Habit {
  const last = habit.versions[habit.versions.length - 1]
  return { ...habit, name: last.name, short_name: last.short_name, retired_on: last.active ? null : last.from }
}

function layoutChapter(rule: LayoutRule, currentName: string, currentShort: string): VersionPatch {
  return {
    active: true,
    name: rule.rename ? rule.name : currentName,
    short_name: rule.rename ? rule.short_name : currentShort,
    area: rule.area,
    group: rule.group,
    day: rule.day,
    target: rule.target,
    sources: rule.sources,
  }
}

function newFromRule(rule: LayoutRule, today: DateStr): Habit {
  return finish({
    kind: rule.kind,
    polarity: rule.polarity,
    created_on: today,
    sort_order: 0,
    description: '',
    icon: rule.icon,
    measure: rule.measure,
    meal_slot: rule.meal_slot,
    dose: rule.dose,
    versions: [
      {
        from: today,
        active: true,
        name: rule.name,
        short_name: rule.short_name,
        area: rule.area,
        group: rule.group,
        day: rule.day,
        target: rule.target,
        sources: rule.sources,
      },
    ],
  })
}

/** A brand-new install: the starting personal system, all of it editable afterwards. */
export function planFresh(today: DateStr): CutoverPlan {
  const habits: PlannedHabit[] = LAYOUT.filter((rule) => rule.fresh).map((rule, i) => ({
    role: rule.role,
    habit: { ...newFromRule(rule, today), sort_order: i },
  }))
  return {
    habits,
    ticksToAdd: [],
    entryIdsToMarkDone: [],
    sessionKinds: [],
    quickSession: null,
    report: {
      kind: 'fresh',
      cutover_date: today,
      patch_date: null,
      converted: 0,
      added: habits.map((h) => h.habit.name),
      renamed: [],
      reactivated: [],
      supplements_converted: [],
      supplements_left_behind: [],
      ticks_from_supplement_logs: 0,
      parity: { days_checked: 0, mismatches: [] },
    },
  }
}

export function planCutover(input: CutoverInput): CutoverPlan {
  const today = input.today
  if (!input.habits.length) return planFresh(today)

  const patchDate = detectPatchDate(input.habits, today)
  const rows = input.habits.filter((row) => row.id !== undefined)
  const report: CutoverReport = {
    kind: 'existing',
    cutover_date: today,
    patch_date: patchDate,
    converted: 0,
    added: [],
    renamed: [],
    reactivated: [],
    supplements_converted: [],
    supplements_left_behind: [],
    ticks_from_supplement_logs: 0,
    parity: { days_checked: 0, mismatches: [] },
  }

  const nameBeforePatch = (row: LegacyHabit) =>
    patchDate !== null && row.created_on < patchDate ? NAMES_BEFORE_PATCH[lower(row.name)] ?? null : null
  // The earlier app retired a habit on its own in two situations, each on a day that can be
  // read back: its last 6 October build did so on the day it first ran (the patch day), and its
  // first one did so in the very step that seeded the supplements list, which then took over
  // from the Creatine habit. A retirement dated to either day was the app's doing, not the
  // user's. The two days differ on a device that received those builds on different days.
  const supplementsSeededOn = input.supplements.map((supplement) => supplement.created_on).sort()[0] ?? null
  const retiredByApp = (row: LegacyHabit) =>
    row.retired_on !== null && (row.retired_on === patchDate || row.retired_on === supplementsSeededOn)

  // ── Which existing row fills which role ────────────────────────────────────────────────────
  const ruleForRow = new Map<number, LayoutRule>()
  const rolesSeen = new Set<string>()
  for (const rule of LAYOUT) {
    const candidates = rows.filter((row) => {
      if (ruleForRow.has(row.id!)) return false
      const names = [lower(row.name)]
      const earlier = nameBeforePatch(row)
      if (earlier) names.push(lower(earlier.name))
      return names.some((name) => rule.match.includes(name))
    })
    if (!candidates.length) continue
    // A retired habit of the same name still counts as "this exists": the user retired it, so it
    // must not be added back.
    rolesSeen.add(rule.role)
    const usable = candidates
      .filter((row) => !row.retired_on || (rule.reactivate && retiredByApp(row)))
      .sort((a, b) => a.sort_order - b.sort_order || a.id! - b.id!)
    if (usable.length) ruleForRow.set(usable[0].id!, rule)
  }

  // ── Existing rows ──────────────────────────────────────────────────────────────────────────
  const planned: PlannedHabit[] = []
  const indexByRole = new Map<string, number>()
  const indexByRowId = new Map<number, number>()

  for (const row of rows) {
    // A row that already carries chapters was written by this version of the app; leave it be.
    const existing = row as unknown as Habit
    if (Array.isArray(existing.versions) && existing.versions.length) {
      indexByRowId.set(row.id!, planned.push({ role: null, habit: existing }) - 1)
      continue
    }

    const rule = ruleForRow.get(row.id!)
    const earlier = nameBeforePatch(row)
    const existedBeforePatch = patchDate === null || row.created_on < patchDate
    const base: HabitVersion = {
      from: row.created_on,
      active: true,
      name: earlier?.name ?? row.name,
      short_name: earlier?.short_name ?? row.short_name,
      // History takes the pillar and group the habit has now: those never affected a score, and
      // it is what lets a pillar's past be charted at all.
      area: rule?.area ?? legacyArea(row),
      group: rule?.group ?? row.group ?? '',
      day: existedBeforePatch ? { kind: 'daily' } : legacyDay(row),
      target: existedBeforePatch ? null : legacyTarget(row),
      sources: ['manual'],
    }

    const events: { from: DateStr; patch: VersionPatch }[] = []
    if (patchDate !== null && existedBeforePatch) {
      const patch: VersionPatch = {}
      if (earlier) {
        patch.name = row.name
        patch.short_name = row.short_name
      }
      const day = legacyDay(row)
      if (day.kind !== 'daily') {
        patch.day = day
        patch.target = legacyTarget(row)
      }
      if (Object.keys(patch).length) events.push({ from: patchDate, patch })
    }
    if (row.retired_on) events.push({ from: row.retired_on, patch: { active: false } })

    const reactivate = !!rule?.reactivate && retiredByApp(row)
    const staysRetired = !!row.retired_on && !reactivate
    const applies = rule && !staysRetired
    if (applies) {
      events.push({ from: today, patch: layoutChapter(rule, row.name, row.short_name) })
      if (rule.rename && lower(rule.name) !== lower(row.name)) report.renamed.push(`${row.name} → ${rule.name}`)
      if (reactivate) report.reactivated.push(rule.name)
    }

    const habit = finish({
      id: row.id,
      kind: applies ? rule.kind : 'habit',
      polarity: row.polarity,
      created_on: row.created_on,
      sort_order: row.sort_order,
      description: '',
      icon: rule?.icon ?? '',
      measure: applies ? rule.measure : TICK,
      meal_slot: applies ? rule.meal_slot : null,
      dose: applies ? rule.dose : null,
      versions: fold(base, events),
    })
    const index = planned.push({ role: applies ? rule.role : null, habit }) - 1
    indexByRowId.set(row.id!, index)
    if (applies) indexByRole.set(rule.role, index)
    report.converted += 1
  }

  // ── Supplements become habits ──────────────────────────────────────────────────────────────
  const ticksToAdd: CutoverPlan['ticksToAdd'] = []
  const entryIdsToMarkDone: number[] = []
  const entryByKey = new Map<string, Entry>()
  for (const entry of input.entries) entryByKey.set(entryKey(entry.habit_id, entry.date), entry)
  const plannedTicks = new Set<string>()

  const carryLogs = (supplementId: number, habitIndex: number) => {
    const existingId = planned[habitIndex].habit.id
    for (const log of input.supplementLogs) {
      if (log.supplement_id !== supplementId || !log.taken) continue
      if (existingId !== undefined) {
        const current = entryByKey.get(entryKey(existingId, log.date))
        if (current?.done) continue
        if (current && current.id !== undefined) {
          entryIdsToMarkDone.push(current.id)
          report.ticks_from_supplement_logs += 1
          continue
        }
      }
      const key = `${habitIndex}|${log.date}`
      if (plannedTicks.has(key)) continue
      plannedTicks.add(key)
      ticksToAdd.push({ habitIndex, date: log.date })
      report.ticks_from_supplement_logs += 1
    }
  }

  for (const supplement of input.supplements) {
    if (supplement.id === undefined) continue
    const name = lower(supplement.name)
    const rule = LAYOUT.find((r) => r.kind === 'supplement' && r.match.includes(name))
    const hasLogs = input.supplementLogs.some((l) => l.supplement_id === supplement.id && l.taken)
    const dose = parseDose(supplement.dose_text)

    const twin = rule ? indexByRole.get(rule.role) : undefined
    if (twin !== undefined) {
      // The habit row is the identity (it holds the history); the supplement row adds its dose.
      if (dose) planned[twin].habit = { ...planned[twin].habit, dose }
      carryLogs(supplement.id, twin)
      report.supplements_converted.push(supplement.name)
      continue
    }

    const unrequested = !rule && UNREQUESTED_SUPPLEMENTS.includes(name)
    if (!hasLogs && (unrequested || supplement.retired_on)) {
      report.supplements_left_behind.push(supplement.name)
      continue
    }
    if (rule && rolesSeen.has(rule.role) && !hasLogs) {
      // A habit of this name exists but is retired by the user's own choice: do not bring it back.
      report.supplements_left_behind.push(supplement.name)
      continue
    }

    const from = supplement.created_on > today ? today : supplement.created_on
    const scheduled = supplementDay(supplement, rule)
    const base: HabitVersion = {
      from,
      active: true,
      name: rule?.name ?? supplement.name,
      short_name: rule?.short_name ?? supplement.name,
      area: rule?.area ?? 'body',
      group: rule?.group ?? 'Supplements',
      // Until the cutover a supplement was listed and tickable but never scored.
      day: { kind: 'flexible' },
      target: null,
      sources: ['manual'],
    }
    const events: { from: DateStr; patch: VersionPatch }[] = []
    if (supplement.retired_on) events.push({ from: supplement.retired_on, patch: { active: false } })
    else events.push({ from: today, patch: { day: scheduled, target: null } })

    const habit = finish({
      kind: 'supplement',
      polarity: 'do',
      created_on: from,
      sort_order: 1000 + supplement.sort_order,
      description: '',
      icon: rule?.icon ?? 'pill',
      measure: TICK,
      meal_slot: null,
      dose: dose ?? rule?.dose ?? null,
      versions: fold(base, events),
    })
    const index = planned.push({ role: rule && !supplement.retired_on ? rule.role : null, habit }) - 1
    if (rule) {
      rolesSeen.add(rule.role)
      if (!supplement.retired_on) indexByRole.set(rule.role, index)
    }
    carryLogs(supplement.id, index)
    report.supplements_converted.push(supplement.name)
  }

  // ── Habits the layout calls for that do not exist yet ──────────────────────────────────────
  for (const rule of LAYOUT) {
    if (!rule.seed || rolesSeen.has(rule.role)) continue
    indexByRole.set(rule.role, planned.push({ role: rule.role, habit: newFromRule(rule, today) }) - 1)
    rolesSeen.add(rule.role)
    report.added.push(rule.name)
  }

  // ── A sensible order: the layout's, then everything else as it was ─────────────────────────
  let position = 0
  const placed = new Set<number>()
  for (const rule of LAYOUT) {
    const index = indexByRole.get(rule.role)
    if (index === undefined) continue
    planned[index].habit = { ...planned[index].habit, sort_order: position++ }
    placed.add(index)
  }
  planned
    .map((p, index) => ({ p, index }))
    .filter(({ index }) => !placed.has(index))
    .sort((a, b) => a.p.habit.sort_order - b.p.habit.sort_order)
    .forEach(({ index }) => {
      planned[index].habit = { ...planned[index].habit, sort_order: position++ }
    })

  // ── Training sessions ──────────────────────────────────────────────────────────────────────
  const muscleOf = new Map(input.exercises.map((e) => [e.id!, e.primary_muscle]))
  const sessionKinds: CutoverPlan['sessionKinds'] = []
  for (const session of input.sessions) {
    if (session.id === undefined || session.ended_at === null || session.kinds !== undefined) continue
    const kinds = new Set<SessionKind>()
    for (const set of input.setLogs) {
      if (set.session_id !== session.id || !set.done) continue
      kinds.add(muscleOf.get(set.exercise_id) === 'cardio' ? 'cardio' : 'strength')
    }
    sessionKinds.push({ id: session.id, kinds: [...kinds] })
  }

  // Gym is completed by workouts from today. If it was already ticked by hand today, before this
  // version arrived, that tick is honoured by recording it as what it was: a workout.
  let quickSession: CutoverPlan['quickSession'] = null
  const gymIndex = indexByRole.get('gym')
  const gymId = gymIndex === undefined ? undefined : planned[gymIndex].habit.id
  if (gymId !== undefined) {
    const tickedToday = entryByKey.get(entryKey(gymId, today))?.done ?? false
    const trainedToday = input.sessions.some((s) => s.date === today && s.ended_at !== null)
    if (tickedToday && !trainedToday) {
      quickSession = {
        date: today,
        routine_id: null,
        title: 'Gym',
        started_at: null,
        ended_at: input.now,
        notes: 'Recorded from a tick made before this version of the app.',
        rest_started_at: null,
        rest_seconds: null,
        kinds: ['strength'],
        quick: true,
        minutes: null,
      }
    }
  }

  // ── Parity: do the days before today still score as they did? ──────────────────────────────
  const withIds = planned.filter((p) => p.habit.id !== undefined).map((p) => p.habit)
  const index = buildCompletionIndex({
    entries: input.entries,
    sessions: [],
    learningSessions: [],
    journalDates: [],
  })
  const doneKeys = new Set(input.entries.filter((e) => e.done).map((e) => entryKey(e.habit_id, e.date)))
  const first = rows.reduce((min, row) => (row.created_on < min ? row.created_on : min), today)
  for (let date = first; date < today; date = addDays(date, 1)) {
    const afterPatch = patchDate !== null && date >= patchDate
    const before = legacyDayScore(rows, doneKeys, date, afterPatch)
    const after = dayScore(withIds, date, index)
    report.parity.days_checked += 1
    if (before.done !== after.done || before.total !== after.due) {
      report.parity.mismatches.push({
        date,
        before: `${before.done}/${before.total}`,
        after: `${after.done}/${after.due}`,
      })
    }
  }

  for (const { habit } of planned) {
    const problems = habitProblems(habit)
    if (problems.length) throw new Error(`Cutover produced an invalid habit "${habit.name}": ${problems.join('; ')}`)
  }

  return { habits: planned, ticksToAdd, entryIdsToMarkDone, sessionKinds, quickSession, report }
}

/** The day routines for a set of habits, addressed by layout role. Steps whose habit is not
 *  present are left out rather than pointing at nothing. */
export function planDayRoutines(idByRole: ReadonlyMap<string, number>): Omit<DayRoutine, 'id'>[] {
  return DAY_ROUTINE_SEED.map((routine, order) => {
    const steps: RoutineStep[] = []
    routine.steps.forEach((step, i) => {
      const habitId = step.role ? idByRole.get(step.role) : undefined
      if (step.role && habitId === undefined) return
      steps.push({
        key: `${routine.slot}-${i}`,
        habit_id: habitId ?? null,
        label: step.label,
        time: step.time,
        minutes: null,
        note: '',
      })
    })
    return { name: routine.name, slot: routine.slot, steps, sort_order: order, retired_on: null }
  })
}
