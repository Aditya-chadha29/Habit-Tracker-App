// Rehearses the real upgrade path in a real browser: an old release of the app holding real data,
// then (optionally) the releases in between, then the current build on top of it.
//
//   node scripts/rehearse-migration.mjs --export "Exported Data/file.json" --chain f9640b1,02634a2
//
// Options:
//   --export   an export file from the old app
//   --chain    commits, oldest first, comma separated. The export is loaded into the first one;
//              each later one is then opened in turn, as a phone would have updated through them
//   --old-now  local date-time the old releases run at        (default 2026-10-06T21:00:00)
//   --new-now  local date-time the current build first runs at (default 2026-10-07T07:30:00)
//   --shots    prefix for screenshots of the migrated app, e.g. shots/rehearsal-a (default: none)
//   --habits   also print the resulting habits (names and schedules), to compare chains
//   --port     port to serve on (default 5311)
//
// The current build is read from dist/, so run `npm run build` first. Old releases are built once
// into test-results/rehearsal/ and reused. Prints counts and verdicts only, never what the export
// contains.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium, webkit } from '@playwright/test'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true'])
    return pairs
  }, []),
)
if (!args.export || !args.chain) {
  console.error('usage: node scripts/rehearse-migration.mjs --export <file> --chain <commit>[,<commit>...]')
  process.exit(2)
}
const chain = args.chain.split(',').map((part) => part.trim()).filter(Boolean)
const oldNow = new Date(args['old-now'] ?? '2026-10-06T21:00:00')
const newNow = new Date(args['new-now'] ?? '2026-10-07T07:30:00')
const port = Number(args.port ?? 5311)
const base = `http://localhost:${port}`
const DB = 'habit-tracker'
const BACKUPS = 'habit-tracker-backups'
const LEDGER = ['001-cutover', '002-training-library', '003-quotes', '004-learning-pillars', '005-weekly-records', '006-more-quotes', '007-four-pillars']

const env = { ...process.env, PATH: `C:\\Program Files\\Git\\cmd;${process.env.PATH ?? ''}` }

/** Builds one old release into its own folder. Kept inside the project so imports resolve. */
function distOf(commit) {
  const dir = resolve('test-results/rehearsal', commit)
  const dist = join(dir, 'dist')
  if (existsSync(join(dist, 'index.html'))) return dist
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const tarball = join(dir, 'source.tar')
  execFileSync('git', ['archive', '-o', tarball, commit], { env, stdio: 'pipe' })
  // Relative names: GNU tar reads a drive letter as a remote host.
  execFileSync('tar', ['-xf', 'source.tar'], { cwd: dir, env, stdio: 'pipe' })
  execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: dir, env, stdio: 'pipe' })
  return dist
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
}
let served = ''
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, base).pathname)
  const file = normalize(join(served, path === '/' ? 'index.html' : path))
  if (!file.startsWith(served) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404)
    response.end('not found')
    return
  }
  response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  response.end(readFileSync(file))
})

/** Every row of every table, read with plain IndexedDB so it works against any release. */
function dump(page, name) {
  return page.evaluate(async (dbName) => {
    const known = (await indexedDB.databases()).map((entry) => entry.name)
    if (!known.includes(dbName)) return null
    const db = await new Promise((ok, fail) => {
      const request = indexedDB.open(dbName)
      request.onsuccess = () => ok(request.result)
      request.onerror = () => fail(request.error)
    })
    const tables = {}
    for (const store of db.objectStoreNames) {
      tables[store] = await new Promise((ok, fail) => {
        const request = db.transaction(store).objectStore(store).getAll()
        request.onsuccess = () => ok(request.result)
        request.onerror = () => fail(request.error)
      })
    }
    const version = db.version
    db.close()
    return { version, tables }
  }, name)
}

/** Replaces what the old release seeded with the rows of the export. */
function inject(page, tables) {
  return page.evaluate(
    async ({ dbName, rows }) => {
      const db = await new Promise((ok, fail) => {
        const request = indexedDB.open(dbName)
        request.onsuccess = () => ok(request.result)
        request.onerror = () => fail(request.error)
      })
      const stores = [...db.objectStoreNames]
      await new Promise((ok, fail) => {
        const tx = db.transaction(stores, 'readwrite')
        for (const store of stores) {
          const target = tx.objectStore(store)
          target.clear()
          for (const row of rows[store] ?? []) target.add(row)
        }
        tx.oncomplete = () => ok()
        tx.onerror = () => fail(tx.error)
        tx.onabort = () => fail(tx.error)
      })
      db.close()
      return stores
    },
    { dbName: DB, rows: tables },
  )
}

/** Waits until the app has rendered and has stopped writing to its database. */
async function settle(page) {
  await page.waitForFunction(() => document.querySelector('#root')?.childElementCount > 0, null, { timeout: 30000 })
  let last = ''
  let stable = 0
  for (let i = 0; i < 40 && stable < 3; i++) {
    await page.waitForTimeout(400)
    const now = JSON.stringify(await dump(page, DB))
    stable = now === last ? stable + 1 : 0
    last = now
  }
}

const counts = (state) => Object.fromEntries(Object.entries(state.tables).filter(([, rows]) => rows.length).map(([name, rows]) => [name, rows.length]))
const results = []
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail })

const file = JSON.parse(readFileSync(resolve(args.export), 'utf8'))
const exported = Object.fromEntries(Object.entries(file).filter(([, value]) => Array.isArray(value)))

console.log(`chain: ${chain.join(' -> ')} -> current build`)
const dists = chain.map(distOf)
if (!existsSync(resolve('dist/index.html'))) throw new Error('dist/ is missing: run npm run build first')

await new Promise((ok) => server.listen(port, ok))
// Edge by default; --browser webkit runs the engine Safari and every iPhone browser use.
const browser = args.browser === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'msedge' })
let failed = false
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const problems = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(String(error)))
  await context.clock.setFixedTime(oldNow)

  // The oldest release, holding exactly what the phone held when it was exported.
  served = dists[0]
  await page.goto(base)
  await settle(page)
  const stores = await inject(page, exported)
  await page.reload()
  await settle(page)
  let state = await dump(page, DB)
  console.log(`${chain[0]}: export loaded into [${stores.join(', ')}] -> db v${state.version / 10}`, counts(state))
  const original = state

  // Each release in between, opened twice: an update, then an ordinary later visit.
  for (let i = 1; i < chain.length; i++) {
    served = dists[i]
    for (let visit = 0; visit < 2; visit++) {
      await page.goto(base)
      await page.reload()
      await settle(page)
    }
    state = await dump(page, DB)
    console.log(`${chain[i]}: db v${state.version / 10}`, counts(state))
  }
  const before = state
  const oldProblems = problems.splice(0)
  if (oldProblems.length) console.log(`  (old releases logged ${oldProblems.length} console error(s); not judged here)`)

  // The current build, on top of all that.

  // --no-cursors makes every IndexedDB cursor fail, as Safari on the iPhone has been seen to do.
  const NO_CURSORS = () => { for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) for (const name of ['openCursor', 'openKeyCursor']) proto[name] = function () { throw new DOMException('Unable to open cursor', 'UnknownError') } }
  if (args['no-cursors']) await context.addInitScript(NO_CURSORS)
  served = resolve('dist')
  await context.clock.setFixedTime(newNow)
  await page.goto(base)
  await settle(page)
  const heading = (await page.locator('h1').first().textContent().catch(() => '')) ?? ''
  const after = await dump(page, DB)
  const backups = await dump(page, BACKUPS)
  console.log(`current build: db v${after.version / 10}`, counts(after))

  check('the app starts (no safe mode)', !/could not start|out of date/i.test(heading), heading.trim().slice(0, 60))
  check('no console errors on first start', problems.length === 0, problems.slice(0, 3).join(' | ').slice(0, 300))
  check('database is at version 4', after.version === 40, `v${after.version / 10}`)

  const ledger = (after.tables.migrations ?? []).map((row) => row.id).sort()
  check('every data step ran once', JSON.stringify(ledger) === JSON.stringify(LEDGER), ledger.join(', '))

  const report = (after.tables.migrations ?? []).find((row) => row.id === '001-cutover')?.notes ?? {}
  check('recognised as an existing install', report.kind === 'existing', `kind=${report.kind}, patch_date=${report.patch_date}, cutover=${report.cutover_date}`)
  const parity = report.parity
  const differing = parity?.mismatches?.length ?? 0
  check(
    'every past day scores exactly as before',
    parity && parity.days_checked > 0 && differing === 0,
    parity ? `${parity.days_checked} days checked, ${differing} differ` + (differing ? ': ' + parity.mismatches.slice(0, 5).map((m) => `${m.date} ${m.before} to ${m.after}`).join(', ') : '') : 'no report',
  )

  const key = (row) => `${row.habit_id}|${row.date}`
  const afterEntries = new Map()
  let duplicates = 0
  for (const row of after.tables.entries ?? []) {
    if (afterEntries.has(key(row))) duplicates += 1
    afterEntries.set(key(row), row)
  }
  const beforeEntries = before.tables.entries ?? []
  const lostDone = beforeEntries.filter((row) => row.done && !afterEntries.get(key(row))?.done).length
  const flipped = beforeEntries.filter((row) => !row.done && afterEntries.get(key(row))?.done).length
  check('every tick is still a tick', lostDone === 0, `${beforeEntries.filter((row) => row.done).length} ticks before, ${lostDone} lost`)
  check('no day has two rows for one habit', duplicates === 0, `${duplicates} duplicates`)
  console.log(`  entries: ${beforeEntries.length} before, ${(after.tables.entries ?? []).length} after; ${flipped} not-done rows became done`)

  const exportTicks = (exported.entries ?? []).filter((row) => row.done)
  const lostFromExport = exportTicks.filter((row) => !afterEntries.get(key(row))?.done).length
  check('every tick in the export survived the whole chain', lostFromExport === 0, `${exportTicks.length} ticks in the export, ${lostFromExport} lost`)

  const afterHabitIds = new Set((after.tables.habits ?? []).map((row) => row.id))
  const missingHabits = (before.tables.habits ?? []).filter((row) => !afterHabitIds.has(row.id)).length
  check('no habit was deleted', missingHabits === 0, `${(before.tables.habits ?? []).length} before, ${(after.tables.habits ?? []).length} after, ${missingHabits} missing`)
  const invalid = (after.tables.habits ?? []).filter((row) => !Array.isArray(row.versions) || row.versions.length === 0).length
  check('every habit has its dated chapters', invalid === 0, `${invalid} without`)

  const snapshots = backups?.tables.snapshots ?? []
  const first = snapshots.find((row) => row.label === 'before-001-cutover')
  check(
    'a full copy from before the change is kept',
    first && first.tables.entries.length === beforeEntries.length && first.tables.habits.length === (before.tables.habits ?? []).length,
    first ? `${first.row_count} records` : `${snapshots.length} copies, none labelled before-001-cutover`,
  )

  const settings = new Map((after.tables.settings ?? []).map((row) => [row.key, row.value]))
  const pad = (n) => String(n).padStart(2, '0')
  const cutoverDay = `${newNow.getFullYear()}-${pad(newNow.getMonth() + 1)}-${pad(newNow.getDate())}`
  check('the change is dated to the day it ran', settings.get('cutover_date') === cutoverDay, String(settings.get('cutover_date')))

  const weights = (before.tables.weekly_records ?? []).filter((row) => typeof row.weight_kg === 'number').length
  check('every weight was carried over', (after.tables.weight_entries ?? []).length === weights, `${weights} before, ${(after.tables.weight_entries ?? []).length} after`)
  const notes = (before.tables.weekly_records ?? []).filter((row) => typeof row.notes === 'string' && row.notes.trim()).length
  const carried = (after.tables.weekly_reviews ?? []).filter((row) => typeof row.legacy_notes === 'string' && row.legacy_notes.trim()).length
  check('every weekly note was carried over', carried === notes, `${notes} before, ${carried} after`)

  // An end-to-end sample that does not rely on the app's own report: the score the new screens
  // show for a past day against the old rule applied to the original rows. Only days well before
  // any of the 6 October releases, where the old rule is simply done / active.
  const habits = original.tables.habits ?? []
  const ticked = new Set((original.tables.entries ?? []).filter((row) => row.done).map(key))
  // Today shows only the days that can still be corrected: the six before the first run.
  const shownFrom = new Date(Date.UTC(newNow.getFullYear(), newNow.getMonth(), newNow.getDate() - 6)).toISOString().slice(0, 10)
  const sample = [...new Set((original.tables.entries ?? []).map((row) => row.date))].filter((date) => date >= shownFrom && date <= '2026-10-05').sort()
  const wrong = []
  for (const date of sample) {
    const active = habits.filter((habit) => habit.created_on <= date && (!habit.retired_on || habit.retired_on > date))
    const expected = `${active.filter((habit) => ticked.has(`${habit.id}|${date}`)).length} / ${active.length}`
    await page.goto(`${base}/#/today?d=${date}`)
    await page.waitForTimeout(500)
    const text = ((await page.locator('main span.tnum').first().textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
    if (text !== expected) wrong.push(`${date}: shows "${text}", expected "${expected}"`)
  }
  check('past days read the same on screen', wrong.length === 0, wrong.length ? wrong.join('; ') : sample.length ? `${sample.length} days sampled` : 'not sampled: no day is both still shown and before 6 October')

  // A second start must change nothing.
  await page.goto(base)
  await page.reload()
  await settle(page)
  const again = await dump(page, DB)
  check('starting again changes nothing', JSON.stringify(again) === JSON.stringify(after), '')

  if (args.shots) {
    for (const [name, route] of [['home', '/'], ['today', '/today'], ['review', '/review'], ['progress', '/progress'], ['habits', '/habits']]) {
      await page.goto(`${base}/#${route}`)
      await page.waitForTimeout(900)
      await page.screenshot({ path: resolve(`${args.shots}-${name}.png`) })
    }
  }

  if (args.habits) {
    // The resulting set-up, for comparing one chain with another. Names and schedules only.
    console.log('')
    for (const habit of [...(after.tables.habits ?? [])].sort((x, y) => x.sort_order - y.sort_order)) {
      const now = habit.versions[habit.versions.length - 1]
      const rule = now.day.kind + (now.day.weekdays ? '[' + now.day.weekdays.join('') + ']' : '') + (now.target ? ' ' + now.target.count + '/' + now.target.per : '')
      const dose = habit.dose ? ' dose=' + habit.dose.amount + habit.dose.unit : ''
      console.log('  ' + String(habit.id).padStart(2) + ' ' + (habit.retired_on ? 'retired ' + habit.retired_on : 'active            ').padEnd(18) + ' ' + habit.kind.padEnd(10) + ' ' + now.area.padEnd(8) + ' ' + habit.name.padEnd(26) + ' ' + rule.padEnd(18) + ' ' + now.sources.join('+') + dose + ' chapters=' + habit.versions.length + ' from=' + habit.created_on)
    }
  }

  console.log('')
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? `  (${result.detail})` : ''}`)
  failed = results.some((result) => !result.ok)
  console.log(failed ? '\nREHEARSAL FAILED' : '\nREHEARSAL PASSED')
} finally {
  await browser.close()
  server.close()
}
process.exit(failed ? 1 : 0)
