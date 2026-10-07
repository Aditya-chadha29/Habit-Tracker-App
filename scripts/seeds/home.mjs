// A lived-in install for the Home and Today screenshots: ten weeks of history, and today
// part-way through.
import { backdateInstall, tickHistory } from './lib.mjs'

export default async (page) => {
  await backdateInstall(page, 70)
  await tickHistory(page, { days: 70, rate: 0.8, includeToday: true, todayRate: 0.45 })
}
