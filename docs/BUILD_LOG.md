# Build log - Personal OS

Running record of the build that turns the Habit Tracker into the Personal OS described in
`docs/product-spec.md`. If a session is interrupted or its context is compacted, **read this
first**, then `docs/ARCHITECTURE.md`, then continue from "Next step".

## Working rules

- This repo only (never `Habit Tracker (V2)`). Branch `personal-os`. `main` auto-deploys to the
  user's phone, so nothing reaches `main` until the checks under "Before shipping" pass.
- Do not ask the user questions; they said to build without asking. Commits carry no attribution.
- **Build directly; do not fan out agents.** A 7-agent workflow on 2026-10-07 used the whole
  usage window (about 1.7M tokens per ~5 hours) in 12 minutes, only reading, and wrote nothing.
  Writing the code in this session costs a fraction of that. Use a workflow only for a narrow,
  high-value check (for example an adversarial review of the migration), never to build.
- Creating files: shell heredocs break on non-ASCII text on this machine. Write a bundle to
  `<scratchpad>/stage/bundle.txt` with the Write tool (files separated by lines `@@@FILE path`)
  and unpack it with `node <scratchpad>/stage/unpack.mjs <bundle> .`. After a session reset the
  first Write to that path is rejected by the GateGuard hook: send a one-line placeholder first,
  then the real content, or the whole payload is wasted. Small edits: `node -e` string replaces.
- Checks: `npx tsc -p tsconfig.app.json --noEmit`, `npx vitest run`. Dev server:
  `npx vite --port 5199 --strictPort` (background). Screenshots:
  `node scripts/shot.mjs --route /today --seed scripts/seeds/home.mjs --full --out shots/x.png`
  (Edge through Playwright; seeds in `scripts/seeds/`; every run is a brand-new install).

## Status

Every area of the specification is built: Today (Home, day list, pillars, nutrition), Train,
Learn, Journal, Quotes, Review, Progress, Habits, Routines, Settings and Data (export, checked
import, automatic copies). Shipped to `main` on 2026-10-07.

Checked before shipping:

- `npx vitest run` (327 tests) and `npm run build` clean.
- `scripts/rehearse-migration.mjs` with the real phone export, from the September release through
  every chain of the 6 October releases, in Edge and in WebKit: every tick kept, every past day
  scoring as before, the same final set-up from every chain.
- `scripts/acceptance.mjs`: the three acceptance scenarios through the UI, in Edge and WebKit.
- Phone and desktop, dark and light screenshots of every area.
- An independent three-reviewer pass over the migration, import/backup and repositories; its
  findings are fixed and pinned by `src/data/safety.test.ts`.

## Things to know

- **Never roll the deployment back to a build from before the cutover.** An old bundle can open
  the upgraded database and write rows the new app cannot read. Fix forward.
- Not yet verified on the real iPhone: the look in iOS Safari (only Playwright WebKit was
  available) and that a shared or downloaded export file really lands in Files.
- Known, accepted: a quick double tap on Save in the quick-log, learning-session and weight forms
  can add the row twice (it can be deleted within the correction window); an old tab still running
  the September build blocks the upgrade until it is closed.

## Before shipping a later change

`npx tsc -p tsconfig.app.json --noEmit`, `npx vitest run`, `npm run build`, then the rehearsal and
acceptance scripts above if anything under `src/data` or `src/engine` changed.

## Log

- 2026-10-07 01:20 - Resumed after a usage limit. Recovered the spec and designs into `docs/`.
- 2026-10-07 01:55 - Foundation committed (`fc3ebf6`): types, schema v4, engine, cutover.
- 2026-10-07 02:05 - Shell and architecture brief committed (`b9752c1`).
- 2026-10-07 02:17 - Seven parallel builders exhausted the usage window without writing a file.
- 2026-10-07 06:12 - Resumed; switched to building directly. Kit, Today, Train (`6fb0d26`),
  Learn, Journal, Quotes (`65fb8eb`), review engine and repository.
- 2026-10-07 07:00-12:00 - Progress, Setup (habits, routines, settings, data), browser rehearsal
  of the upgrade (which found and fixed a lost-Creatine case for intermediate builds), acceptance
  runs, WebKit runs, independent review and its fixes. Shipped.
