# Personal OS — architecture

The product definition is [`product-spec.md`](./product-spec.md) (124 sections, verbatim from the
user). The reference designs are in [`design/`](./design/). This file is how that product is
built: the rules, the layout of the code, and the contracts between its parts. Read it before
changing anything; when the code and this file disagree, fix whichever is wrong in the same change.

## 1. What cannot be traded away

1. **History is truth.** A day that has been lived is never rescored by a later change. Habits
   are retired, never deleted. A rename, re-categorisation or new frequency starts today.
2. **Not due is not missed; pending is not missed.** A target that can still be met is never
   called missed. Today's unfinished items are pending.
3. **One source of truth.** Nothing derived is stored. "Gym done today" is the existence of a
   finished workout session; a weekly count is a count of rows. If a number appears on two
   screens it comes from the same engine function.
4. **Local-first.** IndexedDB only. No server, account, analytics, external API, notification.
   The app must open and work with no network.
5. **Quiet and factual.** No gamification, confetti, badges, cheerleading or guilt. The app
   states what happened: "1 session still required", "Target missed". Never "You can do it!".
6. **It is not a work tool.** No tasks, projects, CRM. Learning about any subject is in scope;
   operational work is not.
7. **The user's data survives everything.** Every migration is preceded by a backup copy and is
   atomic. Import validates and never silently overwrites.

## 2. Stack (do not substitute)

React 19 · TypeScript (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`) · Vite 8 +
`vite-plugin-pwa` · Tailwind v4 (tokens in `src/index.css`) · Dexie 4 / `dexie-react-hooks` ·
Chart.js 4 via `react-chartjs-2` (the only charting library) · `lucide-react` icons through
`src/ui/icons.tsx` · `@dnd-kit` for drag-reorder · Vitest + `fake-indexeddb` · Playwright (Edge).
No router library, no state library, no form library, no date library, no CSS-in-JS.

## 3. Layout and ownership

```
src/
  main.tsx              start-up: open DB → guard → migrations → render (or SafeMode)
  index.css             design tokens and base styles — the only place colours are defined
  app/                  App, Shell (sidebar / bottom bar / menu sheet), router, nav, routes, SafeMode
  state/                CoreProvider (the live core), clock, theme, live-query helpers
  data/                 types.ts (every record), db.ts (Dexie schema), repositories, migrations, seeds
  engine/               pure functions: dates, timeline, completion, targets, score, status, streaks…
  ui/                   the component kit — generic, knows nothing about habits or workouts
  components/           shared domain components (HabitRow, QuoteCard, …)
  features/<area>/      one folder per area: routes.tsx + screens + area-only components + hooks
  testing/              test builders, fixtures, the legacy boot used to rehearse the migration
```

Dependency direction: `features → components → ui`, and everything may read `state`, `data`,
`engine`. `engine` imports only `data/types` and other engine files. `ui` imports nothing from
`features`, `components`, `data` repositories or `engine` (types and `engine/dates` are fine).
A feature never imports another feature's screens; the three cross-feature hooks in §9 are the
only doors between features.

## 4. Data

`src/data/types.ts` defines every record; `src/data/db.ts` defines the tables. Read both.

**Tables.** `habits` `entries` `day_routines` · `exercises` `routines` (workout routines)
`routine_items` `sessions` `set_logs` · `meals` · `weight_entries` · `learning_pillars`
`learning_resources` `learning_sessions` · `journal_entries` · `quotes` `quote_days` ·
`weekly_reviews` · `settings` `migrations`. Legacy, read-only: `weekly_records`, `daily_notes`,
`supplements`, `supplement_logs`.

**A habit row is everything recurring**: a practice, a supplement (`kind: 'supplement'`, with
`dose`) or a meal (`kind: 'meal'`, with `meal_slot`). One table means one engine scores them all.
Its schedule lives in `versions` — dated chapters. The engine reads only `versions`; the
top-level `name`, `short_name`, `retired_on` are copies of the newest chapter for convenience.

**Rules for anything that writes:**

- Screens never touch tables. They call a repository function in `src/data/*Repo.ts`.
- **Dates are local `YYYY-MM-DD` strings.** Never `toISOString()`, never a date derived from a
  timestamp. The user is in IST; UTC shifts everything before 05:30 into the previous day. Get
  "today" from `useCore().today`, never from `new Date()` in a screen. `*_at` fields are epoch ms
  for ordering and durations only. Times of day are local `'HH:MM'` strings.
- **The date being written is passed in from the screen that was showing it**, never read from
  the clock inside the repository — a save that lands after midnight must not move days.
- **Every read-then-write is inside `db.transaction('rw', …)`.** Check-then-act outside a
  transaction has silently dropped writes in this app twice. Prefer deterministic primary keys
  (`[date+slot]`, `week_start`, `date`) so a write is one `put`.
- **Never catch an error thrown inside a nested transaction and carry on.** Dexie aborts the
  outer transaction when an inner one fails, even if the error is caught, and everything written
  so far is lost (`PrematureCommitError`). Check the condition first and skip the call instead.
- **The history lock**: every write that carries a date calls
  `assertEditable(date, ctx.today, ctx.windowDays)` (`engine/lock.ts`) with the `WriteContext`
  from `useCore().write`. Outside the window it throws `LockedError`; the screen shows that the
  day is locked rather than offering the control at all.
- **Retire, never delete**: `retired_on` / `active: false` / `archived_on`. Deleting is allowed
  only for something created today that no finished day depends on, and for a workout session or
  learning session inside the edit window (they are events, not denominators).
- **Never index a boolean** and never rely on a `retired_on` index to find active rows (it only
  holds non-null rows) — filter in code.
- Schema changes: append a new `database.version(n)` listing only new tables; never edit a
  shipped one; no `upgrade()` callbacks. Row changes go in a new ledgered step in
  `data/migrations/index.ts`; shipped steps are never edited.
- Validate at the boundary: trim text, reject empty names, clamp numbers. Throw an `Error` with
  a sentence the user can read; the screen shows it in a toast.

**Export, import and copies** (`data/importExport.ts`, `data/backup.ts`):

- An export is every table at the top level of one JSON object. Import is two steps: `prepareImport`
  reads and checks a file without touching the device (an old-format file is upgraded by running
  the real migrations in a throwaway database), `applyImport` then adds or replaces.
- **Adding** writes only rows whose id (or habit and day, for a tick) is not here yet, and refuses a
  file whose ids mean something else on this device (`merge_blockers`): on a new phone, habit 2 in
  an old export is a different habit. **Replacing** copies the whole database into the backup
  store first, then clears and loads in one transaction.
- Automatic copies keep the four most recent, plus, permanently, the one taken before the move
  off the original app (`before-001-cutover`).
- The cutover recognises a habit the earlier app retired on its own by the DAY it happened (its
  patch day, or the day its supplements list was first seeded), never by which build ran.

## 5. Engine (pure functions — `src/engine`)

| File | What it answers |
|---|---|
| `dates.ts` | calendar arithmetic and formatting on date strings; `weekStartOf(date, weekStart)`; `logicalDate(now, dayStartHour)` |
| `timeline.ts` | `versionOn(habit, date)`, `isDueOn`, `isFlexibleOn`, `isActiveOn`, `nameOn`, `currentVersion`, `isRetired`, `appendVersion`, `habitProblems` |
| `completion.ts` | `CompletionIndex`, `isComplete(habit, date, index)`, `completedBy` (which source), `valueOn`, `isManuallyTickable` |
| `periods.ts` | `periodOf('week'|'month', date, weekStart)`, `shiftPeriod`, `periodLength` |
| `targets.ts` | `targetProgress(habit, period, today, index)` → `{done, target, remaining, days_left, state, partial, flexible, area}`; `targetsFor`; phrases |
| `score.ts` | `dayScore`, `dueItems`, `flexibleItems`, `weekTally`, `percent` |
| `status.ts` | `dayStatus(habit, date, today, index)` → done / pending / missed / not_due / inactive / upcoming; `statusLabel` (held / broken for abstain habits) |
| `streaks.ts` | `streakOf`, `consistency`, `weekdayRates`, `isPeriodJudged` |
| `lock.ts` | `isEditable`, `firstEditableDate`, `assertEditable`, `LockedError` |
| `training.ts` | `e1rm`, `volumeLoad`, `bestSet`, `setsByMuscle`, `formatSetLine`, `sessionKindsFrom`, `sessionMinutes`, `formatDuration` |

Definitions that must not drift:

- **Day score** = due items done ÷ items due that day. Flexible habits are never in it.
- **Week score** = (due items done on each day up to today + each flexible weekly target's
  `min(done, target)`) ÷ (items due on those days + those targets). Partly-tracked targets are
  listed but not scored.
- **Target state**: `met` · `on_track` · `attention` (one spare day left) · `at_risk` (every
  remaining day needed) · `unreachable` · `missed` (only after the period ends) · `partial`
  (tracked for part of the period: reported, not judged) · `upcoming`.
- **A percentage is `null`, not 0, when nothing was due.** Show "—" or "No data", never 0%.
- **No fake precision**: a rate over fewer than 7 due days, a trend over fewer than 14 days, a
  comparison where either side has no data — show "Need more history" instead of a number.

New engine code is pure, takes `today` as an argument, and comes with tests.

## 6. State, routing, screens

```ts
import { useCore } from '../../state/core'
const { today, hour, settings, weekStart, areas, habits, index, write, theme } = useCore()
```

`useCore()` is the live core: every habit (retired included), the completion index built from
ticks + finished workouts + learning sessions + journal days, the settings, and the current
logical day. It updates on any write. Compute what a screen shows from it with engine functions
during render (memoise only what is measurably slow).

For rows the core does not hold (sets, meals, resources, journal text…), use
`useLiveQuery` from `dexie-react-hooks`, or `useKeyedLiveQuery(key, querier)` from
`state/live.ts` whenever the query depends on something the user navigates (a date, a week, an
id). **Never feed a live query that depends on a changing key into an uncontrolled input's
`defaultValue`** — use `useKeyedLiveQuery`, render nothing until `loaded`, and key the input on
the stable key. Text editors autosave (debounced ~600 ms, and on blur / tab hidden), because the
service worker may reload the page when a new version arrives.

**Routing** (`src/app/router.tsx`): hash routes. Each feature exports its routes:

```tsx
// src/features/learn/routes.tsx
import { lazy } from 'react'
import type { RouteDef } from '../../app/router'
export const routes: RouteDef[] = [
  { path: '/learn', nav: 'learn', component: lazy(() => import('./LearnToday')) },
  { path: '/learn/resource/:id', nav: 'learn', component: lazy(() => import('./ResourceDetail')) },
]
// a screen: export default function ResourceDetail({ params }: RouteProps) { … }
```

`<Link to="/learn/queue">`, `navigate('/learn')`, `goBack('/learn')`, `useLocation()`,
`useQueryState('tab', 'today')` (tab/filter state in the URL, replaces history).

**Every screen is wrapped in `<Page>`** (`src/ui/Page.tsx`): `title`, `subtitle`, `back` (a
fallback path — pass it on any screen reached from another screen), `actions`, `tabs`, `width`
(`narrow` reading/forms · `default` · `wide` dashboards). Page owns the header and the scroll.

**Responsive**: phone-first at 390 px, then `sm:` 640, `lg:` 1024 (sidebar appears). On `lg`
use the width: two or three columns, a secondary panel — never one stretched phone column.
No horizontal scrolling of the page at any width; wide tables scroll inside their own container.

## 7. UI kit (`src/ui`) — generic, reusable, accessible

Use these; do not re-implement them inside a feature. If something is missing, add it to the kit.

```ts
// Button.tsx
Button({ variant?: 'primary'|'secondary'|'ghost'|'danger', size?: 'sm'|'md'|'lg', icon?: IconName, block?, ...buttonProps })
IconButton({ icon, label /* required */, variant?, size?: 'sm'|'md', ...buttonProps })
// Card.tsx
Card({ as?: 'div'|'section'|'article'|'li', padded?: boolean, className?, ...rest })
CardHeader({ title, subtitle?, icon?, iconClassName?, action? })
SectionTitle({ children, action? })                    // the small uppercase label above a group
// icons.tsx
Icon({ name: IconName, size?, className?, label? })    // ICONS, IconName, isIconName, HABIT_ICON_CHOICES
// Tabs.tsx
interface TabOption<T extends string = string> { id: T; label: string; count?: number }
Segmented<T>({ options: readonly TabOption<T>[], value: T, onChange(id: T), label /* aria */, size?: 'sm'|'md', block?, className? })
// Tick.tsx — the checkbox
Tick({ checked, onChange?(next: boolean), label /* aria */, size?: 'md'|'lg', tone?: 'ok'|'accent', disabled?, readOnly?, className? })
// Field.tsx
Field({ label, hint?, error?, htmlFor?, children, className? })
TextInput(InputHTMLAttributes & { invalid? })          TextArea(TextareaHTMLAttributes & { autoGrow?, invalid? })
Select(SelectHTMLAttributes)                            Switch({ checked, onChange(next), label, disabled? })
Stepper({ value: number|null, onChange(next: number), step?, min?, max?, label, unit?, format?, size?: 'md'|'lg' })
WeekdayPicker({ value: number[], onChange(days: number[]), label })   // 0 = Monday
// Chip.tsx
type Tone = 'neutral'|'accent'|'ok'|'warn'|'risk'|'mind'|'body'|'learning'|'exercise'
Chip({ tone?, icon?, children, className? })
toneText(tone): string    toneBg(tone): string    toneSolid(tone): string    areaTone(color: string): Tone
// Overlay.tsx
Modal({ open, onClose, title, children, footer?, size?: 'sm'|'md'|'lg' })     // dialog ≥640px, bottom sheet on a phone
Drawer({ open, onClose, title, children, footer? })                           // right panel ≥1024px, bottom sheet below
ConfirmationDialog({ open, title, body?, confirmLabel, cancelLabel?, tone?: 'default'|'danger', onConfirm, onCancel })
// Toast.tsx
ToastProvider   useToast(): { show(message, { tone?: 'neutral'|'ok'|'risk', action?: { label, onClick }, duration? }) }
// EmptyState.tsx
EmptyState({ icon?, title, body?, action?, className? })
// Progress.tsx
ProgressRing({ value: number|null /* 0..1 */, size?, stroke?, tone?, label /* aria */, children? /* centre */ })
ProgressBar({ value, max, tone?, label /* aria */, height?, className? })
// Metric.tsx
MetricCard({ label, value, unit?, delta?: { text, direction: 'up'|'down'|'flat', good?: boolean|null }, hint?, className? })
InsightCard({ tone?, icon?, children })                 TrendMark({ direction, good?, label })
// CalendarMonth.tsx
type CellStatus = 'done'|'missed'|'pending'|'not_due'|'inactive'|'upcoming'
CalendarMonth({ month: DateStr, weekStart, today, statusOf(date): CellStatus, selected?, onSelect?(date), doneLabel?, missedLabel? })
CalendarLegend({ doneLabel?, missedLabel? })
// Charts.tsx (Chart.js; import lazily from a screen so only chart screens pay for it)
interface Series { label: string; tone: Tone; points: { x: string; y: number|null }[]; dashed?: boolean }
LineChart({ series, height?, yMin?, yMax?, yFormat?, xFormat?, label /* aria summary */ })
BarChart({ bars: { x: string; y: number|null; tone?: Tone }[], height?, yMax?, yFormat?, label })
// WeekStrip.tsx
WeekStrip({ days: { date, done, due, counted }[], today, selected?, onSelect?(date) })
```

## 8. Design language

Premium, calm, serious, slightly technical: a personal dashboard, not a wellness app. Dark is the
primary theme; light is the same design with the tokens re-pointed, and both must look intended.

- **Colour comes only from tokens** (`src/index.css`): `bg-ground` page, `bg-surface` card,
  `bg-surface-2` inset/input/hover, `bg-surface-3` pressed, `border-line`, `border-line-strong`,
  `text-ink` / `text-ink-2` / `text-ink-3`, `bg-accent` + `text-on-accent` for filled controls,
  `text-accent-ink` for accent-coloured text and links, `text-ok` / `text-warn` / `text-risk`
  for status, `text-mind` / `text-body` / `text-learning` / `text-exercise` for the pillars.
  Tints are made with an opacity modifier (`bg-ok/12`, `bg-accent/15`). No literal hex, no
  Tailwind palette colours (`text-red-500`), no gradients except where this file says so.
- **Status is never colour alone** (spec §73): pair it with a word ("Missed") or an icon/shape.
- **Type**: Geist Variable. Page title 18 px phone / 24 px desktop semibold; card title 15 px
  semibold; body 14–15 px; secondary 12.5–13 px `text-ink-2`/`-3`; the uppercase `eyebrow`
  utility for section labels. Numbers that line up or change use `tnum`. Big figures (a score,
  a weight, a timer) are 28–44 px semibold with tight tracking.
- **Shape**: cards `rounded-card` (14 px) on `bg-surface` with `shadow-card` (a hairline in
  dark); controls `rounded-control` (10 px); chips fully round. Page gutter 16 px phone, 32 px
  desktop; 12–16 px between cards; 16 px inside a card.
- **Density**: compact but never cramped. Rows are 52–60 px. **Every tappable thing is at least
  44 × 44 px**; workout controls are 52 px+. A phone screen shows the most important thing
  without scrolling.
- **Hierarchy over decoration**: one primary action per screen (`variant="primary"`); everything
  else secondary or ghost. Do not make every block a card: a list inside one card with hairline
  dividers reads better than ten cards.
- **Motion** acknowledges and never celebrates: `animate-tick-pop` on a tick, `animate-rise-in`
  for content arriving, `animate-sheet-up` for sheets. Nothing loops. All of it is disabled
  under `prefers-reduced-motion`.
- **Accessibility**: semantic elements (`button`, `a`, `nav`, `main`, headings in order, lists
  as lists), a visible label or `aria-label` on every control, visible focus (the base style
  provides the ring — do not remove outlines), dialogs trap focus and close on Escape, live
  regions for toasts and timers that announce sparingly.
- **Empty states are useful and short**: what is empty, and the one action that fixes it
  ("Nothing queued." + "Add a resource"). No tutorials, no illustrations.

**Copy.** Sentence case. Plain words. Report, do not comment: "Hair oiling: 1 of 2. 1 session
still required. 1 day left." Never an exclamation mark, never praise, never blame. For abstain
habits say held / broken, not done / missed. Numbers as `12 / 17`, `81%`, `70.8 kg`,
`60 × 10`. Dates as "Tue 6 Oct", ranges as "29 Sep – 5 Oct 2026". Use `×`, `–`, `·`, `…`, `’`.

## 9. Doors between features

Only these. Each lives in the owning feature and keeps this signature:

```ts
// features/train/hooks.ts
useTodaysWorkout(): { loaded: boolean; scheduled: WorkoutRoutine[]; open: Session | null; finished: Session[] }
// features/learn/hooks.ts
useLearningNow(): { loaded: boolean; current: LearningResource | null; next: LearningResource | null;
                    queueSize: number; activeBook: LearningResource | null; currentDaysInProgress: number | null }
// features/quotes/hooks.ts
useQuoteOfDay(date: DateStr): { loaded: boolean; quote: Quote | null }
```

Other screens link to a feature by URL: `/train`, `/train/session/:id`, `/learn`,
`/learn/reading`, `/journal`, `/review`, `/review/:weekStart`, `/progress/habit/:id`,
`/progress/weight`, `/habits/:id`, `/nutrition`, `/today`.

## 10. Decisions already made (binding)

- Phone: five-item bottom bar (Today, Learn, Train, Review, Progress); everything else behind
  the header's menu button. Desktop: left sidebar with all eleven destinations.
- **Gym** is a daily habit completed only by a finished workout session (lifting or cardio-only,
  quick-logged sessions included), with a 7-per-week target. It is never ticked by hand.
- **Cardio** is a daily habit completed by a tick or by a session that included cardio.
- **Reading** is completed by a tick or a reading session on the active book; **Learning** by a
  tick or a learning session from the queue; **Writing** by a tick or a journal entry.
- Flexible targets (hair oiling 2/week) are outside the daily score and inside the week score.
- "Next" in the learning queue is derived (the head of the queue), never stored.
- A learning session's `lane` is decided by where it was logged from: the queue → `learning`,
  the active book → `reading`.
- Meals: completion is the meal habit's tick; `meals` rows hold only the text, ate-out flag and
  time. Saving text for a meal that is not yet ticked ticks it.
- Supplements are habits with a dose. Stock tracking was dropped (it is not in the spec).
- The editing window defaults to 7 days counting today (today and the six days before).
- Weekly reviews show live numbers until the week falls outside the editing window, then the
  numbers are frozen into the row once and never recomputed.

## 11. Testing and checking your work

- `npx vitest run` — unit tests. Colocated `*.test.ts` next to the code. Repositories are tested
  against the real schema with `createDb('some-unique-name')` (fake IndexedDB is installed by
  `src/testing/setup.ts`); delete the database in `afterEach`. Builders in
  `src/testing/builders.ts` (`habit`, `version`, `ticks`, `indexOf`).
- `npx tsc -p tsconfig.app.json --noEmit` — must be clean for the files you own.
- The dev server runs on **http://localhost:5199** (already started; do not start another, and
  do not stop it). `node scripts/shot.mjs --route /learn --out shots/learn.png` screenshots a
  route in a throwaway profile (a brand-new install) — see the header of that script for
  `--viewport desktop`, `--theme light`, `--full`, `--now`, and `--seed <module>` to add rows
  through `window.__db` first. **Look at your screens** at phone and desktop width, in dark and
  light, with real-looking data and with none, and fix what you see. Screenshots go in `shots/`
  (git-ignored).
- `node scripts/acceptance.mjs` drives the three acceptance scenarios through the real screens
  (`--browser webkit` for the engine every iPhone browser uses).
- `node scripts/rehearse-migration.mjs --export <file> --chain <commits>` loads a real export into
  an old release, walks it through the given releases and then the build in `dist/`, and checks
  that every tick and every past score survived. Run it before any change under
  `src/data/migrations/` reaches `main`.
- No `console.log` left behind. No dead buttons: every control does something real and persists
  it. No fake or static data in a chart or a number.
