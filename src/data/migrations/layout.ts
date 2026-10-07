import type {
  AreaId, CompletionSource, DayRule, Dose, HabitKind, Measure, PeriodTarget, Polarity,
} from '../types'

/**
 * How the personal system is laid out: which pillar and group each known habit belongs to, how
 * often it is expected, and what completes it.
 *
 * It is read exactly twice — when an existing install is moved onto the versioned model, and when
 * a brand-new install is given its starting set. After that every habit is ordinary data the user
 * edits; nothing here is consulted again, so nothing here can ever fight a later edit.
 */
export interface LayoutRule {
  role: string
  /** Lowercased names, current or historical, that identify an existing row as this role. */
  match: string[]
  name: string
  short_name: string
  kind: HabitKind
  polarity: Polarity
  area: AreaId
  group: string
  day: DayRule
  target: PeriodTarget | null
  sources: CompletionSource[]
  measure: Measure
  dose: Dose | null
  meal_slot: string | null
  icon: string
  /** Rename a matching row to `name` from the cutover day. false leaves its name alone. */
  rename: boolean
  /** Add the habit to an existing install when nothing matches. */
  seed: boolean
  /** Part of a brand-new install's starting set. */
  fresh: boolean
  /** A retirement made by one of the 6 October builds only moved the item to the supplements
   *  list, so it is undone when supplements become habits again. */
  reactivate: boolean
}

const TICK: Measure = { type: 'boolean', target: null, unit: '' }

function rule(role: string, name: string, overrides: Partial<LayoutRule> = {}): LayoutRule {
  return {
    role,
    match: [name.toLowerCase()],
    name,
    short_name: name,
    kind: 'habit',
    polarity: 'do',
    area: 'body',
    group: '',
    day: { kind: 'daily' },
    target: null,
    sources: ['manual'],
    measure: TICK,
    dose: null,
    meal_slot: null,
    icon: '',
    rename: false,
    seed: false,
    fresh: false,
    reactivate: false,
    ...overrides,
  }
}

const weekly = (count: number): PeriodTarget => ({ per: 'week', count })

/** In the order the habits should be listed. */
export const LAYOUT: LayoutRule[] = [
  // Morning
  rule('wake', 'Wake up at 4:00 AM', { short_name: 'Wake up 4 AM', group: 'Sleep', icon: 'sunrise', fresh: true }),
  rule('water_morning', 'Water on waking', {
    match: ['water on waking', 'water'],
    short_name: 'Water',
    group: 'Nutrition',
    icon: 'droplet',
    seed: true,
    fresh: true,
  }),
  rule('brush', 'Brush with right hand', { short_name: 'Brush right hand', area: 'mind', icon: 'sparkles' }),
  rule('chia', 'Chia seeds', {
    match: ['water + chia seeds', 'chia seeds'],
    kind: 'supplement',
    group: 'Supplements',
    dose: { amount: 1, unit: 'tbsp' },
    icon: 'pill',
    rename: true,
    seed: true,
    fresh: true,
    reactivate: true,
  }),
  rule('creatine', 'Creatine', {
    kind: 'supplement',
    group: 'Supplements',
    dose: { amount: 5, unit: 'g' },
    icon: 'pill',
    seed: true,
    fresh: true,
    reactivate: true,
  }),
  rule('nuts', 'Soaked nuts / dry fruits', { short_name: 'Soaked nuts', group: 'Nutrition', icon: 'utensils' }),

  // Mind
  rule('meditation', 'Meditation (Isha Kriya)', {
    short_name: 'Meditation',
    area: 'mind',
    target: weekly(7),
    icon: 'flower',
    fresh: true,
  }),
  rule('hanuman', 'Hanuman Chalisa', { area: 'mind', icon: 'flame', seed: true, fresh: true }),
  rule('shiv', 'Shiv Tandav Stotram', {
    match: ['shiv tandav strotam', 'shiv tandav stotram'],
    short_name: 'Shiv Tandav',
    area: 'mind',
    icon: 'flame',
    rename: true,
    seed: true,
    fresh: true,
  }),
  rule('reading', 'Reading', {
    match: ['read / learn / writing', 'reading'],
    area: 'mind',
    target: weekly(7),
    sources: ['manual', 'reading'],
    icon: 'book',
    rename: true,
    seed: true,
    fresh: true,
  }),
  rule('writing', 'Writing / reflection', {
    match: ['writing / reflection', 'writing'],
    short_name: 'Writing',
    area: 'mind',
    sources: ['manual', 'journal'],
    icon: 'pen',
    seed: true,
    fresh: true,
  }),

  // Learning
  rule('learning', 'Learning', {
    match: ['useful / educational video', 'learning'],
    area: 'learning',
    sources: ['manual', 'learning'],
    icon: 'graduation',
    rename: true,
    seed: true,
    fresh: true,
  }),

  // Body
  rule('moisturiser', 'Daily moisturiser', {
    match: ['skincare', 'daily moisturiser'],
    short_name: 'Moisturiser',
    group: 'Grooming',
    icon: 'sparkles',
    rename: true,
    seed: true,
    fresh: true,
  }),
  rule('hair', 'Hair oiling', {
    match: ['hair care', 'hair oiling'],
    group: 'Grooming',
    day: { kind: 'flexible' },
    target: weekly(2),
    icon: 'sparkles',
    rename: true,
    seed: true,
    fresh: true,
  }),
  rule('breakfast', 'Breakfast', { kind: 'meal', meal_slot: 'breakfast', group: 'Nutrition', icon: 'utensils', seed: true, fresh: true }),
  rule('lunch', 'Lunch', { kind: 'meal', meal_slot: 'lunch', group: 'Nutrition', icon: 'utensils', seed: true, fresh: true }),
  rule('dinner', 'Dinner', { kind: 'meal', meal_slot: 'dinner', group: 'Nutrition', icon: 'utensils', seed: true, fresh: true }),
  rule('water_day', '2.5–3 L water', { group: 'Nutrition', icon: 'droplet' }),
  rule('fish_oil', 'Fish oil', {
    match: ['fish oil', 'omega-3'],
    kind: 'supplement',
    group: 'Supplements',
    dose: { amount: 2, unit: 'capsules' },
    icon: 'pill',
    seed: true,
    fresh: true,
  }),
  rule('vitamin_d', 'Vitamin D', {
    kind: 'supplement',
    group: 'Supplements',
    day: { kind: 'weekdays', weekdays: [0] },
    dose: { amount: 60000, unit: 'IU' },
    icon: 'pill',
    seed: true,
    fresh: true,
  }),
  rule('yakult', 'Yakult', {
    kind: 'supplement',
    group: 'Supplements',
    dose: { amount: 1, unit: 'bottle' },
    icon: 'pill',
    seed: true,
  }),
  rule('sleep', 'Sleep before 10:00 PM', { short_name: 'Sleep before 10', group: 'Sleep', icon: 'moon' }),
  rule('no_alcohol', 'No alcohol', { polarity: 'abstain', group: 'Avoid', icon: 'shield' }),
  rule('no_fast_food', 'No fast food', { polarity: 'abstain', group: 'Avoid', icon: 'shield' }),
  rule('ns', 'NS', { polarity: 'abstain', group: 'Avoid', icon: 'shield' }),
  rule('nf', 'NF', { polarity: 'abstain', group: 'Avoid', icon: 'shield' }),

  // Exercise
  rule('gym', 'Gym', {
    match: ['gym / exercise', 'gym / training', 'gym'],
    area: 'exercise',
    target: weekly(7),
    sources: ['workout'],
    measure: { type: 'session', target: null, unit: '' },
    icon: 'dumbbell',
    rename: true,
    seed: true,
    fresh: true,
  }),
  rule('cardio', 'Cardio', {
    match: ['15 min walk / jog', 'cardio'],
    area: 'exercise',
    target: weekly(7),
    sources: ['manual', 'cardio'],
    measure: { type: 'duration', target: 15, unit: 'min' },
    icon: 'footprints',
    rename: true,
    seed: true,
    fresh: true,
  }),
  rule('pushups', '10 push-ups', {
    area: 'exercise',
    group: 'Daily 10s',
    measure: { type: 'count', target: 10, unit: 'reps' },
    icon: 'activity',
    seed: true,
    fresh: true,
  }),
  rule('crunches', '10 crunches', {
    area: 'exercise',
    group: 'Daily 10s',
    measure: { type: 'count', target: 10, unit: 'reps' },
    icon: 'activity',
    seed: true,
    fresh: true,
  }),
  rule('pullups', '10 pull-ups', {
    area: 'exercise',
    group: 'Daily 10s',
    measure: { type: 'count', target: 10, unit: 'reps' },
    icon: 'activity',
    seed: true,
    fresh: true,
  }),
]

/** Names the 6 October build gave to habits it renamed, mapped back to what they were called. */
export const NAMES_BEFORE_PATCH: Record<string, { name: string; short_name: string }> = {
  'daily moisturiser': { name: 'Skincare', short_name: 'Skincare' },
  'hair oiling': { name: 'Hair care', short_name: 'Hair care' },
}

/** Habits the 6 October build created. Their creation date is the day that build first ran. */
export const ADDED_BY_PATCH = ['hanuman chalisa', 'shiv tandav strotam', 'lunch', 'dinner']

/** Supplements that build seeded without being asked for. Carried over only if actually used. */
export const UNREQUESTED_SUPPLEMENTS = ['whey protein', 'multivitamin']

/**
 * Weekly days the first 6 October build seeded and a later one corrected to the layout's day,
 * by role (0 = Monday). Vitamin D was seeded on Sundays and then moved to Mondays.
 */
export const SUPERSEDED_WEEKLY_DAY: Record<string, number> = { vitamin_d: 6 }

export interface RoutineSeedStep {
  /** A role from LAYOUT, or null for a plain reminder line. */
  role: string | null
  label: string
  time: string
}

/** The intended shape of the day. Guides, not alarms: every time and step can be changed. */
export const DAY_ROUTINE_SEED: { name: string; slot: 'morning' | 'evening'; steps: RoutineSeedStep[] }[] = [
  {
    name: 'Morning routine',
    slot: 'morning',
    steps: [
      { role: 'wake', label: '', time: '04:00' },
      { role: 'brush', label: '', time: '' },
      { role: 'water_morning', label: '', time: '04:05' },
      { role: 'chia', label: '', time: '04:05' },
      { role: 'creatine', label: '', time: '04:05' },
      { role: 'nuts', label: '', time: '' },
      { role: 'reading', label: '', time: '04:10' },
      { role: 'writing', label: '', time: '' },
      { role: 'learning', label: '', time: '04:40' },
      { role: 'gym', label: '', time: '' },
      { role: 'breakfast', label: '', time: '' },
      { role: null, label: 'Leave for work', time: '' },
    ],
  },
  {
    name: 'Evening routine',
    slot: 'evening',
    steps: [
      { role: null, label: 'Return home', time: '19:00' },
      { role: null, label: 'Reading / learning', time: '' },
      { role: 'dinner', label: '', time: '' },
      { role: 'writing', label: '', time: '' },
      { role: null, label: 'Wind down', time: '' },
      { role: 'sleep', label: '', time: '22:00' },
    ],
  },
]
