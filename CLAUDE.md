# IKIKATA — project rules

The app is named IKIKATA (named by the user on 2026-10-08; earlier called Personal OS). A private, single-user "personal operating system": daily routine and habits, nutrition and
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
  day, which breaks the 4 AM wake-up habit specifically. The week starts on Sunday (changed from Monday by the user on
  2026-10-07) unless the setting says otherwise.
- **Local-first, quiet, not a work tool.** The device's own database is the working copy and the
  app must open and work with no connection. The one exception to "no accounts, no sync" is the
  **cloud copy** the user asked for on 2026-10-08 (after a re-added home-screen icon started
  empty): the whole record saved to their own Firebase project (`src/sync`), signed in with
  Google or email. It replaces a device's record only when that device has nothing of its own or
  has not changed; otherwise it asks. No analytics, other external APIs,
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

Sakura at dusk (the user's theme brief of 2026-10-08, which replaced the blue-on-navy look): deep
navy and charcoal surfaces, one sakura pink used sparingly, warm cream for editorial text; Shippori
Mincho for titles, quotes and the wordmark, Zen Kaku Gothic New for everything functional, Geist
for numbers. Done is pink, not green. English only: no Japanese characters anywhere in the UI. No
Meditation, Calendar or Profile screens. Light theme is the same design with the tokens
re-pointed. Colours come only from the tokens in `src/index.css`. Phone first at 390 px with no
bottom bar: every destination (Home, Learn, Train, Review, Journal, Habits, Routines, Settings) is in
the menu behind the grid button at the top left, as the user asked on 2026-10-07; a sidebar and genuinely wider layouts
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
- The palette is sakura pink on deep navy (see above); the earlier brown palette was rejected.
- Home shows only the date, the quote, the Today and This week rings, the four pillars and what needs attention. The
  user removed the weekly targets list, Next, Still open today and the trend from it. The quote
  appears on Home only. Review and Progress are one place with a two-way switch. Quotes and Data
  live inside Settings. Learn is the pillars screen alone for now; its queue, library and reading
  screens are kept unlinked until the user decides what Learn should hold.
- Gym is a daily habit with a 7-per-week target, completed only by a logged session (lifting or
  cardio-only). Hair oiling is 2 per week. Vitamin D is weekly, on Sundays (moved from Monday by the user on 2026-10-08).
- The day-routine system (Morning routine, Evening routine and their steps) was removed on
  2026-10-08, with Water on waking, Cardio and the three Daily 10s retired: exercise on Today is
  Gym alone. Habit rows show no amount line ("2 capsules", "1 tbsp"). The journal is an evening
  page.
- Today is one list in the order of the day (the habits' own order, dragged in Habits), not grouped
  by pillar (2026-10-12). Reading and Writing / reflection are retired; Cold shower and Haircare were
  added and Daily moisturiser renamed Skincare. On Home the cards run Today, This week, Learning,
  Exercise, Mind, Body; Learning and Exercise show a tick and a word instead of "0 / 1", and the
  rings carry a % sign. Learn has the Learning habit's tick at the top.
- Scenery is a page background (Home, Learn, Review, Progress at the top; Journal at the foot), never
  a picture in a box. An opening screen shows for about 1.6 s on each launch.

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

## Training and weekly report (2026-11-01)

- Weights are always stored in kg; `settings.weight_unit` only changes what is shown and typed. Dumbbell weights are both dumbbells together.
- From 2026-11-02 a finished session with no sets does not complete Gym. Unweighted reps on a weighted lift are not hard sets for muscles.
- Train opens with the body map (hard sets this week; assisting muscles count for half). Review has a Gym and diet card computed on the device. No cloud agent was built, and no Firebase admin key exists.

## Roadmap (2026-11-13)

The next work is laid out step by step in [`docs/ROADMAP.md`](docs/ROADMAP.md). Follow it in order and tick phases off there.
User decisions recorded with it: no PIN lock; Gym target stays 7 a week; Wake up at 4:00 AM stays a tick; dark theme only (the light theme is to be removed); the Journal stays and Plan tomorrow is added beside it.

## Built from the roadmap (2026-11-13)

- Dark theme only: the light tokens, the Theme setting and the boot script choice are gone; `settings.theme` stays in the record for old exports. This replaces "Themes are System / Light / Dark only" and "Light theme is the same design" above.
- A day off (`day_marks`: rest, travel, sick) has nothing due: `index.daysOff` is honoured by `dueItems`, `dayStatus` and `isDueOn`. It can only be set inside the editing window, so locked days and frozen weeks never change. Rows stay tickable on a day off.
- Dexie is at version 5 (`day_marks`, `day_plans`, `measurements`). The ledger ends at `019-water-by-the-glass`; the next id is `020-...`.
- The opening screen shows once a day. A tick shows an Undo toast (the one allowed acknowledgement besides the tick-pop). Meals rest as one line and open on tap.
- Train opens on Start: today's routine carries the only filled button; other routines are rows. The kg/lb switch lives in Settings only.
- Home also carries, when they apply: Up next for learning, the plan for tomorrow (from the evening hour) or "Planned for today", and one line saying whether the record is saved.
- Text size is a zoom on `#root` (`--text-scale`), with the root height divided by the same factor.
- Cloud merge was not built: see the finding under Phase 7 in `docs/ROADMAP.md` before attempting it.
- Two source files with names differing only in case break the build on Windows (`whatsNew.ts` and `ChangesSheet.tsx` are named apart for this reason).
