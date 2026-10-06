// Gives Node an in-memory IndexedDB, so the real Dexie schema and the real repositories run in
// tests exactly as they do in a browser.
import 'fake-indexeddb/auto'
