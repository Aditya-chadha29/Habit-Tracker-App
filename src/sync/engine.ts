import { useSyncExternalStore } from 'react'
import { onLocalChange } from '../data/changes'
import { db } from '../data/db'
import { runMigrations } from '../data/migrations'
import { toLocalDateStr } from '../engine/dates'
import { readStoredTheme } from '../state/theme'
import { browserStore } from './state'
import { syncOnce, type Choice, type CloudMeta, type LocalSummary } from './sync'

/**
 * Keeps this device and the cloud copy in step: saves a little after something changes, looks
 * for a newer copy when the app opens or comes back to the front, and stops to ask when the two
 * have gone different ways. The pure rules are in sync.ts; this file is the timing around them.
 */
export type Phase = 'starting' | 'signed-out' | 'syncing' | 'synced' | 'waiting' | 'choose' | 'blocked' | 'error'

export interface SyncStatus {
  phase: Phase
  email: string | null
  syncedAt: number | null
  message: string | null
  choose: { cloud: CloudMeta; local: LocalSummary } | null
}

type Firebase = typeof import('./firebase')

/** Long enough that ticking through a routine is one save, not ten. */
const SAVE_DELAY_MS = 4000
/** Written once a day by the app itself, never by the person; not a reason to save. */
const QUIET_TABLES = new Set(['quote_days'])

const store = browserStore()
const listeners = new Set<() => void>()
let status: SyncStatus = { phase: 'starting', email: null, syncedAt: store.read().synced_at, message: null, choose: null }
let firebase: Promise<Firebase> | null = null
let user: { uid: string; email: string | null } | null = null
let started = false
let changes = 0
let timer: ReturnType<typeof setTimeout> | null = null
let running: Promise<void> | null = null
let again = false

function set(patch: Partial<SyncStatus>): void {
  status = { ...status, ...patch }
  for (const listener of listeners) listener()
}

const load = (): Promise<Firebase> => (firebase ??= import('./firebase'))

async function afterPull(): Promise<boolean> {
  // A copy saved by an older version of the app is brought up to date straight away.
  const now = new Date()
  const result = await runMigrations({ db, today: toLocalDateStr(now), now: now.getTime(), theme: readStoredTheme() })
  return result.ran.length > 0
}

async function pass(choice?: Choice): Promise<void> {
  if (!user) return
  const api = await load()
  set({ phase: 'syncing', message: null })
  try {
    const now = new Date()
    const outcome = await syncOnce({
      db,
      cloud: api.cloud,
      uid: user.uid,
      store,
      today: toLocalDateStr(now),
      now: now.getTime(),
      changeCount: () => changes,
      choice,
      afterPull,
    })
    if (outcome.kind === 'choose') set({ phase: 'choose', choose: { cloud: outcome.cloud, local: outcome.local } })
    else if (outcome.kind === 'blocked') set({ phase: 'blocked', message: outcome.message, choose: null })
    else set({ phase: store.read().dirty ? 'waiting' : 'synced', syncedAt: store.read().synced_at, choose: null })
  } catch (error) {
    console.error('Cloud copy', error)
    if (api.isOffline(error)) set({ phase: 'waiting', message: 'No connection. It will be saved when there is one.' })
    else set({ phase: 'error', message: api.describeError(error) })
  }
}

/** One pass at a time; a request made during a pass runs one more straight after it. */
export function syncNow(choice?: Choice): Promise<void> {
  if (running) {
    if (choice === undefined) again = true
    return running
  }
  running = pass(choice).finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    if (status.phase !== 'choose') void syncNow()
  }, SAVE_DELAY_MS)
}

export function startSync(): void {
  if (started) return
  started = true

  onLocalChange((table) => {
    if (QUIET_TABLES.has(table)) return
    changes += 1
    if (!store.read().dirty) store.write({ dirty: true })
    if (!user) return
    if (status.phase === 'synced') set({ phase: 'waiting' })
    schedule()
  })

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!user || status.phase === 'choose') return
      // Leaving: save what is waiting now. Coming back: look for a newer copy.
      if (document.visibilityState === 'visible' || store.read().dirty) void syncNow()
    })
    window.addEventListener('online', () => {
      if (user && status.phase !== 'choose') void syncNow()
    })
  }

  load()
    .then((api) =>
      api.watchUser((next) => {
        user = next
        if (!next) {
          set({ phase: 'signed-out', email: null, message: null, choose: null })
          return
        }
        set({ email: next.email })
        void syncNow()
      }),
    )
    .catch((error: unknown) => {
      console.error('Cloud copy could not start', error)
      started = false
      set({ phase: 'error', message: 'The cloud copy could not be loaded. Check the connection, then open this screen again.' })
    })
}

async function attempt(work: (api: Firebase) => Promise<void>): Promise<string | null> {
  try {
    const api = await load()
    try {
      await work(api)
      return null
    } catch (error) {
      return api.describeError(error)
    }
  } catch {
    return 'The cloud copy could not be loaded. Check the connection.'
  }
}

/** Each returns null when it worked, or a sentence saying why it did not. */
export const signInWithGoogle = (): Promise<string | null> => attempt((api) => api.signInWithGoogle())
export const signInWithEmail = (email: string, password: string): Promise<string | null> => attempt((api) => api.signInWithEmail(email, password))
export const createAccount = (email: string, password: string): Promise<string | null> => attempt((api) => api.createAccount(email, password))
export const sendPasswordReset = (email: string): Promise<string | null> => attempt((api) => api.sendPasswordReset(email))
export const signOutOfCloud = (): Promise<string | null> => attempt((api) => api.signOutOfCloud())

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, () => status)
}
