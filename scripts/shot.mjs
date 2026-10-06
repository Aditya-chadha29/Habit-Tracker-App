// Takes a screenshot of one route of the running dev server, in a throwaway browser profile.
//
//   node scripts/shot.mjs --route /learn --out shots/learn.png
//   node scripts/shot.mjs --route / --viewport desktop --theme light --out shots/home-light.png
//   node scripts/shot.mjs --route /learn --seed scripts/seeds/learn.mjs --out shots/learn.png
//
// Options:
//   --route     hash route to open (default "/")
//   --out       PNG path (default "shots/shot.png")
//   --viewport  phone (390x844, default) | desktop (1280x800) | tablet (820x1180)
//   --theme     dark (default) | light
//   --seed      a module exporting `default async (page) => {}`; it runs after the app has
//               started and its migrations have finished. Use page.evaluate with window.__db
//               (the Dexie database, exposed in dev only) to add rows, then the script reloads.
//   --now       ISO local date-time to freeze the clock at, e.g. "2026-10-10T09:00:00"
//   --full      capture the full scroll height of the page body instead of the viewport
//   --base      dev server origin (default http://localhost:5199)
//
// Every run starts from an empty database: the app seeds itself as a brand-new install.
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true'])
    return pairs
  }, []),
)

const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 }, tablet: { width: 820, height: 1180 } }
const route = args.route ?? '/'
const out = resolve(args.out ?? 'shots/shot.png')
const viewport = VIEWPORTS[args.viewport ?? 'phone'] ?? VIEWPORTS.phone
const theme = args.theme === 'light' ? 'light' : 'dark'
const base = args.base ?? 'http://localhost:5199'

const browser = await chromium.launch({ channel: 'msedge' })
try {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: theme,
    hasTouch: (args.viewport ?? 'phone') !== 'desktop',
  })
  const page = await context.newPage()
  const problems = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(String(error)))
  if (args.now) await page.clock.setFixedTime(new Date(args.now))

  await page.goto(`${base}/#${route}`)
  await page.waitForFunction(() => document.querySelector('#root')?.childElementCount > 0, null, { timeout: 20000 })
  await page.waitForFunction(() => window.__db !== undefined, null, { timeout: 20000 })

  if (args.seed) {
    const seed = await import(pathToFileURL(resolve(args.seed)).href)
    await seed.default(page)
    await page.reload()
    await page.waitForFunction(() => window.__db !== undefined, null, { timeout: 20000 })
  }

  await page.waitForTimeout(700)
  mkdirSync(dirname(out), { recursive: true })
  if (args.full === 'true') {
    // Screens scroll inside their own container, so a full-page capture needs the viewport grown
    // to the content's height first.
    const height = await page.evaluate(() => {
      const scrollers = [...document.querySelectorAll('main .overflow-y-auto')]
      const tallest = scrollers.reduce((max, el) => Math.max(max, el.scrollHeight - el.clientHeight), 0)
      return window.innerHeight + tallest
    })
    await page.setViewportSize({ width: viewport.width, height: Math.min(height, 6000) })
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: out })
  console.log(`saved ${out}`)
  if (problems.length) {
    console.log(`console errors (${problems.length}):`)
    for (const problem of problems.slice(0, 12)) console.log(`  ${problem}`)
  }
} finally {
  await browser.close()
}
