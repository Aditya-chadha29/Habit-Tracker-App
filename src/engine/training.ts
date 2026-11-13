import type { DateStr, Exercise, MuscleGroup, Session, SessionKind, SetLog } from '../data/types'

/**
 * Training arithmetic. All pure: screens and the weekly review both read their numbers from
 * here, so "volume" or "best set" means the same thing everywhere it appears.
 */

/** Weekly hard-set band drawn behind the per-muscle bars. A reference, never a target or a score. */
export const WEEKLY_SET_BAND = { low: 10, high: 20 }

/**
 * Estimated one-rep max, Epley. Deliberately conservative about when it refuses to answer: the
 * formula assumes the set ended at or near failure, and its error grows past ~10 reps, so above
 * 12 effective reps this returns null and the caller shows the raw set instead. RIR counts as
 * reps left in the tank, so a set with 2 RIR is treated as 2 reps heavier than it was taken.
 */
export function e1rm(weightKg: number | null, reps: number | null, rir: number | null = null): number | null {
  if (weightKg === null || reps === null || reps < 1) return null
  const effective = reps + (rir ?? 0)
  if (effective === 1) return weightKg
  if (effective > 12) return null
  return weightKg * (1 + effective / 30)
}

export function isWorkSet(set: SetLog): boolean {
  return set.done && set.kind === 'work'
}

/** A set close enough to failure to count toward weekly volume. No RIR recorded = counted. */
export function isHardSet(set: SetLog): boolean {
  return isWorkSet(set) && (set.rir === null || set.rir <= 4)
}

/** Sets × reps × weight. It flatters light high-rep work and heavy exercises, so it is context,
 *  never a headline. */
export function volumeLoad(sets: readonly SetLog[]): number {
  return sets.filter(isWorkSet).reduce((total, set) => total + (set.weight_kg ?? 0) * (set.reps ?? 0), 0)
}

/** Hard sets per muscle, biggest first. Credits the primary muscle only, so a push day reads low
 *  on triceps — a known, accepted simplification. */
export function setsByMuscle(
  sets: readonly SetLog[],
  exercisesById: ReadonlyMap<number, Exercise>,
): { muscle: MuscleGroup; count: number }[] {
  const counts = new Map<MuscleGroup, number>()
  for (const set of sets.filter(isHardSet)) {
    const exercise = exercisesById.get(set.exercise_id)
    if (!exercise) continue
    counts.set(exercise.primary_muscle, (counts.get(exercise.primary_muscle) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([muscle, count]) => ({ muscle, count }))
    .sort((a, b) => b.count - a.count)
}

function setScore(set: SetLog): number {
  return e1rm(set.weight_kg, set.reps, set.rir) ?? (set.weight_kg ?? 0) * (set.reps ?? 0)
}

export function bestSet(sets: readonly SetLog[]): SetLog | null {
  const work = sets.filter(isWorkSet)
  if (!work.length) return null
  return work.reduce((best, set) => (setScore(set) > setScore(best) ? set : best))
}

/** Weights are stored in kilograms; this is what the owner sees. */
export type WeightUnit = 'kg' | 'lb'
const KG_PER_LB = 0.45359237

export function weightIn(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? Math.round((kg / KG_PER_LB) * 10) / 10 : kg
}

export function weightFrom(shown: number, unit: WeightUnit): number {
  return unit === 'lb' ? Math.round(shown * KG_PER_LB * 100) / 100 : shown
}

/** "60 × 10" — one set, in the chosen unit. */
export function formatSet(set: SetLog, unit: WeightUnit = 'kg'): string {
  if (set.weight_kg !== null && set.reps !== null) return `${weightIn(set.weight_kg, unit)} × ${set.reps}`
  if (set.reps !== null) return `${set.reps} reps`
  if (set.seconds !== null) return formatDuration(set.seconds)
  if (set.distance_m !== null) return `${set.distance_m} m`
  return '—'
}

/** "60 × 10 · 60 × 9 · 57.5 × 10" — the single most useful line on any history screen. */
export function formatSetLine(sets: readonly SetLog[], unit: WeightUnit = 'kg'): string {
  return sets
    .filter(isWorkSet)
    .slice()
    .sort((a, b) => a.set_index - b.set_index)
    .map((set) => formatSet(set, unit))
    .join(' · ')
}

/** Sets grouped into the days they were done on, most recent first. */
export function groupSetsByDate(sets: readonly SetLog[]): { date: DateStr; sets: SetLog[] }[] {
  const byDate = new Map<DateStr, SetLog[]>()
  for (const set of sets) {
    const list = byDate.get(set.date)
    if (list) list.push(set)
    else byDate.set(set.date, [set])
  }
  return [...byDate.entries()]
    .map(([date, rows]) => ({ date, sets: rows }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** What a session contained, from the sets that were actually performed. */
export function sessionKindsFrom(
  sets: readonly SetLog[],
  exercisesById: ReadonlyMap<number, Exercise>,
): SessionKind[] {
  const kinds = new Set<SessionKind>()
  for (const set of sets) {
    if (!set.done) continue
    kinds.add(exercisesById.get(set.exercise_id)?.primary_muscle === 'cardio' ? 'cardio' : 'strength')
  }
  return [...kinds]
}

/** Length of a finished session in whole minutes, or null when it cannot be known. */
export function sessionMinutes(session: Pick<Session, 'started_at' | 'ended_at' | 'minutes'>): number | null {
  if (typeof session.minutes === 'number') return session.minutes
  if (session.started_at === null || session.ended_at === null) return null
  return Math.max(0, Math.round((session.ended_at - session.started_at) / 60_000))
}

/** "24:12" under an hour, "1:04:12" over. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** The plates a gym usually has, in kg, heaviest first. */
export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25]

/** Plates for ONE side of a bar to reach a total weight, and what cannot be made up. */
export function platesPerSide(totalKg: number, barKg: number, plates: readonly number[] = PLATES_KG): { plates: number[]; left: number } {
  let side = Math.max(0, (totalKg - barKg) / 2)
  const out: number[] = []
  for (const plate of plates) {
    while (side >= plate - 1e-9) {
      out.push(plate)
      side -= plate
    }
  }
  return { plates: out, left: Math.round(side * 2 * 100) / 100 }
}
