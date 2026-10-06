import type { SupplementSchedule, TimeHint } from './types'

/**
 * Starter supplements, all editable and retireable afterwards. The dose is free text so any unit
 * works, and stock is optional: it exists because the real failure mode is an empty tub on a
 * Tuesday, not forgetting to take something.
 *
 * Creatine lives here rather than as a habit tick — the seeded `Creatine` habit is retired when
 * these are first seeded, so one action never has to be recorded in two places.
 */
export type SupplementSeedRow = [
  name: string,
  dose_text: string,
  schedule: SupplementSchedule,
  /** 0 = Monday … 6 = Sunday; only read when the schedule is weekly. */
  weekly_day: number | null,
  time_hint: TimeHint,
  servings_left: number | null,
  low_stock_at: number | null,
]

export const SUPPLEMENT_SEED: SupplementSeedRow[] = [
  ['Creatine', '5 g', 'daily', null, 'anytime', null, 10],
  ['Whey protein', '1 scoop', 'daily', null, 'postworkout', null, 10],
  ['Multivitamin', '1 tablet', 'daily', null, 'morning', null, null],
  ['Omega-3', '2 capsules', 'daily', null, 'morning', null, null],
  ['Vitamin D', '60,000 IU', 'weekly', 6, 'morning', null, null],
]

/** short_name of the habit the supplement list takes over from; retired at seed time. */
export const SUPERSEDED_HABIT_SHORT_NAME = 'Creatine'
