import type { CompletionSource, DayRule, Habit, HabitVersion } from '../data/types'
import { WEEKDAY_LONG, WEEKDAY_SHORT } from './dates'
import type { TargetProgress } from './targets'
import { daysLeftPhrase, remainingPhrase } from './targets'

/** Words for the things the engine computes. Kept beside the engine so every screen says the
 *  same thing the same way. */

export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  const last = n % 10
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function describeDayRule(rule: DayRule): string {
  switch (rule.kind) {
    case 'daily':
      return 'Daily'
    case 'weekdays': {
      const days = [...new Set(rule.weekdays)].sort((a, b) => a - b)
      if (days.length === 7) return 'Daily'
      if (days.join() === '0,1,2,3,4') return 'Weekdays'
      if (days.join() === '5,6') return 'Weekends'
      if (days.length === 1) return `${WEEKDAY_LONG[days[0]]}s`
      return days.map((d) => WEEKDAY_SHORT[d]).join(', ')
    }
    case 'every_n_days':
      if (rule.n <= 1) return 'Daily'
      return rule.n === 2 ? 'Every other day' : `Every ${rule.n} days`
    case 'month_days':
      return `Monthly on the ${joinList([...rule.days].sort((a, b) => a - b).map(ordinal))}`
    case 'flexible':
      return 'As needed'
  }
}

/** "Daily", "2 per week", "Mon, Wed, Fri", "Every 3 days", "Monthly on the 1st", "As needed". */
export function describeFrequency(version: Pick<HabitVersion, 'day' | 'target'>): string {
  if (version.day.kind === 'flexible') {
    return version.target ? `${version.target.count} per ${version.target.per}` : 'As needed'
  }
  return describeDayRule(version.day)
}

/** "5 g", "10 reps", "15 min" — what one completion of the habit is, when it is more than a tick. */
export function describeAmount(habit: Pick<Habit, 'dose' | 'measure'>): string {
  if (habit.dose && (habit.dose.amount !== null || habit.dose.unit)) {
    return [habit.dose.amount !== null ? habit.dose.amount.toLocaleString('en-IN') : '', habit.dose.unit].filter(Boolean).join(' ')
  }
  if (habit.measure.target !== null) return `${habit.measure.target} ${habit.measure.unit}`.trim()
  return ''
}

/** How a habit came to be complete, when it was not a tick. */
export function describeSource(source: CompletionSource): string {
  switch (source) {
    case 'manual':
      return 'Ticked'
    case 'workout':
      return 'From a logged workout'
    case 'cardio':
      return 'From a workout that included cardio'
    case 'learning':
      return 'From a learning session'
    case 'reading':
      return 'From a reading session'
    case 'journal':
      return 'From the journal'
  }
}

/** Where a habit that sessions complete is acted on. */
export function routeForSources(sources: readonly CompletionSource[]): string | null {
  if (sources.includes('workout') || sources.includes('cardio')) return '/train'
  if (sources.includes('reading')) return '/learn/reading'
  if (sources.includes('learning')) return '/learn'
  if (sources.includes('journal')) return '/journal'
  return null
}

/** The one line under a target's bar. Factual; never a judgement. */
export function describeTarget(progress: TargetProgress): string {
  switch (progress.state) {
    case 'met':
      return progress.done > progress.target ? `Target met · ${progress.done - progress.target} extra` : 'Target met'
    case 'on_track':
      return progress.partial ? `${progress.remaining} to go · started part-way` : `${progress.remaining} to go`
    case 'attention':
    case 'at_risk':
      return `${remainingPhrase(progress.remaining)} · ${daysLeftPhrase(progress.days_left)}`
    case 'unreachable': {
      // A habit with fixed days has simply missed some of them; a flexible one has run out of days.
      const short = progress.target - progress.done - progress.open_days
      if (!progress.flexible) return `${short} missed ${progress.period.per === 'week' ? 'this week' : 'this month'}`
      return `At most ${progress.done + progress.open_days} of ${progress.target} now possible`
    }
    case 'missed':
      return `Target missed · ${progress.remaining} short`
    case 'partial':
      return 'Tracked for part of the period · not judged'
    case 'upcoming':
      return 'Not started'
  }
}

/** A short status word for a target, for places with no room for the full line. */
export function targetStateWord(progress: TargetProgress): string {
  switch (progress.state) {
    case 'met':
      return 'Met'
    case 'on_track':
      return 'On track'
    case 'attention':
      return 'Attention'
    case 'at_risk':
      return 'At risk'
    case 'unreachable':
      return 'Out of reach'
    case 'missed':
      return 'Missed'
    case 'partial':
      return 'Partial'
    case 'upcoming':
      return 'Upcoming'
  }
}
