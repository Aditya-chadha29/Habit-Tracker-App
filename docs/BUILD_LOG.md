# Build log — Personal OS

Running record of the overnight build that turns the Habit Tracker into the Personal OS described
in `docs/product-spec.md`. If a session is interrupted, **read this first**, then
`docs/ARCHITECTURE.md`, then continue from "Next step".

Working rules: this repo only (never `Habit Tracker (V2)`); work on branch `personal-os`; `main`
auto-deploys to the user's phone, so nothing reaches `main` until the migration rehearsal and the
end-to-end checks pass; commits carry no attribution lines; do not ask the user questions.

## Status

| Part | State |
|---|---|
| Spec and designs recovered into `docs/` | done |
| Data model, Dexie v4, repositories for habits/settings/backups | done |
| Engine: dates, timeline, completion, targets, score, status, streaks, lock, training | done, tested |
| Cutover migration + rehearsal against the real phone export (both starting states) | done, tested |
| App shell: router, sidebar / bottom bar, CoreProvider, SafeMode, tokens | done |
| UI kit | in progress |
| Today / Home / Nutrition / area screens | in progress |
| Train | in progress |
| Learn | in progress |
| Review | in progress |
| Progress | in progress |
| Journal, Quotes | in progress |
| Habits setup, Routines, Settings, Data import/export | in progress |
| End-to-end acceptance tests (hair oiling, gym, learning queue) | not started |
| Visual QA phone + desktop, dark + light | not started |
| CLAUDE.md, memory, merge to main, deploy, verify bundle hash | not started |

## Next step

See the newest entry under "Log".

## Log

- 2026-10-07 01:20 — Session resumed after the usage limit. Repo was clean at `02634a2`.
  Recovered the full spec and both design boards from the transcript into `docs/`.
- 2026-10-07 01:55 — Foundation committed (`fc3ebf6`): types, schema v4, engine, cutover
  migration. 148 tests pass, including the migration run against the real export in the two
  states the phone can be in, with every past day's score unchanged.
- 2026-10-07 02:05 — Shell boots on phone and desktop. Old UI parked in `legacy-reference/` to
  port from. Architecture brief written. Feature areas being built in parallel against it.
