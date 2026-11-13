# IKIKATA roadmap: step-by-step build instructions

Written on 2026-11-13 for whoever builds the next phases, including a model that has never seen
this project. Follow it in order. Each step says what to change, where, and how to prove it works.

If a step names a file, function or line that does not match what you find, stop and read the file:
the code is the truth, and this document was written from memory of it. Never guess.

## 0. Read this first

### 0.1 Rules that must never be broken

Read `CLAUDE.md` in full before any work. The rules most often at risk in this roadmap:

1. **A lived day is never rescored.** A new scoring rule applies from the day it ships, never to
   earlier days. Pattern to copy: `EMPTY_SESSION_RULE_FROM` in `src/engine/completion.ts`.
2. **Row changes run once, in the ledger.** Add a new step at the end of `MIGRATIONS` in
   `src/data/migrations/index.ts`. Never edit a shipped step. The last shipped step is
   `018-secondary-muscles`; the next id is `019-...`.
3. **No IndexedDB cursors** (the user's iPhone fails on them). Never use Dexie `each`, `modify`,
   `reverse`, `limit`, `offset`, `uniqueKeys`, `keys`, `anyOf`, or collection `filter`/`and`. Read
   with `toArray()`, `get`, `first()`, `count()`, `primaryKeys()` and narrow in plain code.
4. **Dexie schema is append-only.** New tables go in a new `database.version(5).stores({...})`
   block in `src/data/db.ts` listing only the new tables. No `upgrade()` callback.
5. **Dates are local `YYYY-MM-DD` strings.** Use helpers in `src/engine/dates.ts`. Never
   `toISOString()`.
6. **Weights are stored in kg.** Display through `weightIn` / `weightFrom` in
   `src/engine/training.ts` with `settings.weight_unit`.
7. **Nothing derived is stored.** Counts, scores and reports are computed in `src/engine`.
8. **The user's data is private.** `Exported Data/` is git-ignored. Never commit it or print its
   contents; print counts only.
9. **Never touch** the folder `Claude Projects\Habit Tracker (V2)`.
10. **Copy reports, it never praises or scolds.** No exclamation marks, no celebration effects.
11. **English only** in the UI. No bottom navigation bar. Every tappable thing is at least 44 px.

### 0.2 Decisions the user has made (do not re-open)

- No PIN lock.
- Gym target stays 7 per week.
- "Wake up at 4:00 AM" stays a tick. Do not add wake-time logging.
- Dark theme only (Phase 1 removes the light theme).
- The Journal stays. "Plan tomorrow" (Phase 2) is added beside it and does not replace it.
- Commit messages carry no attribution lines.

### 0.3 The ship routine (run for every step that changes code)

Run from the project folder in Git Bash. Git needs `export PATH="/c/Program Files/Git/cmd:$PATH"`.

1. `npx tsc -b` must print nothing.
2. `npx vitest run` must show all tests passing. Add tests for every new engine function.
3. `npm run build` must finish with no `error TS`.
4. Start the dev server if it is not running: `npx vite --port 5199 --strictPort` (background).
5. `node scripts/acceptance.mjs --no-cursors` must end with "all 26 checks passed". Run it again
   with `--browser webkit` (if WebKit fails to launch, say so in your report).
6. If `src/data/migrations/` changed: add the new id to the `LEDGER` list in
   `scripts/rehearse-migration.mjs`, raise the expected count in `src/data/importExport.test.ts`
   (currently `toBe(18)`), then run
   `node scripts/rehearse-migration.mjs --export "Exported Data/habit-tracker-export-2026-10-06.json" --chain 02634a2 --no-cursors`
   and require "REHEARSAL PASSED".
7. Look at the changed screen: `node scripts/shot.mjs --route /train --out test-results/x.png`
   (add `--full` for the whole page), then open the picture and check it.
8. Commit on branch `personal-os`. Then
   `git checkout main && git merge --ff-only personal-os && git push origin main && git checkout personal-os`.
9. Confirm the deploy: the `assets/index-*.js` name in `dist/index.html` must equal the one served
   by `https://habit-tracker-app-ten-gules.vercel.app/` (poll for up to four minutes).
10. Tell the user what changed, what you checked, and what you did not check. Nothing has ever been
    verified on the user's real iPhone; say so and ask for a screenshot.

Never roll the live app back to an older build. Fix forward.

### 0.4 Where things are

| What | Where |
|---|---|
| Design tokens (all colours, fonts) | `src/index.css` |
| Page frame, header, backgrounds | `src/ui/Page.tsx`, `src/components/Scene.tsx` |
| Shared parts | `src/ui/` (`Button`, `Card`, `Tabs` with `Segmented`, `Field`, `Overlay`, `Toast`, `Tick`) |
| App state | `useCore()` in `src/state/core.tsx`: `today`, `settings`, `weekStart`, `habits`, `index`, `write` |
| Settings | `src/data/settingsRepo.ts` (`DEFAULT_SETTINGS`, `readSettings`, `saveSettings`), type in `src/data/types.ts` |
| Scoring | `src/engine/score.ts` (`dueItems`, `dayScore`, `weekTally`), `completion.ts`, `attention.ts` |
| Training maths | `src/engine/training.ts`, `src/engine/history.ts` (`muscleWeek`, `personalBests`) |
| Weekly report | `src/engine/weekReport.ts`, `src/features/review/WeekReportCard.tsx` |
| Home, Today | `src/features/today/HomeScreen.tsx`, `TodayScreen.tsx`, `sections.ts`; rows in `src/components/HabitRow.tsx`, `MealRow.tsx` |
| Train | `src/features/train/` (`TrainScreen`, `SessionScreen`, `SetRow`, `BodyCard`, `HistoryScreen`, `SetupScreen`) |
| Learn | `src/features/learn/` (`PillarsScreen`, `TopicScreen`, `ResourceScreen`, `UpNext`, `timer.ts`) |
| Review, Progress | `src/features/review/ReviewScreen.tsx`, `src/features/progress/` |
| Cloud copy | `src/sync/` (`engine.ts`, `sync.ts`, `state.ts`), card in `src/features/data/CloudCard.tsx` |
| Export and import | `src/data/importExport.ts` |
| Routes and menu | `src/features/*/routes.tsx`, `src/app/routes.ts`, `src/app/nav.ts` |

### 0.5 Traps on this computer

- A safety hook rejects the first shell command and the first write to each file in a session.
  State the request and what the command does, then send the same thing again.
- Long shell heredocs containing quotes fail. Write files with the Write tool instead.
- `npm run lint` is broken here. Rely on `npx tsc -b`.
- To test with data, seed rows through `window.__db` in a throwaway Playwright page (see any
  script in `test-results/`). Never test against the user's real export in the browser.

### 0.6 Adding storage: the checklist

When a step adds a table:
1. Add the type to `src/data/types.ts` and the table to the `AppDb` type in `src/data/db.ts`.
2. Add it to a single `database.version(5).stores({...})` block (create the block the first time;
   later tables in this roadmap join the same block only if version 5 has not shipped yet,
   otherwise use version 6).
3. If rows carry a date, add the table to `DATE_FIELDS` in `src/data/importExport.ts`.
4. Add a label in `src/features/data/transfer.ts` (`tableLabel`).
5. Check an old export still imports: `npx vitest run src/data/importExport.test.ts`.

When a step only adds an optional field to an existing row type, no Dexie version is needed. Code
must treat the field as possibly missing.

---

## Phase 0: Safer shipping

**0-A. Ask the user for three things** (no code):
1. Five iPhone screenshots: Home, Today, Train, a workout in progress, Review.
2. Confirmation that Settings -> Data shows "Saved to the cloud" on the icon holding their history.
3. A fresh export file (Settings -> Data -> Download export). Save it in `Exported Data/`.

**0-B. Show changes before they go live.** For any step that changes how a screen looks:
take before and after screenshots with `scripts/shot.mjs`, show them to the user, and wait for a
yes before step 8 of the ship routine. Do not rely on Vercel preview links: a preview has its own
empty storage on the phone, and signing in to the cloud copy from a preview could upload data from
a newer build than the live app understands.

---

## Phase 1: Daily screens

Ship each lettered step separately.

**1-A. Dark only.**
1. `src/index.css`: delete the two light blocks (`@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) {...} }` and `:root[data-theme='light'] {...}`). Keep `:root { color-scheme: dark }`.
2. `src/state/theme.ts`: make `useAppliedTheme` always set `data-theme="dark"` and return `'dark'`.
3. `index.html`: in the small boot script near the top, always set `data-theme` to `dark`.
4. `src/features/settings/SettingsScreen.tsx`: remove the Theme row and the unused `THEMES` list.
5. Keep `theme` in the `Settings` type (old exports contain it). Do not write a migration.
6. Check: `shot.mjs --route / --theme light` must look identical to the dark picture.

**1-B. Train: start first.** In `src/features/train/TrainScreen.tsx`:
1. Order inside the page: (a) in-progress card if any, (b) today's routine as a card with the one
   primary "Start routine" button, (c) "Start empty workout" as a secondary button, (d) the body
   map, (e) the other routines, (f) weekly target, (g) "Log a session without sets".
2. Other routines become plain rows in one card (`divide-y divide-line`): name, exercise list on
   one truncated line, an edit pencil, and a small secondary "Start" button. Only one primary
   (pink) button may exist on the screen.
3. If no routine is scheduled today, (b) is omitted and "Start empty workout" stays secondary.
4. Update `scripts/acceptance.mjs` if the button it clicks (`'Start routine'`, exact) changed.
5. Check: at 390 x 844 the primary Start button is visible without scrolling.

**1-C. Body map: compact.** In `src/features/train/BodyCard.tsx`: limit each figure to about
96 px wide, put the two figures on the left and the set counts list on the right in one row, and
show at most six muscles with a "Show all" toggle. Tapping a muscle still opens its detail.

**1-D. Today: show what is left.**
1. `src/features/today/TodayScreen.tsx`: above the list add one line: "N left" (count of due
   items not done) or "All done for today".
2. `src/components/HabitRow.tsx`: a done row gets `opacity-60` on its name. Do not move rows: the
   order is the user's order of the day.
3. `src/components/MealRow.tsx`: collapse to one row showing the meal name and, if text exists,
   the text truncated. Tapping the row expands the text box and the "Ate out" button. A meal with
   no text yet starts collapsed too.
4. Fix two known faults here: the "Ate out" button must show a check icon when on (not colour
   alone), and the meal text box border must use `--color-line-strong`.
5. Check: acceptance scenario for meals still passes; update its selectors if needed.

**1-E. Workout screen.** In `src/features/train/SessionScreen.tsx`:
1. Under the stats strip add "X of Y exercises done" (a block is done when all its sets are done).
2. A done block collapses to its header line; tapping the header expands it again. Keep state in
   a `Set<number>` of manually re-opened positions.
3. Remove the kg/lb switch from this screen. It already exists in Settings -> Training.

**1-F. Pink only where it matters.**
1. Search `src` for `text-accent-ink`. Links and section actions (for example "New routine",
   "History") change to `text-cream underline-offset-2`. Keep `text-accent-ink` for: the selected
   item, the focus ring, the exercise name in a workout, PR labels, running timers.
2. Each screen may have one `variant="primary"` button. Find extras with a search for
   `variant="primary"` per screen file and change the lesser ones to `secondary`.
3. Check every main route in screenshots: `/`, `/today`, `/train`, `/learn`, `/review`,
   `/progress`, `/journal`, `/habits`, `/settings`, `/data`.

**1-G. Opening screen once a day.** In `src/app/Splash.tsx`, `Opening` component: read
`localStorage` key `ikikata-opened-on`; if it equals today's local date, render nothing; otherwise
show as now and store today's date. Wrap storage access in try/catch. Get the date with
`toLocalDateStr(new Date())` from `src/engine/dates.ts`.

**1-H. Undo after a tick.** In `src/components/HabitRow.tsx`, after a manual tick or untick
succeeds, show a toast with an Undo action that reverses it. Read `src/ui/Toast.tsx` first; if
`toast.show` has no action option, add `{ action?: { label: string; run: () => void } }` and render
a 44 px button in the toast. No animation beyond what toasts already have.

**1-I. Polish.**
1. `src/ui/Page.tsx`: let the title wrap to two lines (`line-clamp-2` in place of `truncate`).
2. Measure contrast of `--color-ink-3` on `--color-surface` and `--color-ground`, and of
   `--color-on-accent` on `--color-accent`. Body text needs 4.5:1. If `ink-3` fails, lighten it in
   `src/index.css` until it passes. Report the measured numbers.
3. `src/ui/Field.tsx` and `MealRow.tsx`: fields use `outline-none` with a box-shadow focus mark.
   Add a real `:focus-visible` outline so focus never disappears.

---

## Phase 2: Honest scores

**2-A. Days off (rest, travel, sick).**
1. Storage: table `day_marks: 'date'` with rows `{ date: DateStr, kind: 'rest' | 'travel' | 'sick', note: string }` (follow 0.6).
2. Repo: new `src/data/dayMarkRepo.ts` with `setDayMark(date, kind | null, ctx)`. It must call
   `assertEditable(date, ctx.today, ctx.windowDays)` from `src/engine/lock.ts`, as habit writes do.
3. Engine: `src/state/core.tsx` loads marks with `toArray()` and puts a `Set<DateStr>` named
   `daysOff` on the index or beside it. In `src/engine/score.ts`, a day in `daysOff` has no due
   items: `dueItems` returns `[]` for it. Flexible weekly targets are unchanged.
4. History rule: a mark can only be set inside the editing window, so locked days cannot change.
   Weeks already frozen in `weekly_reviews` must not be recomputed; read how `freezeDueWeeks`
   works in `src/features/review/` before touching scores and keep frozen weeks as stored.
5. UI: on `/today`, a small "Day off" button under the date opens a sheet with the three kinds
   and "Not a day off". A day off shows "Day off: travel" instead of the score, and rows stay
   tickable but uncounted.
6. Tests: a day off has zero due; the week tally skips it; setting a mark outside the window throws.

**2-B. Reason for a miss.**
1. Storage: optional field `reason?: 'late_night' | 'travel' | 'sick' | 'forgot' | 'no_time'` on
   `Entry` in `src/data/types.ts`. No Dexie version.
2. Repo: `setMissReason(habitId, date, reason | null, ctx)` in `src/data/habitRepo.ts`, inside a
   transaction; it creates the entry row with `done: false` if none exists. Check the editing lock.
3. UI: in `src/components/EntrySheet.tsx` (opened from a habit row), for a past day that is due and
   not done, show the five choices as chips. Never ask automatically.
4. Review: `WeekReportCard` gains one line: "Misses with a reason: late night 4, travel 2".

**2-C. Plan tomorrow.**
1. Storage: table `day_plans: 'date'` with `{ date: DateStr, items: string[] }` (max three items,
   each max 80 characters). The key is the day the plan is for.
2. UI: `src/features/today/HomeScreen.tsx`. From `settings.evening_hour` onward show a card
   "Tomorrow" with three one-line inputs, saved on blur. Before the evening hour, if a plan exists
   for today, show a card "Planned for today" listing the items as plain text.
3. Use `useKeyedLiveQuery` (see `src/state/live.ts`) keyed on the date for the inputs, to avoid the
   stale-key bug described in `CLAUDE.md`.
4. The Journal is untouched. Add a text link "Write the journal" under the card.

**2-D. Weigh-in prompt.** In `src/features/review/ReviewScreen.tsx`, when the viewed week is the
current week and no `weight_entries` row has a date in it, show a row "No weight logged this
week" with a link to `/progress/weight`.

---

## Phase 3: Insights

**3-A. Patterns between habits.**
1. Engine: new `src/engine/patterns.ts` with
   `pairRate(habitA, habitB, days, index): { whenA: {done, of}, whenNotA: {done, of} }`, counting,
   over days where both were due, how often B was done on the day *after* A was done versus not
   (parameter `lag: 0 | 1`). Use `dueItems` per day; skip days off.
2. Show only pairs that are fixed in code, matched by habit name prefix:
   Sleep before 10 -> Wake up (lag 1); Wake up -> Meditation (lag 0); Gym -> Learning (lag 0);
   Sleep before 10 -> Gym (lag 1).
3. Minimum data: show a pair only when both groups have at least 7 days. Otherwise omit it.
4. UI: a card "Patterns" on `/progress` with lines like
   "Woke at 4 AM on 9 of 20 days after sleeping before 10, and 3 of 30 days otherwise."
   State counts only. Never write "because" or "causes".
5. Tests: lag handling, the 7-day minimum, days off skipped.

**3-B. Monthly review.** New route `/review/month/:month` (`YYYY-MM`) in
`src/features/review/routes.tsx`. Content, all computed: completion rate per habit for the month
(reuse the monthly helpers in `src/engine/history.ts`), five highest and five lowest habits, gym
days, work sets, weight at start and end, minutes learned, meals eaten out. Link to it from
`/review` ("This month").

**3-C. Copy summary.** In `WeekReportCard`, a secondary button "Copy summary". It builds plain
text from the existing `weekReport` result plus the per-habit week rates, and calls
`navigator.clipboard.writeText`. On failure show the text in a read-only textarea to copy by hand.
The text must contain numbers and habit names only, as on screen.

**3-D. Not trained in 14 days.** In `src/engine/attention.ts`, add items for muscle groups whose
last hard set (`muscleWeek(sets, byId, '0000-01-01', today)` gives `last`) is 14 or more days ago,
only for muscles trained at least once. `AttentionInput` gains `sets` and `exercisesById`; pass
them from `HomeScreen`. One combined item: "Not trained in 14 days: hamstrings, calves", linking
to `/train`. Level: the lowest attention level.

**3-E. Up next on Home.** In `HomeScreen.tsx`, when the Learning habit is due and not done, show
the existing `UpNext` component (`src/features/learn/UpNext.tsx`) under the score cards.

---

## Phase 4: Gym

**4-A. Cardio record.** Engine `cardioWeeks(sets, exercisesById, today, weekStart, weeks)` in
`src/engine/history.ts`: per week, total minutes (`seconds / 60`) and kilometres
(`distance_m / 1000`) of done sets on exercises whose `kind` is `distance_time`, plus quick
cardio sessions (`session.quick` with `kinds` including `cardio`, using the session's minutes and
`distance_km`). UI: a "Cardio" card on `/train/history` with this week's totals and a 12-week
`BarChart` (`src/ui/Charts.tsx`).

**4-B. Session names.** In `finishSession` (`src/data/workoutRepo.ts`), if the session was a free
session or its done sets cover muscles the title does not suggest, do **not** rename silently.
Instead add a text field "Name" to the Finish sheet in `SessionScreen.tsx`, pre-filled with the
current title, with a suggestion chip built from the two muscles with the most sets
("Shoulders + Glutes"). Save the chosen title in the same transaction.

**4-C. In-workout tools.** One at a time, each shipped separately:
1. Note per exercise: a one-line input under the exercise name, stored on the block's first set
   row `note` field. Shown read-only in history.
2. Reorder: up/down is not allowed in this app; use the existing drag handle component
   (`Reorderable` in `src/components/SortableList.tsx`) on block headers. Reordering rewrites
   `position` on the session's `set_logs` inside one transaction.
3. Swap exercise: a "Swap" action on a block opens `ExercisePicker`; it changes `exercise_id` on
   that block's not-yet-done sets only. Done sets keep what was performed.
4. Plate calculator: a small sheet from the weight cell of a barbell exercise showing plates per
   side for the entered weight and `bar_weight_kg`. Display only.
Skip supersets unless the user asks again.

**4-D. Training calendar.** On `/train/history`, a month grid (reuse `src/ui/CalendarMonth.tsx`):
a day with a finished, non-empty session is marked and labelled with the session title's first
word. Tapping a day opens that session.

**4-E. Body measurements.** Table `measurements: '++id, date'` with
`{ date, waist_cm?, chest_cm?, arm_cm?, note }`. Screen `/progress/measurements` copied in
structure from `src/features/progress/WeightScreen.tsx`, with one line chart per measure. Values
in centimetres only.

**4-F. Fix old dumbbell entries.** On `/train/exercise/:id` for exercises with
`equipment === 'dumbbell'`, a tool "Double the weights logged before a date". The user picks the
date; a confirmation states how many sets will change. It doubles `weight_kg` on that exercise's
sets before the date in one transaction, after `takeSnapshot` (`src/data/backup.ts`). This is the
only place a past set is edited, and only because the user asks for it per exercise. Never run it
automatically.

---

## Phase 5: Diet

**5-A. Favourite meals.** In `MealRow.tsx`, when the box is empty and expanded, show up to four
chips: the most frequent past texts for that meal slot (computed from `db.meals.toArray()`,
case-insensitive, at least two uses). Tapping a chip fills and saves the text.

**5-B. Protein mark.** Optional field `protein?: boolean` on `Meal`. A second toggle "Protein"
beside "Ate out", with a check icon when on. `weekReport` gains a row "Meals with protein:
N of M logged".

**5-C. Eating-out limit.** Setting `eat_out_weekly_cap: number | null` (default null) in
`settingsRepo.ts` and the `Settings` type, edited in Settings -> General with a `Stepper`. When
set, `WeekReportCard` shows "Eaten out: 2 of 3". No warning colours until the cap is exceeded;
then the row uses the warn tone with the words "over the limit".

**5-D. Water by the glass.** Read `HabitRow.tsx` (the `measured` branch) and `EntrySheet.tsx`
first: the app already supports habits with a measured value. Add a migration step that sets the
water habit's `measure` to a count with a target of 10 and unit "glasses" (match the habit by name
containing "water", active only). Confirm in code whether a measured habit completes at the target
or by tick; do not change how completion works, only the measure.

**5-E. Weight trend.** In `WeightScreen.tsx`, add a 7-entry moving average line to the chart and
an optional goal weight (setting `goal_weight_kg: number | null`) drawn as a flat line.

---

## Phase 6: Learning

**6-A. Finish estimate.** In `src/engine/learning.ts`, `finishEstimate(resource, sessions, today)`:
needs `progress_total`, current progress above zero, and at least two sessions; pace = progress
gained divided by days since the first session; returns a date or null. Shown on
`ResourceScreen.tsx` as "At this pace: finished around 14 March". Hide when null.

**6-B. Finished shelf.** Optional field `verdict?: string` (max 140 characters) on
`LearningResource`, asked in the session sheet when "This finishes it" is on. `TopicScreen.tsx`
"Finished" group shows the completion date and the verdict.

---

## Phase 7: Trust and polish

**7-A. What changed note.** `src/app/whatsNew.ts` exports `CHANGES: { version: number; date: string; lines: string[] }[]`. On start, compare the highest version with `localStorage` key
`ikikata-seen-version`; if newer, show a dismissible sheet listing the lines, then store it.
Add an entry whenever a visible change ships. First run with no stored value: store silently.

**7-B. Saved mark on Home.** In `HomeScreen.tsx`, use `useSyncStatus()` from
`src/sync/engine.ts` (call `startSync()` first, as `CloudCard` does). Show one quiet line under
the greeting: "Saved" / "Saving" / "Not saved: no connection" / "Sign in to save". Words, not
only an icon. It replaces the current sign-in row.

**7-C. Backup reminder.** Store the date of the last download in `localStorage` when the export
button in `src/features/data/DataScreen.tsx` succeeds. If it is more than 30 days old (or absent
and the app has over 30 days of entries), add an attention item on Home: "No export downloaded
in 30 days", linking to `/data`.

**7-D. Text size.** Setting `text_scale: 1 | 1.1 | 1.2` (default 1). Apply as
`document.documentElement.style.fontSize` is not enough because sizes are in px; instead set a CSS
variable `--text-scale` and apply `zoom: var(--text-scale)` on `#root`. Check every main route
at 1.2 for overflow at 390 px before shipping.

**7-E. Clean-up.** Delete unused screens and their routes after confirming nothing links to them
(search for each path): `/search`, `/nutrition`, `/learn/today`, `/learn/queue`,
`/learn/library`, `/learn/reading`. Remove the "Priority" line from `ResourceScreen.tsx`. Keep
the data fields.

**7-F. Cloud merge (hardest; do last, alone, with the most testing).**
Today `syncOnce` in `src/sync/sync.ts` replaces the whole record and asks the user to choose when
both sides changed. Goal: merge instead of asking, when safe.
1. Read `applyImport` mode `'merge'`, `planMerge` and `mergeBlockers` in
   `src/data/importExport.ts`. Merge already adds rows that do not exist and refuses on id clashes.
2. In `decide`, where the result is `'choose'` and neither side is empty: pull the cloud copy
   into a staging database (as `prepareImport` does), run `mergeBlockers`; if there are none,
   apply the merge locally, then push the merged record as a new revision. If there are blockers,
   keep today's "choose" screen.
3. Merge only adds; it never resolves two different edits of the same row. Say so in the UI:
   "Combined: N items added from the cloud copy."
4. Always `takeSnapshot` before merging.
5. Tests in `src/sync/sync.test.ts`: two devices tick different habits apart -> both ticks
   survive on both; same row edited on both -> falls back to choose; an empty copy never
   overwrites history (existing tests must still pass).
6. Verify end to end with a throwaway email account as `test-results/cloud-e2e.mjs` does, and
   delete that account afterwards.

**7-G. Art.** Only when the user supplies full-size originals (see sizes given to the user:
1290 x 2796 full screen, 2048 x 1536 Home, 1600 x 2000 Journal, 2520 x 1080 bands, transparent
PNGs for blossoms). Convert to WebP at up to 1800 px wide into `src/assets/`, keep the names
used by `src/components/Scene.tsx`.

---

## Order and dependencies

1. Phase 0, then Phase 1 in letter order.
2. Phase 2-A before 3-A (patterns skip days off).
3. Phase 3-D needs nothing else. Phase 5-B before using protein in any report.
4. Phase 7-F last.

After each phase: update the "Decisions" list in `CLAUDE.md` with what changed, in one or two
lines, and tick the phase off below.

## Progress

Built and shipped to main on 2026-11-13, in one session, a phase per release.

- [ ] Phase 0: still owed by the user (iPhone screenshots, confirmation that the cloud copy holds the history, a fresh export). Screens were checked in Edge and WebKit only.
- [x] Phase 1 (A B C D E F G H I). 1-F was done for links and section actions and for Train and the workout screen; the other screens' primary buttons were not audited one by one. 1-I: contrast measured, nothing needed changing (ink-3 5.69:1 on surface, 6.05:1 on ground, 4.5:1 on surface-3; on-accent 8.66:1).
- [x] Phase 2 (A B C D). Storage: Dexie version 5 adds day_marks, day_plans and measurements. The weigh-in prompt is inside the Gym and diet card.
- [x] Phase 3 (A B C D E).
- [x] Phase 4 (A B C D E F). Reorder is a sheet ("Change the order") with the drag handles, not a drag on the workout cards. Swap moves the not-yet-done sets into a block of their own when some sets of the exercise are already done.
- [x] Phase 5 (A B C D E). Ledger step 019-water-by-the-glass.
- [x] Phase 6 (A B).
- [ ] Phase 7: A B C D done. The backup reminder (C) is shown only on a device that has never signed in to the cloud copy.
  - E not done, on purpose: /nutrition is linked from the Body pillar, /learn/today is used by acceptance scenario C, /learn/library is linked from Progress and /learn/reading from the habit-source routes. Only the Priority line was removed. Removing these needs the links and the acceptance scenario moved first.
  - F not done. Finding: the existing import merge cannot combine two devices. Rows in auto-numbered tables (ticks, sessions, sets) made on two devices take the same ids, and mergeBlockers rightly refuses them. A real combine needs clashing rows re-keyed (and set_logs.session_id remapped), a rule for deletions (a merge that only adds brings back anything deleted on one side), and a two-device test against a throwaway account. Until then the choose screen stays.
  - G not done: no full-size originals were supplied.
