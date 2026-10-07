// Drives the three acceptance scenarios from the product specification through the real screens,
// against the running dev server, each from a brand-new install with the clock under control.
//
//   node scripts/acceptance.mjs                 all three
//   node scripts/acceptance.mjs --only b        one of: a, b, c
//   node scripts/acceptance.mjs --base http://localhost:5199
//
//   a. A twice-a-week habit: pending early in the week, pointed out on Saturday, missed once the
//      week is over - and that week keeps reading 1 of 2 whatever is changed afterwards.
//   b. Finishing a workout completes Gym. Nothing is ticked by hand and nothing is stored as a tick.
//   c. Completing the resource at the head of the learning queue moves the next one up.
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { chromium, webkit } from '@playwright/test'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true'])
    return pairs
  }, []),
)
const base = args.base ?? 'http://localhost:5199'
const only = args.only

const results = []
let scenario = ''
const check = (name, ok, detail = '') => {
  results.push({ scenario, name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${scenario}  ${name}${detail ? `  (${detail})` : ''}`)
}

// Edge by default; --browser webkit runs the engine Safari and every iPhone browser use.
const browser = args.browser === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'msedge' })

/** A brand-new install, started at `now`. */
async function install(now) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: 'dark', hasTouch: true })

  // --no-cursors makes every IndexedDB cursor fail, as Safari on the iPhone has been seen to do.
  const NO_CURSORS = () => { for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) for (const name of ['openCursor', 'openKeyCursor']) proto[name] = function () { throw new DOMException('Unable to open cursor', 'UnknownError') } }
  if (args['no-cursors']) await context.addInitScript(NO_CURSORS)
  const page = await context.newPage()
  const problems = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(String(error)))
  await context.clock.setFixedTime(new Date(now))
  await page.goto(`${base}/#/`)
  await page.waitForFunction(() => window.__db !== undefined, null, { timeout: 30000 })
  await page.waitForTimeout(500)

  /** Waits until the screen has finished loading: its text has stopped changing. */
  const settle = async () => {
    await page.waitForLoadState('networkidle').catch(() => undefined)
    let last = null
    let stable = 0
    for (let i = 0; i < 60 && stable < 4; i++) {
      await page.waitForTimeout(150)
      const now = await page.locator('main').textContent().catch(() => null)
      stable = now !== null && now === last ? stable + 1 : 0
      last = now
    }
  }

  /** Opens a screen as it would look at `when`: a cold start at that moment. */
  const open = async (route, when) => {
    if (when) await context.clock.setFixedTime(new Date(when))
    await page.goto(`${base}/#${route}`)
    await page.reload()
    await page.waitForFunction(() => window.__db !== undefined, null, { timeout: 30000 })
    await settle()
  }
  const habitRow = (name) => page.getByRole('button', { name: new RegExp(`^${name}:`) }).first()
  const label = async (name) => (await habitRow(name).getAttribute('aria-label')) ?? ''
  const table = (name) => page.evaluate((tableName) => window.__db.table(tableName).toArray(), name)
  const text = async () => ((await page.locator('main').textContent()) ?? '').replace(/\s+/g, ' ')
  return { context, page, problems, open, settle, habitRow, label, table, text }
}

/** The words under a target's bar on the screen that is showing, for the named habit. */
function targetLine(page, name) {
  return page.evaluate((habitName) => {
    // Every target row carries its state as a word for screen readers. The row for this habit is
    // the one whose state word sits closest to the habit's name.
    let best = { depth: 99, line: '' }
    for (const word of document.querySelectorAll('main .sr-only')) {
      if (!/^(Met|On track|Attention|At risk|Out of reach|Missed|Partial|Not started): $/.test(word.textContent)) continue
      let node = word.parentElement
      for (let up = 0; node && up < 6; up++, node = node.parentElement) {
        if (!node.textContent.includes(habitName)) continue
        if (up < best.depth) best = { depth: up, line: word.parentElement.textContent.replace(/\s+/g, ' ').trim() }
        break
      }
    }
    return best.line
  }, name)
}

async function scenarioA() {
  scenario = 'a'
  // Installed on a Monday, so the first week is tracked whole.
  const app = await install('2026-10-12T09:00:00')
  try {
    await app.open('/today')
    check('starts the week pending at 0 of 2', /0 of 2 this week/.test(await app.label('Hair oiling')), await app.label('Hair oiling'))
    await app.habitRow('Hair oiling').click()
    await app.settle()
    check('one tick reads 1 of 2', /1 of 2 this week/.test(await app.label('Hair oiling')), await app.label('Hair oiling'))

    await app.open('/today', '2026-10-14T09:00:00')
    const midweek = await app.label('Hair oiling')
    check('mid-week it is still open, not a miss', /1 of 2 this week/.test(midweek) && !/missed|at risk/i.test(midweek), midweek)

    await app.open('/', '2026-10-17T09:00:00')
    const saturday = await targetLine(app.page, 'Hair oiling')
    check('on Saturday it is pointed out', /^Attention:/.test(saturday), saturday)

    await app.open('/', '2026-10-18T09:00:00')
    const sunday = await targetLine(app.page, 'Hair oiling')
    check('on Sunday, the last day, it is at risk', /^At risk:/.test(sunday), sunday)

    await app.open('/review/2026-10-12', '2026-10-19T09:00:00')
    const review = await app.text()
    const judged = /Hair oiling\s*1 \/ 2/.test(review) && /Target missed|Missed/.test(review.slice(review.indexOf('Hair oiling'), review.indexOf('Hair oiling') + 120))
    check('once the week is over it is missed at 1 of 2', judged, review.slice(review.indexOf('Hair oiling'), review.indexOf('Hair oiling') + 90))

    await app.open('/today')
    check('the new week starts again from 0 of 2', /0 of 2 this week/.test(await app.label('Hair oiling')), await app.label('Hair oiling'))

    // Now change things, and see that the finished week does not move.
    await app.habitRow('Hair oiling').click()
    await app.settle()
    const habits = await app.table('habits')
    const hair = habits.find((habit) => habit.name === 'Hair oiling')
    await app.open(`/habits/${hair.id}`)
    await app.page.getByRole('button', { name: 'More: Times per week' }).click()
    await app.page.getByRole('button', { name: 'Save', exact: true }).click()
    await app.settle()
    await app.open('/today')
    check('the change applies from today: 1 of 3 this week', /1 of 3 this week/.test(await app.label('Hair oiling')), await app.label('Hair oiling'))

    await app.open('/review/2026-10-12')
    const after = await app.text()
    check('the finished week still reads 1 of 2', /Hair oiling\s*1 \/ 2/.test(after), after.slice(after.indexOf('Hair oiling'), after.indexOf('Hair oiling') + 90))
    // A week is stored for good once none of its days can be corrected any more.
    await app.open('/review/2026-10-12', '2026-10-26T09:00:00')
    const later = await app.text()
    check('a week later it still reads 1 of 2', /Hair oiling\s*1 \/ 2/.test(later), later.slice(later.indexOf('Hair oiling'), later.indexOf('Hair oiling') + 60))
    const kept = (await app.table('weekly_reviews')).find((row) => row.week_start === '2026-10-12')
    const stored = kept?.frozen?.targets?.find((target) => target.name === 'Hair oiling')
    check('and is stored that way for good', stored && stored.done === 1 && stored.target === 2 && stored.outcome === 'missed', JSON.stringify(stored ?? null))
    check('no errors in the console', app.problems.length === 0, app.problems.slice(0, 2).join(' | ').slice(0, 240))
  } finally {
    await app.context.close()
  }
}

async function scenarioB() {
  scenario = 'b'
  const app = await install('2026-10-12T09:00:00')
  try {
    await app.open('/today')
    const before = await app.label('Gym')
    check('Gym starts pending and cannot be ticked by hand', /Pending/.test(before) && (await app.habitRow('Gym').getAttribute('aria-pressed')) === null, before)

    await app.open('/train')
    await app.page.getByRole('button', { name: /^Start / }).first().click()
    await app.page.waitForURL(/#\/train\/session\//, { timeout: 10000 })
    await app.settle()
    await app.page.getByRole('button', { name: /^Set 1: tap when done/ }).first().click()
    await app.settle()
    await app.page.getByRole('button', { name: 'Finish', exact: true }).click()
    await app.page.getByRole('button', { name: 'Finish workout', exact: true }).click()
    await app.settle()

    const sessions = await app.table('sessions')
    const finished = sessions.filter((session) => session.date === '2026-10-12' && session.ended_at !== null)
    check('the workout is recorded as finished', finished.length === 1, `${sessions.length} sessions, ${finished.length} finished today`)

    await app.open('/today')
    const after = await app.label('Gym')
    check('Gym reads done', /Done/.test(after), after)
    const gym = (await app.table('habits')).find((habit) => habit.name === 'Gym')
    const ticks = (await app.table('entries')).filter((entry) => entry.habit_id === gym.id)
    check('with no tick stored for it: the session is the record', ticks.length === 0, `${ticks.length} entries for Gym`)

    await app.open('/')
    const home = await app.text()
    check('and the day score counts it', /1 \/ \d+/.test(home), (home.match(/\d+ \/ \d+ so far/) ?? [''])[0])
    check('no errors in the console', app.problems.length === 0, app.problems.slice(0, 2).join(' | ').slice(0, 240))
  } finally {
    await app.context.close()
  }
}

async function scenarioC() {
  scenario = 'c'
  const app = await install('2026-10-12T09:00:00')
  try {
    const seed = await import(pathToFileURL(resolve('scripts/seeds/learn-queue.mjs')).href)
    await seed.default(app.page)
    await app.open('/learn/today')
    const heading = () => app.page.locator('main h2').first().textContent()
    check('the head of the queue is today\'s learning', (await heading()) === 'AI Agents - Lesson 3', (await heading()) ?? '')
    const before = await app.text()
    check('with the next one shown after it', before.indexOf('RAG Fundamentals') > before.indexOf('AI Agents - Lesson 3'), '')

    await app.page.getByRole('button', { name: 'Mark complete', exact: true }).click()
    await app.page.getByRole('button', { name: 'Save and mark completed', exact: true }).click()
    await app.settle()

    check('the next resource moves up', (await heading()) === 'RAG Fundamentals', (await heading()) ?? '')
    const resources = await app.table('learning_resources')
    const done = resources.find((resource) => resource.title === 'AI Agents - Lesson 3')
    const next = resources.find((resource) => resource.title === 'RAG Fundamentals')
    check('the finished one is completed, dated today', done?.status === 'completed' && done?.completed_on === '2026-10-12', `${done?.status} ${done?.completed_on}`)
    const lowest = Math.min(...resources.filter((resource) => resource.status === 'queued' && resource.queue_position !== null).map((resource) => resource.queue_position))
    check('and has left the queue, with the next one at its head', done?.queue_position === null && next?.queue_position === lowest, `finished at ${done?.queue_position}, next at ${next?.queue_position}, head at ${lowest}`)

    await app.open('/today')
    const learning = await app.label('Learning')
    check('the Learning habit is done, from the session', /Done/.test(learning), learning)
    check('no errors in the console', app.problems.length === 0, app.problems.slice(0, 2).join(' | ').slice(0, 240))
  } finally {
    await app.context.close()
  }
}

try {
  for (const [id, run] of [['a', scenarioA], ['b', scenarioB], ['c', scenarioC]]) {
    if (only && only !== id) continue
    try {
      await run()
    } catch (error) {
      check('ran to the end', false, String(error).split('\n')[0].slice(0, 260))
    }
  }
} finally {
  await browser.close()
}
const failed = results.filter((result) => !result.ok)
console.log(failed.length ? `\n${failed.length} of ${results.length} checks FAILED` : `\nall ${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
