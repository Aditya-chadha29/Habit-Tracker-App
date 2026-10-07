# Personal OS — project rules

A private, single-user "personal operating system": daily routine and habits, nutrition and
supplements, gym training, a learning queue, a journal, weekly review and long-term progress.
Local-first PWA. It grew out of a habit tracker and still carries that app's data and database
name (`habit-tracker`), which must never be renamed.

**Read before changing anything:**
- [`docs/product-spec.md`](docs/product-spec.md) — the product definition, verbatim from the user.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the rules, code layout and contracts. Binding.
- [`docs/design/`](docs/design/) — the reference design boards.

## The rules that outrank everything else

- **History is truth.** A lived day is never rescored by a later change. Habits are retired, never
  deleted (delete exists only for a habit created today). A rename, re-categorisation or new
  frequency starts today as a new dated chapter in `habit.versions`; earlier chapters are never
  edited. Past days older than the editing window (default 7 days, counting today) are read-only,
  and that lock is enforced in the repositories, not just hidden in the UI.
- **Not due is not missed; pending is not missed.** Only due items are in a day's score. A
  flexible target ("2 per week") is never in a day's score and is called missed only after its
  period has ended. Today's unfinished items are pending — "12 / 17 so far".
- **Nothing derived is stored.** Gym is done because a finished workout session exists that day;
  no flag is written to say so. Every number on every screen comes from `src/engine`.
- **Dates are local `YYYY-MM-DD` strings.** Never `toISOString()`, never a date derived from a
  timestamp. The user is in IST (UTC+5:30): UTC moves everything before 05:30 into the previous
  day, which breaks the 4 AM wake-up habit specifically. Week starts Monday unless the setting
  says otherwise.
- **Local-first, quiet, not a work tool.** No accounts, sync, analytics, external APIs,
  notifications, gamification, confetti, streak flames, AI coach, tasks, projects or CRM.
- **Polarity.** For an `abstain` habit, done means "held" and a miss is "broken" — never
  completed / missed.

## Stack (do not substitute)

React + TypeScript · Vite with `vite-plugin-pwa` · Tailwind v4 · IndexedDB via Dexie (not
localStorage) · Chart.js (the only charting library) · Vitest · Playwright · hosted on Vercel.

## Data safety

- Dexie versions are append-only and list only new tables; no `upgrade()` callbacks.
- Row changes are ledgered steps in `src/data/migrations/index.ts`, each atomic, each preceded by
  a full copy of the database in the separate `habit-tracker-backups` database. A shipped step is
  never edited — a correction is a new step.
- **Never put start-up code that rewrites the user's rows on every launch.** The build of
  6 October 2026 did (`applyPendingSetup`), and it undid the user's own edits on each start. Seeds
  and one-time corrections belong in the migration ledger, where they run once.
- Every read-then-write goes inside a transaction. Never index a boolean. Never feed a
  key-dependent live query into an uncontrolled input's `defaultValue` (use `useKeyedLiveQuery`).
- The user's exported data lives in `Exported Data/`, which is git-ignored. It is personal: never
  commit it, never paste its contents into an issue, a log or a test fixture.

## Design and tone

Dark navy, premium, calm, slightly technical; light theme is the same design with the tokens
re-pointed. Colours come only from the tokens in `src/index.css`. Phone first at 390 px with a
five-item bottom bar (Today, Learn, Train, Review, Progress); a sidebar and genuinely wider layouts
from 1024 px. Every tappable thing is at least 44 px. Status is never shown by colour alone.

Copy reports and never comments: "Hair oiling: 1 of 2. 1 session still required." No praise, no
blame, no exclamation marks.

Decisions the user has already made, so they are not re-opened:
- A **daily quote** is wanted, on Today (and optionally Review / Journal). It is the one place
  motivational copy is allowed; keep it a single quiet line, never banners or toasts.
- A "+1 fly-to-counter" tap animation was tried and reverted. The tick-pop is the only
  acknowledgement; do not add flying, XP-style or celebratory effects.
- Extra style themes (Cybercore, Scrapbook, Glassmorphism, Wabi-sabi) were built and then removed
  at the user's request. Themes are System / Light / Dark only.
- The palette is blue on navy; the earlier brown palette was rejected.
- Gym is a daily habit with a 7-per-week target, completed only by a logged session (lifting or
  cardio-only). Hair oiling is 2 per week. Vitamin D is weekly, on Mondays.

## Working here

- `npm test` (Vitest), `npm run build` (type-check + production build). `npm run lint` is
  currently broken on this machine (oxlint native binding missing) — rely on `tsc`.
- Screens are checked in a real browser: `npx vite --port 5199 --strictPort`, then
  `node scripts/shot.mjs --route / --out shots/x.png` (Edge via Playwright; Chrome is not
  installed here).
- `main` auto-deploys to the user's phone through Vercel. Verify a deploy by matching the bundle
  hash in `dist/index.html` against the live site, not by the push succeeding.
- The three acceptance scenarios run through the UI with `node scripts/acceptance.mjs` (add
  `--browser webkit` for Safari's engine). An upgrade from any old release is rehearsed with
  `node scripts/rehearse-migration.mjs --export <file> --chain <commits>`; run it before any
  change to `src/data/migrations/` reaches `main`.
