# Handoff: Habit Tracker (PWA, single user)

## Overview
A single-user habit tracking PWA that replaces a weekly paper sheet. Four screens — Today, Week,
Insights, Habits — plus empty and insufficient-data states. The product's reason to exist is
diagnosis: showing *where and when* discipline breaks down, not just how much was completed.

Source of truth for requirements: the product spec ("Habit Tracker — Product Requirements &
Technical Spec", v1.0, 16 Aug 2026). This document covers the *design*: layout, tokens, copy,
behaviour. Where the two disagree, the spec wins on rules and this document wins on visuals.

## About the design files
`Habit Tracker.dc.html` (+ `ios-frame.jsx`, `_ds/`) is a **design reference written in HTML** — a
working prototype of look and behaviour, not production code to copy. The task is to **recreate
these screens in the target codebase** (per spec: React + TypeScript + Vite + Tailwind + Dexie +
Chart.js) using that stack's patterns. Do not port the prototype's inline styles, its fake data
generator, or its device frame.

The prototype fakes persistence in memory and fakes 10 weeks of history with a deterministic
generator so the charts have something to show. Real data comes from IndexedDB.

## Fidelity
**High-fidelity.** Colours, type, spacing, density, copy and interaction states are final and
should be matched closely at 390 × 844. Two deliberately open items:
1. Chart ramp — built with the design system's gold ramp; the spec asked for a blue ramp. A navy
   ramp is included as an alternative (see Design tokens → chart ramps). Pick one; do not use both.
2. NS and NF need full display names from the owner.

---

## Global frame

- Canvas: 390 × 844 (iPhone). Every decision made at phone width; desktop is an afterthought.
- Top safe area: 54px reserved for the status bar. All screen headers begin below it.
- Root: single column, `background #181716`, `color #f3f2f2`, body font Lora 14px.
- Structure per screen: **fixed header** (hairline bottom border) → **scroll region** (`flex: 1;
  overflow: auto`) → **fixed bottom tab bar**. Only the middle region scrolls.
- Dark theme only in this pass. A light theme is a follow-up; keep colours in tokens so it is a
  swap, not a rewrite.

### Bottom tab bar
- Height 56px, `background #1c1b19`, top border `1px solid rgba(243,242,242,0.16)`.
- Four equal items: Today, Week, Insights, Habits. Each = 19px Lucide-style icon (stroke 1.5,
  currentColor) above an 10.5px Cormorant label, letter-spacing 0.06em, 4px gap.
- Active `#e1ad66`; inactive `rgba(243,242,242,0.42)`.
- Icons used: Today = three unequal horizontal lines (list); Week = calendar grid with two column
  rules; Insights = bar chart; Habits = list with leading dots. Substitute the real Lucide set
  (`list`, `calendar-days`, `bar-chart-3`, `list-ordered`).

---

## Screens

### 1. Today (default screen)
**Purpose:** log the day in seventeen taps and nothing else.

**Header** (padding 8px 16px 12px, bottom hairline `rgba(243,242,242,0.14)`):
- Row: `‹` button (44 × 44) — centred date block — `›` button (44 × 44). Chevrons are Cormorant
  22px; enabled `#e1ad66`, disabled `rgba(243,242,242,0.18)`. Back limit 6 days; no future dates.
- Date block: Cormorant 18px `Sunday 16 August`, below it a 10.5px uppercase sub-label,
  letter-spacing 0.12em, `rgba(243,242,242,0.45)` reading `Today` / `Yesterday` / `N days back`.
- Score: Cormorant 36px tabular figures `12/17`, then 11.5px `so far` (today) or `recorded`
  (past day) in `rgba(243,242,242,0.5)`. Denominator = habits active on that date, computed per
  day, never hardcoded.
- Progress rule: 2px track `rgba(243,242,242,0.12)`, fill `#e1ad66` at score%. No radius.

**Habit rows** (the scroll region):
- One row per habit active on that date, in `sort_order`. `min-height 46px`, padding `0 16px`,
  bottom hairline `rgba(243,242,242,0.09)`. **The whole row is the tap target** — no checkbox hit
  area. 46px keeps 17 rows to roughly one scroll while clearing the 44px minimum.
- Left: 20 × 20 tick box, `border-radius 2px`. Unticked: `1px solid rgba(243,242,242,0.32)`,
  transparent. Ticked: filled `#e1ad66` with a 12px `#181716` check (stroke 3.2, round caps).
- Middle: full habit name, 14px, single line, ellipsis. `#f3f2f2` when done, else
  `rgba(243,242,242,0.72)`.
- Right: 9.5px uppercase state label, letter-spacing 0.1em — **polarity-aware**:
  `do` → `done` / `pending` / `missed`; `abstain` → `held` / `pending` / `broken`.
  Done `rgba(225,173,102,0.85)`; pending `rgba(243,242,242,0.3)`; missed/broken
  `rgba(243,242,242,0.5)`.
- Done row background: `rgba(225,173,102,0.06)`.
- Today shows unticked habits as **pending**, never as failures. Past days show them as
  missed/broken with no entry required.
- Tick is optimistic: state flips immediately, the Dexie write follows. No confirmation dialog,
  no blocking animation, no toast.

**Empty / first-day state:** above the rows, a 11.5px note in `rgba(243,242,242,0.5)` with a
bottom hairline: "First day logged. Nothing to compare against yet — Insights unlocks as history
accumulates." Rows themselves render normally, all pending.

### 2. Week
**Purpose:** the paper sheet, digitally — review plus fast catch-up entry.

- Header: same chevron pattern, Cormorant 17px `10–16 August`, sub-label `This week` /
  `N weeks back`. Forward disabled at the current week.
- Grid: `grid-template-columns: 104px repeat(7, 1fr)`, gap 3px, padding `10px 12px 16px`.
  - Column heads: 9.5px uppercase Mon–Sun; today's column head `#e1ad66`, others
    `rgba(243,242,242,0.45)`.
  - Row label: habit `short_name`, 11px, ellipsis, `rgba(243,242,242,0.72)`.
  - Cell: 26px tall, radius 2px. Empty: `1px solid rgba(243,242,242,0.18)`. Ticked: filled
    `#e1ad66` + 11px dark check. Future: border `rgba(243,242,242,0.08)`, not tappable.
  - **Edit lock:** cells are tappable only within the last 7 days (today back to today−6);
    outside that window the cell renders read-only with `cursor: default` and no press state.
- Score row: separated by a top hairline, 9.5px uppercase `Score` label, then per-day Cormorant
  12px tabular `12/17`; today gold, past days `rgba(243,242,242,0.6)`, future `—` at
  `rgba(243,242,242,0.2)`.
- Below a `.hr` hairline: **Weight (kg)** — 132px field, 40px min-height, transparent, `1px solid
  rgba(243,242,242,0.2)`, radius 4px, Cormorant 20px tabular value; helper text at
  `rgba(243,242,242,0.4)`: "End of week. One decimal. Trend chart needs six weeks."
- **Notes** — full-width textarea, min-height 74px, Lora 12.5px/1.5, same border treatment,
  placeholder "What changed this week."
- Both write to `weekly_records` keyed on the Monday of the displayed week.

### 3. Insights
**Purpose:** four charts, stacked vertically, each with a one-line plain-language reading.

Header: Cormorant 22px `Insights` with a 10.5px uppercase sub-label showing history depth
("10 weeks recorded" / "5 days recorded"). Scroll region padding `14px 16px 20px`; sections
separated by `.hr` hairlines at 20px margins.

Each section: gold 10.5px uppercase kicker (`A · Habit × weekday`), Cormorant 16px question
headline, then the chart, then the reading paragraph at 12px/1.5 `rgba(243,242,242,0.62)`.

**Data sufficiency guard** — when history is short, replace the chart (not just gray it) with a
bordered block: `1px solid rgba(243,242,242,0.16)`, radius 4px, padding 14px, 12px text at
`rgba(243,242,242,0.55)`, stating the requirement and what exists, e.g.
"2 more weeks of logging before weekday patterns are reliable. Needs 3 complete weeks; 5 days
recorded." Never render a confident-looking chart on thin data.

- **A · Habit × weekday** (highest priority). Heatmap: `grid-template-columns: 96px repeat(7,1fr)`,
  gap 3px, 18px cells, radius 2px. Column heads M T W T F S S at 9px. Cell value = completion
  rate for that habit on that weekday across all recorded weeks. Five-step sequential ramp,
  darker/deeper = higher; no-data cells `rgba(243,242,242,0.03)`. Legend: `0%` — five swatches
  (22 × 8) — `100%`. Reading names the worst habit/weekday pair. Minimum: 3 complete weeks.
- **B · Daily score trend.** SVG line chart, viewBox `0 0 340 128`, three horizontal gridlines
  (`rgba(243,242,242,0.1)`, baseline `0.16`). Raw daily line: 1px `rgba(243,242,242,0.3)`. 7-day
  rolling average: 2px `#e1ad66`, `stroke-dasharray 7 4` — distinguished by dash *and* colour.
  Axis labels 9.5px (start date, `100%`, end date) and a two-item legend. Reading states the
  current average and the change on two weeks ago. Minimum: 14 days.
- **C · Habit completion ranked.** Horizontal bars, weakest at top:
  `grid-template-columns: 96px 1fr 34px`, 12px bar height, track `rgba(243,242,242,0.07)`, fill
  stepped by band (<50% / <75% / ≥75% take ramp steps 2 / 4 / 5), value as right-aligned tabular
  percentage. Reading names the weakest habit. Minimum: 14 days.
- **D · Streaks.** Compact table: `1fr 48px 48px`, uppercase 9px head row (Habit / Now / Best),
  rows 7px vertical padding with hairline separators, Cormorant 15px tabular figures. Current
  streak ≥ 5 days renders gold, else `rgba(243,242,242,0.8)`. Sorted by current streak desc.
  Footnote: "Days, counted to yesterday — today stays pending until logged." No minimum data.

Not to be built, ever: radar, pie/donut, a full pairwise correlation matrix, per-habit detail
pages. Charts E–H come after 8 weeks of real data.

### 4. Habits
**Purpose:** manage the list without ever destroying history.

- Header: Cormorant 22px `Habits`, sub-label `17 active · 0 retired`, and a right-aligned
  outlined `+ New` button (36px min-height, `1px solid #e1ad66`, gold Cormorant 13px). Toggles to
  `Close`.
- Add form (expands under the header, background `rgba(243,242,242,0.03)`, bottom hairline): name
  input (42px min-height), then `Add habit` (gold outline, flex 1) + `Cancel` (neutral outline).
  Helper: "Starts counting from today. Earlier days are never counted as misses."
- Habit rows: 52px min-height, padding `6px 16px`, hairline separators.
  - Left: 6-dot drag handle, `rgba(243,242,242,0.28)`, `cursor: grab` — drag to reorder
    (`sort_order`).
  - Middle: full name 14px; meta line 10.5px `rgba(243,242,242,0.42)` reading
    `Do · <short name>` / `Abstain · <short name>` / `Retired · <short name>`.
  - Right: `Retire` (neutral outline) or `Restore` (gold outline) — 36px min-height.
- **No delete anywhere in the UI.** Footnote spells the rule out: "Habits are never deleted.
  Retiring stops a habit appearing from today forward and removes it from the daily denominator;
  every past entry stays as recorded."
- Rename and short-name editing use the same row, tapped through to an inline edit (not shown in
  the prototype — match the add-form treatment).

---

## Interactions & behaviour
- Tab switching is instant, no transition. Each tab keeps its own scroll position.
- Tick / cell toggle: immediate optimistic state flip, then persist. No animation that blocks the
  next tap, no confetti, no streak flames, no motivational copy.
- Date navigation clamps: Today back 6 days, no future; Week no future week.
- Editing history is allowed for the previous 7 days only; beyond that, read-only.
- Retiring recomputes today's denominator immediately; past scores never change.
- Hover is irrelevant on device; provide a pressed state on rows and cells (accent tint one step
  past base — `#c28d41` fill / `rgba(225,173,102,0.12)` row tint).
- Keyboard focus (desktop dev): `2px solid #e1ad66`, `outline-offset: 2px`. Never the browser
  default ring.
- Offline: the app must work with no network. No spinners on local reads; render from Dexie
  synchronously where possible.

## State
Screen-level: `tab`, `dayOffset` (0…−6), `weekOffset` (≤ 0), add-form open + draft name.
Data-level (Dexie): `habits`, `entries`, `weekly_records`. Derived per render: active habits for a
date, daily score, weekday rate grid, all-time rate per habit, current/longest streak.

Rules a coding agent will otherwise re-decide every session — put these in `CLAUDE.md`
(see the included `CLAUDE.md` draft): the stack, the retirement rule, the local-date rule
(YYYY-MM-DD local strings, IST — never UTC), and the scoring rules.

## Design tokens
Ground `#181816` (app), `#1c1b19` (tab bar); ink `#f3f2f2`; accent gold `#e1ad66`.
Text alphas on the dark ground: 0.72 primary rows, 0.62 readings, 0.5 secondary, 0.45 labels,
0.42 inactive, 0.3 pending. Hairlines: `rgba(243,242,242,0.16)` structural,
`0.14` header/section, `0.09` list rows, `0.07` sub-rows.

Type: Cormorant Garamond (figures, headings, buttons, labels) 36 / 22 / 18 / 17 / 16 / 15 / 13 /
12 / 10.5px; Lora (rows, prose) 14 / 12.5 / 12 / 11.5 / 11 / 10.5px. Tabular figures
(`font-feature-settings: 'tnum'`) on every number that stands as a figure. Weight caps at
semibold; display sizes take the normal cut. No sans-serif anywhere.

Radius: 2px (ticks, cells, swatches), 4px (fields, buttons, guard blocks).
Spacing follows the design system's 4.6 / 9.2 / 13.8 / 18.4 / 27.6 / 36.8 scale, rounded to the
values quoted per screen above.

Chart ramps (five steps, sequential, plus a no-data step):
- Gold (as built): `#4b3208`, `#7d5411`, `#a06f24`, `#c28d41`, `#e1ad66`; no-data
  `rgba(243,242,242,0.03)`.
- Navy (spec's request): `#1b3352`, `#215079`, `#2c6a99`, `#4a8cbb`, `#84b7da`.
Single ramp only. Reserve any second colour for genuine semantic meaning.

## Assets
None. All icons are drawn as inline SVG stand-ins — replace with real Lucide icons
(https://lucide.dev). No images, no fonts beyond Cormorant Garamond + Lora (Google Fonts).

## Files
- `Habit Tracker.dc.html` — the prototype: all four screens, live interactions, the three data
  states (10 weeks / 5 days / first day), and the alternative chart ramp.
- `ios-frame.jsx` — device bezel used to present the prototype. Not part of the app.
- `_ds/` — the Classical design system stylesheet the prototype's tokens come from.
- `CLAUDE.md` — drop this at the repo root; it carries the four rules above.

Open the prototype in a browser and interact with it before implementing — the density and the
tap-target behaviour read differently live than they describe.
