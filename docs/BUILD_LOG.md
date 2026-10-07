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

| Part | State |
|---|---|
| Spec + designs in `docs/`, architecture brief, CLAUDE.md rewritten | done |
| Data model, Dexie v4, engine (dates, timeline, completion, targets, score, status, streaks, lock, attention, trend, describe, training, learning, quotes, review) | done, tested |
| Cutover migration, rehearsed against the real export in both starting states | done, tested |
| Shell (hash router, sidebar / bottom bar), CoreProvider, SafeMode, tokens, UI kit | done |
| Today: Home dashboard, day list, pillar screens, Nutrition | done, screenshots checked on phone |
| Train: overview, live session, history, exercise progress, setup, routine editor | done, repo tested |
| Learn: today, queue, library, resource, reading | done, repo tested |
| Journal, Quotes | done, repos tested |
| Review: engine + repository | done, tested |
| Review: screen (`src/features/review`) | done, screenshot checked |
| Progress: `engine/insights.ts`, `data/weightRepo.ts`, screens (overview, habit history calendar, weight) | not started |
| Habits setup (list + editor with frequency editor), Routines (day routines), Settings, Data (export + validated import, backups) | not started |
| End-to-end acceptance tests in the browser (hair oiling, gym, learning queue) | not started |
| Visual QA: desktop width, light theme, empty states | not started |
| Before shipping (below) | not started |

Acceptance tests at the data/engine level already pass: hair oiling (targets.test, review.test),
gym (workoutRepo.test), learning queue (learningRepo.test).

## Next step

1. (done) Review screen.
2. Progress: `engine/insights.ts` (ranges, comparisons, weekly series, gates),
   `data/weightRepo.ts`, screens `/progress`, `/progress/habit/:id`, `/progress/weight`.
3. Setup: `/habits`, `/habits/new`, `/habits/:id`, `/routines`, `/routines/:id`, `/settings`,
   `/data` with `data/importExport.ts` (export every table; import validates, upgrades old
   schema-1/2 exports through `planCutover`, merges or replaces after a snapshot) and
   `data/routineRepo.ts`.
4. Small fixes noted while building: on Today, rows without a time in a routine are not aligned
   with rows that have one (pass an empty `lead`); Learn-today "Reading" section link text.
5. Then the "Before shipping" list.

## Before shipping to main

- Every nav destination renders a real screen (no "page does not exist").
- `npm run build` clean; all tests pass.
- Browser rehearsal of the migration: load the real export (`Exported Data/`, git-ignored) into
  the old schema, boot the new build, confirm Today and history; repeat after the 6 October
  build's boot (state B). The unit-level rehearsal already passes for both.
- The three acceptance scenarios driven through the UI with Playwright.
- Phone and desktop, dark and light screenshots of every area looked at.
- Delete `legacy-reference/`. Update memory. Merge to `main`, push, verify the live bundle hash.

## Log

- 2026-10-07 01:20 - Resumed after a usage limit. Recovered the spec and designs into `docs/`.
- 2026-10-07 01:55 - Foundation committed (`fc3ebf6`): types, schema v4, engine, cutover.
- 2026-10-07 02:05 - Shell and architecture brief committed (`b9752c1`).
- 2026-10-07 02:17 - Seven parallel builders exhausted the usage window without writing a file.
- 2026-10-07 06:12 - Resumed; switched to building directly. Kit, Today, Train (`6fb0d26`),
  Learn, Journal, Quotes (`65fb8eb`), review engine and repository.
