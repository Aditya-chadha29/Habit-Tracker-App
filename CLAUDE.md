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

## Design
Implement from `design_handoff_habit_tracker/README.md` and the HTML prototype it lists. Dark,
mobile-first at 390 × 844, navigation at the bottom, 44px minimum tap targets, single sequential
chart ramp. No confetti, no streak flames.

**Motivational copy** was originally banned outright here too. As of 2026-09-04, the user
deliberately asked for a "quote of the day" on the Today screen (`src/lib/quotes.ts`) — a real,
intentional exception, not scope creep. Keep it to that one place: a single quiet line, not
banners, toasts, or copy scattered through the rest of the UI. The rest of the app's tone (no
confetti, no streak flames, scores reported neutrally) still stands.

## Notes: daily vs weekly
Two separate concepts, don't conflate them:
- **Daily notes** (`daily_notes` table, `date` primary key) — free-form journaling tied to a
  specific day, edited on the Today screen (same 7-day-back navigation window as ticking habits).
  Added 2026-09-04 for exactly this: "even if it is me just complaining or giving reasoning for
  some habit not being followed."
- **Weekly notes** (`weekly_records.notes`) — the original end-of-week reflection field on the
  Week screen, alongside that week's weight entry. Predates daily notes; still there, still
  weekly, not replaced by it.
