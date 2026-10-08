import { withoutChangeNotices } from '../data/changes'
import type { AppDb } from '../data/db'
import { applyImport, buildExport, prepareImport } from '../data/importExport'
import type { DateStr } from '../data/types'
import { pack, unpack, type Encoding } from './codec'
import type { StateStore } from './state'

/**
 * The cloud copy is the whole record, saved as one revision at a time. A device that changed
 * saves a new revision; a device that did not change takes a newer one. When both changed, or
 * when a device with its own history meets a cloud copy for the first time, nothing is replaced
 * until the person says which to keep.
 */
export interface CloudMeta {
  rev: number
  /** Names the stored parts of this revision. */
  id: string
  chunks: number
  encoding: Encoding
  bytes: number
  updated_at: number
  device: string
  /** How many ticks the copy holds, to show when a choice is needed. */
  entries: number
  /** The copy holds nothing the person entered. */
  empty: boolean
  /** The revision before this one, kept in the cloud until the next save. */
  previous: { id: string; chunks: number } | null
}

export interface Cloud {
  readMeta(uid: string): Promise<CloudMeta | null>
  readChunks(uid: string, meta: CloudMeta): Promise<Uint8Array[]>
  /** Saves a revision only if the cloud is still at `expectedRev`. */
  write(uid: string, expectedRev: number | null, meta: Omit<CloudMeta, 'previous'>, chunks: Uint8Array[]): Promise<'ok' | 'stale'>
}

export interface LocalSummary {
  entries: number
  empty: boolean
}

export type Choice = 'device' | 'cloud'
export type Action = 'idle' | 'push' | 'pull' | 'choose'

export type Outcome =
  | { kind: 'idle' | 'pushed' | 'pulled'; rev: number | null }
  | { kind: 'choose'; cloud: CloudMeta; local: LocalSummary }
  | { kind: 'blocked'; message: string }

export interface SyncDeps {
  db: AppDb
  cloud: Cloud
  uid: string
  store: StateStore
  today: DateStr
  now: number
  /** Goes up every time the record changes here; compared before and after a save. */
  changeCount: () => number
  choice?: Choice
  backupName?: string
  /** Runs after a copy has been taken from the cloud. Returns true if it changed the record. */
  afterPull?: () => Promise<boolean>
  newId?: () => string
}

/** Tables that only ever hold what the person entered. */
const ENTERED = ['entries', 'sessions', 'meals', 'journal_entries', 'weight_entries', 'learning_sessions', 'supplement_logs', 'weekly_reviews']

export async function summarise(db: AppDb): Promise<LocalSummary> {
  let total = 0
  for (const name of ENTERED) total += await db.table(name).count()
  return { entries: await db.entries.count(), empty: total === 0 }
}

export function decide(input: {
  cloudRev: number | null
  cloudEmpty: boolean
  localRev: number | null
  dirty: boolean
  localEmpty: boolean
  choice?: Choice
}): Action {
  const { cloudRev, cloudEmpty, localRev, dirty, localEmpty, choice } = input
  if (cloudRev === null) return 'push'
  if (choice === 'device') return 'push'
  if (choice === 'cloud') return 'pull'
  if (localRev === null) {
    if (localEmpty) return 'pull'
    return cloudEmpty ? 'push' : 'choose'
  }
  if (cloudRev === localRev) return dirty ? 'push' : 'idle'
  if (cloudRev < localRev) return localEmpty ? 'pull' : 'push'
  // The cloud is ahead of this device.
  if (dirty) return cloudEmpty ? 'push' : 'choose'
  return cloudEmpty && !localEmpty ? 'choose' : 'pull'
}

const randomId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

export async function syncOnce(deps: SyncDeps, attempt = 0): Promise<Outcome> {
  let state = deps.store.read()
  if (state.uid !== deps.uid) state = deps.store.write({ uid: deps.uid, rev: null, dirty: true, synced_at: null })

  const meta = await deps.cloud.readMeta(deps.uid)
  const local = await summarise(deps.db)
  const action = decide({
    cloudRev: meta?.rev ?? null,
    cloudEmpty: meta?.empty ?? true,
    localRev: state.rev,
    dirty: state.dirty,
    localEmpty: local.empty,
    choice: deps.choice,
  })

  if (action === 'idle') return { kind: 'idle', rev: state.rev }
  if (action === 'choose') return { kind: 'choose', cloud: meta!, local }

  if (action === 'push') {
    const before = deps.changeCount()
    const packed = await pack(JSON.stringify(await buildExport(deps.db, deps.today)))
    const rev = (meta?.rev ?? 0) + 1
    const result = await deps.cloud.write(
      deps.uid,
      meta?.rev ?? null,
      {
        rev,
        id: (deps.newId ?? randomId)(),
        chunks: packed.chunks.length,
        encoding: packed.encoding,
        bytes: packed.bytes,
        updated_at: deps.now,
        device: state.device,
        entries: local.entries,
        empty: local.empty,
      },
      packed.chunks,
    )
    if (result === 'stale') {
      // Another device saved in between. Look again, without the earlier choice: it was made
      // about a copy that is no longer the one in the cloud.
      if (attempt >= 1) throw new Error('The cloud copy changed while this was being saved. Try again.')
      return syncOnce({ ...deps, choice: undefined }, attempt + 1)
    }
    deps.store.write({ rev, dirty: deps.changeCount() !== before, synced_at: deps.now })
    return { kind: 'pushed', rev }
  }

  const text = await unpack(meta!.encoding, await deps.cloud.readChunks(deps.uid, meta!))
  const prepared = await prepareImport(text, deps.db, deps.today, deps.now)
  if (!prepared.ok) {
    const problem = prepared.problems.find((item) => item.level === 'error')
    return { kind: 'blocked', message: problem?.message ?? 'The cloud copy could not be read.' }
  }
  let changed = false
  await withoutChangeNotices(async () => {
    await applyImport(deps.db, prepared, 'replace', deps.today, deps.now, deps.backupName)
    changed = (await deps.afterPull?.()) ?? false
  })
  deps.store.write({ rev: meta!.rev, dirty: changed, synced_at: deps.now })
  return { kind: 'pulled', rev: meta!.rev }
}
