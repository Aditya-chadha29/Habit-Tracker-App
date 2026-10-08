/**
 * What this device remembers about the cloud copy: whose it is, which revision it last matched,
 * and whether anything has changed here since. Kept outside the database on purpose, so it is
 * never part of an export and never travels to another device.
 */
export interface SyncState {
  uid: string | null
  /** The cloud revision this device last matched. Null until it has matched one. */
  rev: number | null
  /** Something changed here since that revision. */
  dirty: boolean
  synced_at: number | null
  device: string
}

export interface StateStore {
  read(): SyncState
  write(patch: Partial<SyncState>): SyncState
}

const KEY = 'ikikata-cloud-copy'

function deviceLabel(): string {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone/.test(agent)) return 'iPhone'
  if (/iPad/.test(agent)) return 'iPad'
  if (/Android/.test(agent)) return 'Android'
  if (/Windows/.test(agent)) return 'Windows'
  if (/Mac/.test(agent)) return 'Mac'
  return 'Browser'
}

const blank = (device: string): SyncState => ({ uid: null, rev: null, dirty: true, synced_at: null, device })

export function memoryStore(initial: Partial<SyncState> = {}): StateStore {
  let state: SyncState = { ...blank('Test device'), ...initial }
  return {
    read: () => state,
    write: (patch) => (state = { ...state, ...patch }),
  }
}

/** localStorage can be unavailable (private windows); the copy then simply is not remembered. */
export function browserStore(): StateStore {
  let state: SyncState = blank(deviceLabel())
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SyncState> | null
    if (stored && typeof stored === 'object') state = { ...state, ...stored }
  } catch {
    // Start from blank.
  }
  return {
    read: () => state,
    write(patch) {
      state = { ...state, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(state))
      } catch {
        // Remembered for this visit only.
      }
      return state
    },
  }
}

/** True when this device has been signed in to a cloud copy before, without loading anything. */
export function hasCloudAccount(): boolean {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SyncState> | null
    return Boolean(stored && stored.uid)
  } catch {
    return false
  }
}
