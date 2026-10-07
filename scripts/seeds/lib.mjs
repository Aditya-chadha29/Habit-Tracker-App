// Helpers for seed modules used with scripts/shot.mjs. They write rows straight into the dev
// database through window.__db, which only exists in a dev build.
//
//   // scripts/seeds/learn-queue.mjs
//   import { backdateInstall, tickHistory } from './lib.mjs'
//   export default async (page) => {
//     await backdateInstall(page, 70)        // the install is now 70 days old
//     await tickHistory(page, { days: 70 })  // …with a believable history
//     await page.evaluate(async () => { await window.__db.table('learning_resources').bulkAdd([...]) })
//   }
//
// A brand-new install has no past, so anything that draws history (streaks, calendars, weekly
// review, trends) needs backdateInstall + tickHistory first.

/** Moves every habit's start date `days` into the past, as if the app had been in use that long. */
export async function backdateInstall(page, days = 70) {
  await page.evaluate(async (days) => {
    const db = window.__db
    const pad = (n) => String(n).padStart(2, '0')
    const d = new Date()
    d.setDate(d.getDate() - days)
    const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const habits = await db.table('habits').toArray()
    for (const habit of habits) {
      const versions = habit.versions.map((v, i) => (i === 0 ? { ...v, from } : v))
      await db.table('habits').put({ ...habit, created_on: from, versions })
    }
    await db.table('settings').put({ key: 'cutover_date', value: from })
  }, days)
}

/**
 * Fills the last `days` days (today excluded unless includeToday) with ticks, workouts and
 * weigh-ins at roughly `rate` completion. Deterministic for a given seed.
 */
export async function tickHistory(page, options = {}) {
  await page.evaluate(async ({ days = 70, rate = 0.82, seed = 3, includeToday = false, todayRate = 0.5 }) => {
    const db = window.__db
    let state = seed >>> 0
    const random = () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pad = (n) => String(n).padStart(2, '0')
    const dateOf = (offset) => {
      const d = new Date()
      d.setDate(d.getDate() - offset)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const weekdayOf = (offset) => {
      const d = new Date()
      d.setDate(d.getDate() - offset)
      return (d.getDay() + 6) % 7
    }
    const habits = (await db.table('habits').toArray()).filter((h) => h.retired_on === null)
    const entries = []
    const sessions = []
    const weights = []
    for (let offset = days; offset >= (includeToday ? 0 : 1); offset--) {
      const date = dateOf(offset)
      const weekday = weekdayOf(offset)
      const chance = offset === 0 ? todayRate : rate
      for (const habit of habits) {
        if (habit.created_on > date) continue
        const version = habit.versions[habit.versions.length - 1]
        const usesWorkout = version.sources.includes('workout')
        let due = false
        if (version.day.kind === 'daily') due = true
        else if (version.day.kind === 'weekdays') due = version.day.weekdays.includes(weekday)
        else if (version.day.kind === 'flexible') due = random() < ((version.target?.count ?? 1) / 7) * 1.1
        if (!due || random() > chance) continue
        if (usesWorkout) {
          const cardio = [0, 2, 4].includes(weekday)
          sessions.push({
            date, routine_id: null, title: cardio ? 'Cardio' : 'Strength', started_at: 1, ended_at: 1 + (35 + Math.floor(random() * 40)) * 60000,
            notes: '', rest_started_at: null, rest_seconds: null, kinds: cardio ? ['cardio'] : ['strength'], quick: true, minutes: 35 + Math.floor(random() * 40),
          })
        } else if (version.sources.includes('manual')) {
          entries.push({ habit_id: habit.id, date, done: true, value: habit.measure?.target ?? null, note: '', time: null })
        }
      }
      if (weekday === 6) weights.push({ date, kg: Math.round((71.5 - offset * 0.012 + (random() - 0.5) * 0.6) * 10) / 10, note: '', created_at: 1 })
    }
    await db.table('entries').bulkAdd(entries)
    await db.table('sessions').bulkAdd(sessions)
    await db.table('weight_entries').bulkAdd(weights)
  }, options)
}
