# Personal OS

A private, single-user, offline-first app for running a personal routine: daily habits and
routines, weekly targets, learning, training, journal, weekly review and long-term progress.
Everything lives in the browser's IndexedDB on the device. There are no accounts, no server and no
notifications.

It grew out of the earlier Habit Tracker and upgrades that app's data in place.

- `CLAUDE.md` - the rules of the project
- `docs/product-spec.md` - what the app is meant to be, in the owner's words
- `docs/ARCHITECTURE.md` - how it is put together, and the rules that keep history safe
- `docs/BUILD_LOG.md` - where the build stands

## Stack

React + TypeScript, Vite with `vite-plugin-pwa`, Tailwind CSS, Dexie (IndexedDB), Chart.js.

## Development

```
npm install
npm run dev          # the app
npm test             # unit and repository tests (Vitest, in-memory IndexedDB)
npm run build        # type-check and production build
```

## Checking it in a real browser

With the dev server on port 5199 (`npx vite --port 5199 --strictPort`):

```
node scripts/shot.mjs --route /today --seed scripts/seeds/home.mjs --out shots/today.png
node scripts/acceptance.mjs                      # the three acceptance scenarios, through the UI
node scripts/acceptance.mjs --browser webkit     # the same in Safari's engine
```

Rehearsing the upgrade from an old release with real data (reads `dist/`, so build first):

```
npm run build
node scripts/rehearse-migration.mjs --export "Exported Data/<file>.json" --chain f9640b1,02634a2
```

`Exported Data/` is ignored by git: an export is personal data and never belongs in the repository.
