# Habit Tracker — project rules

Single-user habit tracking PWA. No accounts, no sync, no notifications, no gamification, no AI
coaching. Offline-first.

## Stack (do not substitute)
React + TypeScript · Vite with `vite-plugin-pwa` · Tailwind CSS · IndexedDB via Dexie (not
localStorage) · Chart.js (one charting library only) · hosted on Vercel or Netlify over HTTPS.

## Retirement — habits are never deleted
Setting `retired_on` stops a habit appearing on Today from that date forward and removes it from
the daily denominator; all historical entries are preserved. **Do not offer delete in the UI at
all** — only "retire" and "un-retire". Deleting silently recalculates every past daily score and
turns history into fiction.

A habit is active on date D when `created_on <= D` and (`retired_on` is null or `retired_on > D`).

## Dates and timezone
All dates are **local calendar dates stored as `YYYY-MM-DD` strings**. Never store UTC timestamps
and never derive a date from a `Date` object without pinning to local time. The user is in IST
(UTC+5:30); a naive UTC conversion shifts everything before 05:30 into the previous day, which
corrupts the 4 AM wake-up habit specifically. Week starts Monday.

## Scoring
- Daily score = count of `done: true` ÷ count of habits active on that date. Display as `12/17`
  with the denominator computed per day, never hardcoded.
- A missing entry on a past date counts as not done; no entry is required to record a miss.
- Today's unticked habits are **pending**, not failures; today's score reads "12/17 so far".
- Editing history is allowed for the previous 7 days only. Beyond that the record is locked.
- Days before a habit's `created_on` are excluded from its denominator entirely — never misses.

## Polarity
`polarity: 'do' | 'abstain'`. Mechanically identical (one tick, counts the same). It exists so
copy reads correctly: for `abstain`, `done: true` means "successfully abstained" — label these
**held / broken**, never completed / missed.

## Sections and navigation (2026-10-06)
Seven sections: **Home, Today, Gym, Food, Week, Insights, Habits**. There is **no tab bar** — Home
is both the dashboard and the launcher (section cards + two charts), every other screen has a back
chevron to Home and a grid button opening the section sheet (`src/components/SectionMenu.tsx`).
Habits (add/retire/reorder + theme toggle) is reached from the gear on Home.

**Gym** (`screens/GymScreen.tsx`, `components/gym/*`) logs sessions set by set: routines are
templates that *copy* their rows into a session at start, each set is prefilled from the last time
that exercise was actually performed, and one tap on the tick logs it. Finishing a session ticks
the `Gym` habit for that date in the same transaction. The rest timer is timestamp-derived and
foreground-only — an offline iOS PWA **cannot** notify with the screen locked, so never imply it
can. `e1rm`/`volumeLoad`/`isHardSet`/`setsByMuscle` live in `derive.ts`; e1RM returns null above 12
effective reps rather than printing a number the formula can't support.

**Changing the starter lists later:** seeds only fire into an empty table, so an install that has
been running for weeks never sees them. Put such changes in `src/lib/setupPatches.ts`
(`applyPendingSetup`, run from `main.tsx` on every start). It must stay idempotent by checking the
data itself — never a "has run" flag — so it cannot duplicate rows or undo the user's own edits.

**Food** (`screens/FoodScreen.tsx`) is a plain meal log, by explicit choice: four free-text boxes a
day (`meals`, keyed `[date+slot]`) with an "ate out" tick. No calories, no macros, no food library.
Supplements sit below it with dose, schedule and optional stock; ticking one adjusts stock in the
same transaction. The seeded `Creatine` habit is retired when supplements first seed, so one action
is never recorded twice.

## Design
Implement from `design_handoff_habit_tracker/README.md` and the HTML prototype it lists. Dark by
default, mobile-first at 390 × 844, 44px minimum tap targets, single sequential chart ramp. No
confetti, no streak flames.

**Palette (2026-10-06):** blue, not the original gold/brown — the accent token is now `accent`
(`--color-accent`, was `gold`) with `accent-pressed` and `on-accent`. System/Light/Dark only; four
style themes were tried on 2026-09-14 and removed the same day as not worth the upkeep. Chart and
heatmap colours are in `CHART_PALETTE` (`src/lib/themeOptions.ts`, **not** `theme.tsx`).

**Habit × weekday heatmap:** the five ramp steps alone were unreadable, so each cell now also
prints its percentage (`rampStep`/`rampTextColor`), and no-data cells are dashed outlines rather
than a sixth shade.

**Motivational copy** was originally banned outright here too. As of 2026-09-04, the user
deliberately asked for a "quote of the day" on the Today screen (`src/lib/quotes.ts`) — a real,
intentional exception, not scope creep. Keep it to that one place: a single quiet line, not
banners, toasts, or copy scattered through the rest of the UI. The rest of the app's tone (no
confetti, no streak flames, scores reported neutrally) still stands.

**Gamification** stays fully banned per the top line. A "+1 fly-to-counter" tap animation was
tried on 2026-09-04 and reverted the same day — the user preferred the app without it. Just the
existing tick-pop/checkmark-draw acknowledgment remains; don't reintroduce a flying/XP-style
effect without the user asking again.

## Notes: weekly only
A daily-notes field (`daily_notes` table) was added 2026-09-04 then reverted the same day — the
user tried it and preferred a single notes field. The table and its helpers
(`setDailyNote`/`useDailyNoteForDate`) are left in place unused rather than migrated out, since
nothing was ever written to it. **Weekly notes** (`weekly_records.notes`) is the one notes field:
end-of-week reflection on the Week screen, alongside that week's weight entry.
