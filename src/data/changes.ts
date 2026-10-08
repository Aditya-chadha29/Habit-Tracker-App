/**
 * Tells whoever is listening that the record on this device changed. The cloud copy listens, so
 * it knows there is something to save. Nothing here reads or writes data.
 */
type Listener = (table: string) => void

const listeners = new Set<Listener>()
let muted = 0

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyLocalChange(table: string): void {
  if (muted > 0) return
  for (const listener of listeners) listener(table)
}

/** Runs work whose writes are not the user's own: a copy arriving from the cloud, a data update. */
export async function withoutChangeNotices<T>(work: () => Promise<T>): Promise<T> {
  muted += 1
  try {
    return await work()
  } finally {
    muted -= 1
  }
}
